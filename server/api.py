#!/usr/bin/env python3
# ============================================================
# Direct-Strike 的开发接口服务（只给开发用，游戏本身仍然不需要后端）
#
# 现在只有开发者模式用到：
#   POST /api/dev/login                    {"password": "..."} → {"token", "exp"}   密码对了发一个令牌
#   GET  /api/dev/session                  检查令牌还有没有效（请求头 Authorization: Bearer <令牌>）
#   POST /api/dev/uploads                  {"meta": {...}} → {"id"}                  新建一次上传（一个目录）
#   PUT  /api/dev/uploads/<id>/<文件名>     请求体就是文件内容                          往这次上传里放一个文件
#   GET  /api/health                       健康检查
#
# 以后的后台（玩家登录、按玩家开开发者模式）也加在 /api/ 下。令牌里的 sub 现在固定是 "dev"，
# 以后换成玩家 id 就能按人授权。
#
# 线上：fps-api 容器里跑（deploy/compose.yaml），fps-game 的 Caddy 把 /api/* 转过来。
# 本地：start.sh 用 --static 让它同时出静态文件，用法和线上一样。
#
# 配置（环境变量）：
#   DEV_PASSWORD   开发者模式的密码。线上必须设；本地没设时密码是 dev（只监听 127.0.0.1）
#   API_SECRET     签令牌用的随机串。改密码或改它，已发出去的令牌都失效
#   DATA_DIR       上传存放的目录，每次上传一个子目录
#   DATA_QUOTA_GB  目录总大小上限，超了删最旧的上传（默认 10）
# 只用 Python 标准库，不装任何依赖。
# ============================================================
import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import sys
import threading
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

TOKEN_DAYS = 30                       # 令牌有效期
MAX_FILE = 25 * 1024 * 1024           # 单个文件上限（视频一片约 1 MB，帧数据压缩后 1 ~ 3 MB）
MAX_FILES_PER_UPLOAD = 64             # 一次上传最多放几个文件
UPLOAD_OPEN_SECONDS = 3600            # 新建上传后多久内可以往里放文件
LOGIN_FAILS = 10                      # 同一个 IP 在 LOGIN_WINDOW 秒内最多输错几次
LOGIN_WINDOW = 600
CLIENT_KEYS = {'version', 'frames', 'seconds', 'fps', 'markers', 'videoSegments', 'mode'}   # meta.json 里留的客户端摘要
FILE_NAME = re.compile(r'^(frames\.json\.gz|meta\.json|seg-\d{3}\.(webm|mp4))$')
UPLOAD_ID = re.compile(r'^\d{8}-\d{6}-[0-9a-f]{6}$')


class Api:
    def __init__(self, password, secret, data_dir, quota_bytes):
        self.password = password
        # 签名的钥匙由密码和随机串一起算出来：改了密码，旧令牌自动失效
        self.key = hashlib.sha256((secret + '\0' + password).encode()).digest()
        self.data_dir = data_dir
        self.quota = quota_bytes
        self.fails = {}               # ip → [失败时间戳…]
        self.lock = threading.Lock()  # 配额清理和计数不要并发
        os.makedirs(data_dir, exist_ok=True)

    # ---------- 令牌：base64(json) + "." + HMAC ----------
    def make_token(self, sub):
        exp = int(time.time()) + TOKEN_DAYS * 86400
        body = base64.urlsafe_b64encode(json.dumps({'sub': sub, 'exp': exp}).encode()).decode().rstrip('=')
        sig = hmac.new(self.key, body.encode(), hashlib.sha256).hexdigest()
        return f'{body}.{sig}', exp

    def check_token(self, header):
        if not header or not header.startswith('Bearer '):
            return None
        token = header[7:].strip()
        body, _, sig = token.partition('.')
        good = hmac.new(self.key, body.encode(), hashlib.sha256).hexdigest()
        if not sig or not hmac.compare_digest(sig, good):
            return None
        try:
            claims = json.loads(base64.urlsafe_b64decode(body + '=' * (-len(body) % 4)))
        except ValueError:
            return None
        if claims.get('exp', 0) < time.time():
            return None
        return claims

    # ---------- 登录限流 ----------
    # 按 IP 计数只在内存里，超过 10 分钟的记录随时清掉，不落盘
    def login_blocked(self, ip):
        now = time.time()
        with self.lock:
            for k in list(self.fails):
                recent = [t for t in self.fails[k] if now - t < LOGIN_WINDOW]
                if recent: self.fails[k] = recent
                else: del self.fails[k]
            return len(self.fails.get(ip, [])) >= LOGIN_FAILS

    def login_failed(self, ip):
        with self.lock:
            self.fails.setdefault(ip, []).append(time.time())

    # ---------- 上传目录 ----------
    def new_upload(self, meta):
        uid = time.strftime('%Y%m%d-%H%M%S') + '-' + secrets.token_hex(3)
        path = os.path.join(self.data_dir, uid)
        os.makedirs(path)
        # 隐私：不记 IP；客户端给的摘要只留游戏相关的键，别的（比如旧版页面带的浏览器、显卡）丢掉
        client = {k: v for k, v in meta.items() if k in CLIENT_KEYS} if isinstance(meta, dict) else {}
        info = {'id': uid, 'received': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'client': client}
        with open(os.path.join(path, 'meta.json'), 'w', encoding='utf-8') as f:
            json.dump(info, f, ensure_ascii=False, indent=1)
        return uid

    def upload_dir(self, uid):
        if not UPLOAD_ID.match(uid):
            return None
        path = os.path.join(self.data_dir, uid)
        if not os.path.isdir(path):
            return None
        if time.time() - os.path.getctime(path) > UPLOAD_OPEN_SECONDS:
            return None
        return path

    def enforce_quota(self, keep):
        # 总大小超了就从最旧的上传开始删，正在写的这次不删
        with self.lock:
            dirs = []
            total = 0
            for name in os.listdir(self.data_dir):
                p = os.path.join(self.data_dir, name)
                if not os.path.isdir(p):
                    continue
                size = sum(os.path.getsize(os.path.join(p, f)) for f in os.listdir(p))
                dirs.append((os.path.getctime(p), p, size))
                total += size
            for _, p, size in sorted(dirs):
                if total <= self.quota:
                    break
                if os.path.basename(p) == keep:
                    continue
                shutil.rmtree(p, ignore_errors=True)
                total -= size
                print(f'配额：删除旧上传 {os.path.basename(p)}', flush=True)


def make_handler(api, static_dir):
    class Handler(SimpleHTTPRequestHandler):
        server_version = 'ds-api'
        sys_version = ''

        def __init__(self, *a, **kw):
            super().__init__(*a, directory=static_dir or '/nonexistent', **kw)

        # 本地出静态文件时和线上一样：每次都问服务器有没有变
        def end_headers(self):
            if not self.path.startswith('/api/'):
                self.send_header('Cache-Control', 'no-cache')
            super().end_headers()

        # 隐私：日志不写 IP，只写时间和请求
        def log_message(self, fmt, *args):
            if self.path.startswith('/api/'):
                sys.stderr.write('%s %s\n' % (time.strftime('%Y-%m-%d %H:%M:%S'), fmt % args))

        def client_ip(self):
            # 只用来给登录限流（内存里，10 分钟后丢掉），不写进日志和文件。
            # 线上经过两层 Caddy，真实 IP 在 X-Forwarded-For 的第一个
            fwd = self.headers.get('X-Forwarded-For')
            return fwd.split(',')[0].strip() if fwd else self.client_address[0]

        def send_json(self, status, obj):
            data = json.dumps(obj, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)

        def read_body(self, limit):
            n = self.headers.get('Content-Length')
            if n is None or not n.isdigit():
                return None, HTTPStatus.LENGTH_REQUIRED
            n = int(n)
            if n > limit:
                return None, HTTPStatus.REQUEST_ENTITY_TOO_LARGE
            return self.rfile.read(n), None

        def read_json(self):
            body, err = self.read_body(64 * 1024)
            if err:
                return None, err
            try:
                return json.loads(body or b'{}'), None
            except ValueError:
                return None, HTTPStatus.BAD_REQUEST

        def authed(self):
            claims = api.check_token(self.headers.get('Authorization'))
            if not claims:
                self.send_json(HTTPStatus.UNAUTHORIZED, {'error': '未授权或令牌已过期'})
            return claims

        def route(self):
            return urlsplit(self.path).path

        # ---------- GET ----------
        def do_GET(self):
            p = self.route()
            if p == '/api/health':
                return self.send_json(200, {'ok': True})
            if p == '/api/dev/session':
                claims = self.authed()
                if claims:
                    self.send_json(200, {'ok': True, 'sub': claims['sub'], 'exp': claims['exp']})
                return
            if p.startswith('/api/'):
                return self.send_json(404, {'error': '没有这个接口'})
            if not static_dir:
                return self.send_json(404, {'error': '只提供 /api/'})
            return super().do_GET()

        def do_HEAD(self):
            if self.route().startswith('/api/') or not static_dir:
                return self.send_json(405, {'error': '不支持'})
            return super().do_HEAD()

        # ---------- POST ----------
        def do_POST(self):
            p = self.route()
            if p == '/api/dev/login':
                ip = self.client_ip()
                if api.login_blocked(ip):
                    return self.send_json(429, {'error': '输错太多次，过 10 分钟再试'})
                body, err = self.read_json()
                if err:
                    return self.send_json(err, {'error': '请求格式不对'})
                pw = str(body.get('password', ''))
                if not hmac.compare_digest(pw.encode(), api.password.encode()):
                    api.login_failed(ip)
                    time.sleep(0.5)   # 拖慢猜密码
                    return self.send_json(403, {'error': '密码不对'})
                token, exp = api.make_token('dev')
                return self.send_json(200, {'token': token, 'exp': exp})
            if p == '/api/dev/uploads':
                if not self.authed():
                    return
                body, err = self.read_json()
                if err:
                    return self.send_json(err, {'error': '请求格式不对'})
                uid = api.new_upload(body.get('meta'))
                return self.send_json(200, {'id': uid})
            return self.send_json(404, {'error': '没有这个接口'})

        # ---------- PUT：往一次上传里放文件 ----------
        def do_PUT(self):
            m = re.match(r'^/api/dev/uploads/([^/]+)/([^/]+)$', self.route())
            if not m:
                return self.send_json(404, {'error': '没有这个接口'})
            if not self.authed():
                return
            uid, name = m.groups()
            path = api.upload_dir(uid)
            if not path:
                return self.send_json(404, {'error': '上传不存在或已关闭'})
            if not FILE_NAME.match(name) or name == 'meta.json':
                return self.send_json(400, {'error': '文件名不允许'})
            if len(os.listdir(path)) >= MAX_FILES_PER_UPLOAD:
                return self.send_json(400, {'error': '这次上传的文件太多了'})
            body, err = self.read_body(MAX_FILE)
            if err:
                return self.send_json(err, {'error': '文件太大或缺少长度'})
            tmp = os.path.join(path, f'.{name}.part')
            with open(tmp, 'wb') as f:
                f.write(body)
            os.replace(tmp, os.path.join(path, name))
            api.enforce_quota(keep=uid)
            return self.send_json(200, {'ok': True, 'bytes': len(body)})

    return Handler


def main():
    ap = argparse.ArgumentParser(description='Direct-Strike 开发接口服务')
    ap.add_argument('--bind', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8080)
    ap.add_argument('--static', help='同时出这个目录的静态文件（本地开发用）')
    ap.add_argument('--data', default=os.environ.get('DATA_DIR', os.path.expanduser('~/direct-strike-data/devlogs')))
    a = ap.parse_args()

    password = os.environ.get('DEV_PASSWORD', '')
    secret = os.environ.get('API_SECRET', '')
    if not password or not secret:
        if a.bind not in ('127.0.0.1', 'localhost'):
            sys.exit('线上运行必须设置 DEV_PASSWORD 和 API_SECRET')
        password = password or 'dev'
        secret = secret or 'local-only'
        print('提示：没有配置 DEV_PASSWORD，本地开发者模式的密码是 dev', flush=True)
    quota = float(os.environ.get('DATA_QUOTA_GB', '10')) * 1024 ** 3

    api = Api(password, secret, a.data, int(quota))
    httpd = ThreadingHTTPServer((a.bind, a.port), make_handler(api, a.static and os.path.abspath(a.static)))
    print(f'开发接口：http://{a.bind}:{a.port}/api/   数据目录：{a.data}', flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
