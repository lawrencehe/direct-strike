# ============================================================
# 音效成品生成：从原始录音里切出要用的片段，剪空白、淡出、叠层、归一化，压成单声道 mp3 放到 assets/sound/。
# 用 Blender 自带的 aud（读写音频、mp3 编码）和 numpy（剪切和混音），开发机不用另装 ffmpeg：
#   blender -b --python assets-src/sound/build.py
# 听着哪段不对，改下面 CLIPS 里的切点 / 长度 / 音量再跑一遍。来源和授权见 assets/LICENSES.md（#45）。
# ============================================================
import os
import aud
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.join(HERE, 'Prepared SFX Library')   # The Free Firearm Sound Library 的 Prepared 版（CC0，体积大，不入仓库）
SRC = os.path.join(HERE, 'source')                  # 其他小素材（CC0，入仓库）
OUT = os.path.join(HERE, '..', '..', 'assets', 'sound')
RATE = 44100
BITRATE = 96000

# 每段：src 文件，at 在这个时间之后找起音（第一个超过 trigger × 这 dur 秒内峰值的采样），dur 保留多长，
# fade 结尾淡出多长，pre 起音前留多少（秒）。layers 是叠在上面的其他片段（offset 相对起音，gain 音量）。
# 枪声文件里每个都录了好几发，at 选的是其中一发（近距 = near distance，中距 = mid distance，见素材库的 Prepared Master Sheet.csv）。
def lib(p): return os.path.join(LIB, p)
def src(p): return os.path.join(SRC, p)

CLIPS = {
    # 自己开枪：近距录音，每把枪两发，播放时随机挑
    'ak-1':      dict(src=lib('AK-47/C_28P.wav'), at=0.5, dur=0.85, fade=0.45),
    'ak-2':      dict(src=lib('AK-47/C_28P.wav'), at=3.1, dur=0.85, fade=0.45),
    'm4-1':      dict(src=lib('AR-15/D_32P.wav'), at=0.6, dur=0.85, fade=0.45),
    'm4-2':      dict(src=lib('AR-15/D_32P.wav'), at=5.5, dur=0.85, fade=0.45),
    'pistol-1':  dict(src=lib('Walther PPQ/X_39P.wav'), at=1.3, dur=0.7, fade=0.4),
    'pistol-2':  dict(src=lib('Walther PPQ/X_39P.wav'), at=6.3, dur=0.7, fade=0.4),
    # NPC 开枪：中距录音（自带远处的回声尾巴）
    'ak-far':     dict(src=lib('AK-47/C_31P.wav'), at=0.2, dur=1.4, fade=0.8),
    'm4-far':     dict(src=lib('AR-15/D_24P.wav'), at=3.8, dur=1.4, fade=0.8),
    'pistol-far': dict(src=lib('Walther PPQ/X_31P.wav'), at=1.0, dur=1.2, fade=0.7),
    # 换弹：气枪录的换弹声（Gun reload sounds）切成四个动作
    'mag-out':      dict(src=src('oga-assaultriflereload1.wav'), at=0.1, dur=0.42, fade=0.12, trigger=0.15),
    'mag-in':       dict(src=src('oga-assaultriflereload1.wav'), at=0.95, dur=0.55, fade=0.2, trigger=0.15),
    'rack-back':    dict(src=src('oga-gunreload1.wav'), at=0.75, dur=0.32, fade=0.1, trigger=0.15),
    'rack-forward': dict(src=src('oga-gunreload1.wav'), at=1.2, dur=0.4, fade=0.15, trigger=0.15),
    # 手雷：礼炮的爆响（真实录音）叠一层低频轰鸣
    'frag':  dict(src=src('oga-bang-cannon_02.ogg'), at=0, dur=2.2, fade=1.2,
                  layers=[dict(src=src('kenney-low_frequency_explosion_000.wav'), at=0, offset=0.0, gain=0.8)]),
    # 闪光弹：更短更尖的爆响
    'flash': dict(src=src('oga-bang-cannon_03.ogg'), at=0, dur=0.85, fade=0.4),
}


def load(path):
    """读成 RATE 采样率的单声道 float32 数组。"""
    s = aud.Sound(path).resample(RATE, True)
    d = s.data()
    return d.mean(axis=1).astype(np.float32) if d.ndim == 2 else d.astype(np.float32)


_cache = {}
def cut(c):
    """按 at / trigger / pre / dur 切一段，返回 (数组, 起音位置相对片段开头的采样数)。"""
    path = c['src']
    if path not in _cache: _cache[path] = load(path)
    x = _cache[path]
    a = int(c['at'] * RATE)
    seg = x[a:]
    trig = c.get('trigger', 0.3) * np.abs(seg[: int(RATE * c['dur'])]).max()   # 只看 at 之后 dur 秒内的峰值，免得找到后面更响的一下
    on = a + int(np.argmax(np.abs(seg) > trig))
    pre = int(c.get('pre', 0.004) * RATE)
    start = max(0, on - pre)
    y = x[start: start + int(c['dur'] * RATE)].copy()
    return y, on - start


def build(name, c):
    y, on = cut(c)
    if c.get('layers'): y = np.pad(y, (0, max(0, int(c['dur'] * RATE) - len(y))))   # 叠层可能比主体长
    for l in c.get('layers', []):
        z, zon = cut({**l, 'dur': c['dur']})
        off = on + int(l.get('offset', 0) * RATE) - zon
        z = z[max(0, -off):]
        off = max(0, off)
        n = min(len(y) - off, len(z))
        y[off: off + n] += z[:n] * l.get('gain', 1)
    # 开头 2ms 淡入防爆音，结尾按 fade 指数淡出到静音
    fi = int(0.002 * RATE)
    y[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)
    fo = min(len(y), int(c['fade'] * RATE))
    y[-fo:] *= np.exp(np.linspace(0, -7, fo)).astype(np.float32) * np.linspace(1, 0, fo, dtype=np.float32) ** 0.3
    # 峰值归一化到 -1 dBFS：各段之间的相对音量在 config.js 的 audio.samples 里调
    y *= (10 ** (-1 / 20)) / max(1e-6, np.abs(y).max())
    out = os.path.join(OUT, name + '.mp3')
    snd = aud.Sound.buffer(y.reshape(-1, 1), RATE)
    snd.write(out, rate=RATE, channels=aud.CHANNELS_MONO, format=aud.FORMAT_S16,
              container=aud.CONTAINER_MP3, codec=aud.CODEC_MP3, bitrate=BITRATE)
    print('%-14s %.2fs  起音 %.3fs  %5.1f KB' % (name, len(y) / RATE, on / RATE, os.path.getsize(out) / 1024))


os.makedirs(OUT, exist_ok=True)
for k, v in CLIPS.items():
    build(k, v)
