#!/usr/bin/env python3
# ============================================================
# 下载 yard 地图的 PBR 材质和环境光 HDRI（Poly Haven，全部 CC0），转成游戏用的文件（#50）
#
# 用法：python3 assets-src/maps/yard/fetch_textures.py
#   原始下载放 assets-src/maps/yard/download/（已 gitignore，体积大，随时可重新下载）
#   成品放 assets/maps/yard/：贴图转 WebP，HDRI 原样复制
#
# 换材质：改下面的 TEXTURES，再跑一次脚本；js/world.js 的 SURFACES 按 key 取文件，
# 贴图在现实中覆盖多大（米）也写在那里。来源登记在 assets/LICENSES.md。
# 依赖：curl、ImageMagick（magick）
# ============================================================
import json, os, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
DL = os.path.join(HERE, 'download')
OUT = os.path.join(ROOT, 'assets/maps/yard')

RES = '2k'          # 下载的分辨率（Poly Haven 提供 1k / 2k / 4k）
QUALITY = 88        # WebP 质量

# 游戏里的名字 → Poly Haven 资源 id
TEXTURES = {
    'asphalt': 'tarred_gravel',                   # 场地沥青：深灰、粗糙、有碎石的旧路面
    'concreteFloor': 'concrete_floor_damaged_01', # 水泥浇筑地块：破损、发黑
    'concrete': 'dirty_concrete',                 # 水泥墩、高台、台阶、隔离墩：脏、有污渍
    'dirt': 'dirt',                               # 围栏外的土地：棕色、纹理均匀，大面积铺开不容易看出重复
}
# 每种贴图要的通道：Poly Haven 的名字 → 输出文件后缀
MAPS = {'Diffuse': 'diff', 'nor_gl': 'nor', 'Rough': 'rough'}

HDRI = 'abandoned_parking'   # 环境光：中午、半阴的城市废墟，只用来给材质照明和反射，不当天空显示
HDRI_RES = '1k'


def api(path):
    # 用 curl 取：Python 默认的 User-Agent 会被 Poly Haven 拒绝（403）
    out = subprocess.run(['curl', '-sSf', f'https://api.polyhaven.com/{path}'], check=True, capture_output=True)
    return json.loads(out.stdout)


def download(url, dest):
    if os.path.exists(dest):
        return
    print('下载', url)
    subprocess.run(['curl', '-sSfL', '-o', dest + '.part', url], check=True)
    os.replace(dest + '.part', dest)


def main():
    os.makedirs(DL, exist_ok=True)
    os.makedirs(os.path.join(OUT, 'textures'), exist_ok=True)

    for name, pid in TEXTURES.items():
        files = api(f'files/{pid}')
        for ph, suffix in MAPS.items():
            src = os.path.join(DL, f'{pid}_{suffix}_{RES}.jpg')
            download(files[ph][RES]['jpg']['url'], src)
            dst = os.path.join(OUT, 'textures', f'{name}_{suffix}.webp')
            subprocess.run(['magick', src, '-quality', str(QUALITY), dst], check=True)
            print('  →', os.path.relpath(dst, ROOT), os.path.getsize(dst) // 1024, 'KB')

    files = api(f'files/{HDRI}')
    src = os.path.join(DL, f'{HDRI}_{HDRI_RES}.hdr')
    download(files['hdri'][HDRI_RES]['hdr']['url'], src)
    dst = os.path.join(OUT, 'env.hdr')
    shutil.copyfile(src, dst)
    print('  →', os.path.relpath(dst, ROOT), os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main()
