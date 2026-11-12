#!/usr/bin/env python3
# ============================================================
# 下载"天气 / 时段"用的天空和环境光（Poly Haven，CC0），转成游戏用的文件（#77）
#
# 用法：python3 assets-src/weather/fetch_weather.py
#   原始下载放 assets-src/weather/download/（已 gitignore，体积大，随时可重新下载）
#   成品放 assets/weather/<天气>/sky.webp：天空球贴图。4k HDRI 转成普通图片，再调色（压暗、偏冷、加对比），
#   游戏里不再做色调映射，所见即所得；同一张图也当环境光（config.js 里 env: 'sky'）。
#   不用 HDRI 本身当环境光：它的地平线有一圈亮光，雨天的水洼映出来是一块块白斑，而且多 1.2 MB。
#   以后哪个天气要单独的环境光 HDRI，放 assets/weather/<目录>/env.hdr，预设里 env 写目录名（world.js 支持）
#
# 加一种天气：在 WEATHERS 里加一项，跑一次脚本，再在 js/config.js 的 weather.presets 里加对应的预设。
# 来源登记在 assets/LICENSES.md。依赖：curl、ImageMagick（magick）
# ============================================================
import json, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
DL = os.path.join(HERE, 'download')

SKY_SIZE = '4096x2048'
QUALITY = 82

# 目录名 → (Poly Haven 资源 id, 天空调色的 ImageMagick 参数)
WEATHERS = {
    # 阴雨傍晚：夜里的厚云天空（Pure Sky，没有地面），去掉大部分饱和度、S 形加对比让云层更压抑，
    # 再按通道压暗、偏蓝（R × 0.52、G × 0.62、B × 0.78）
    'rain-dusk': ('kloppenheim_07_puresky', [
        '-modulate', '100,35', '-sigmoidal-contrast', '5,55%',
        '-channel', 'R', '-evaluate', 'multiply', '0.52',
        '-channel', 'G', '-evaluate', 'multiply', '0.62',
        '-channel', 'B', '-evaluate', 'multiply', '0.78', '+channel',
    ]),
}


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
    for name, (pid, grade) in WEATHERS.items():
        out = os.path.join(ROOT, 'assets/weather', name)
        os.makedirs(out, exist_ok=True)
        files = api(f'files/{pid}')['hdri']
        big = os.path.join(DL, f'{pid}_4k.hdr')
        download(files['4k']['hdr']['url'], big)

        sky = os.path.join(out, 'sky.webp')
        subprocess.run(['magick', big, '-resize', SKY_SIZE, '-colorspace', 'sRGB', *grade,
                        '-quality', str(QUALITY), sky], check=True)
        print('  →', os.path.relpath(sky, ROOT), os.path.getsize(sky) // 1024, 'KB')


if __name__ == '__main__':
    main()
