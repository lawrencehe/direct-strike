// ============================================================
// 音效：Web Audio API。
// 枪声、换弹、手雷 / 闪光爆炸用真实录音（assets/sound/，配置在 config.js 的 audio.samples，#45），
// 点开始后后台下载；没下完或下载失败时用下面的合成声顶着（每个方法里 sample() 返回 false 就走合成）。
// 命中、击杀、购买这类提示音和烟雾嘶声一直是合成的：提示音要"干净"，合成的够用。
// 合成的枪声 = 一段白噪声（"嘭"的嘶声）+ 一个快速下降的低音（"咚"的冲击感）
// ============================================================
Game.Audio = class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = {};   // 录音名 → 解码好的 AudioBuffer
  }

  // 浏览器规定：必须在用户点击之后才能创建声音，所以在"点击开始"时调用
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = Game.Config.audio.volume;
    this.master.connect(this.ctx.destination);

    // 预先生成 1 秒白噪声，之后反复使用
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.loadSamples();
  }

  // 后台下载、解码录音，不等它；失败的那个继续用合成声
  loadSamples() {
    const S = Game.Config.audio.samples;
    for (const name of S.files) {
      const path = S.dir + name + '.mp3';
      Game.Assets.ensure(path).then(() => fetch(Game.Assets.url(path)))   // 本地缓存有就不下载（#85）
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status))))
        .then((data) => new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail)))   // 回调写法：老 Safari 不支持返回 Promise
        .then((buf) => { this.buffers[name] = buf; })
        .catch((e) => console.warn('音效加载失败，用合成声代替：', name, e && e.message));
    }
  }

  // 播放一段录音。vol 音量，pan 左右（-1 ~ 1），cutoff 低通截止频率（0 = 不滤），rate 播放速度（也改音高）。
  // 还没下载好就返回 false，调用方改用合成声
  sample(name, { vol = 1, pan = 0, cutoff = 0, rate = 1 } = {}) {
    const ctx = this.ctx, buf = ctx && this.buffers[name];
    if (!buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    let node = src;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      node = node.connect(f);
    }
    const g = ctx.createGain();
    g.gain.value = vol;
    node = node.connect(g);
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node = node.connect(p);
    }
    node.connect(this.master);
    src.start();
    return true;
  }

  // 距离 → 低通截止频率：越远越闷（远处的高频被空气吃掉）
  muffle(distance) {
    const [near, far, d] = Game.Config.audio.samples.muffle;
    return near * Math.pow(far / near, Math.min(1, distance / d));
  }

  jitter() { return 1 + (Math.random() * 2 - 1) * Game.Config.audio.samples.pitchJitter; }
  gain(k) { return Game.Config.audio.samples.gain[k]; }

  // 设置里改音量。还没点过开始（没有 ctx）时不用管，init 会读 Config
  setVolume(v) {
    if (this.master) this.master.gain.value = v;
  }

  // kind：'rifle' 或 'pistol'。录音按当前选的枪（config.js 的 loadout 里的 sound）随机挑一发；
  // 合成声：手枪更脆、更短，低音也轻
  shot(kind = 'rifle') {
    const ctx = this.ctx;
    if (!ctx) return;
    const snd = (Game.Config.weapons[kind] || {}).sound;
    if (snd && this.sample(snd + '-' + (1 + Math.floor(Math.random() * 2)), { vol: this.gain('shot'), rate: this.jitter() })) return;
    const t = ctx.currentTime;
    const pistol = kind === 'pistol';

    // 噪声部分：低通滤波器从高频快速扫到低频，听起来像"嘭——"
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(pistol ? 5200 : 3500, t);
    filter.frequency.exponentialRampToValueAtTime(pistol ? 500 : 300, t + (pistol ? 0.09 : 0.15));
    const g = ctx.createGain();
    g.gain.setValueAtTime(pistol ? 0.7 : 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (pistol ? 0.11 : 0.18));
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.2);

    // 低音部分：140Hz 迅速降到 45Hz，给人"有劲"的感觉
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(pistol ? 200 : 140, t);
    osc.frequency.exponentialRampToValueAtTime(pistol ? 70 : 45, t + 0.1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(pistol ? 0.45 : 0.8, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  // NPC 的枪声：中距录音，越远越轻、越闷；pan = -1 左 ~ 1 右，snd 是 NPC 手上那把枪的 sound
  botShot(pan, distance, snd = 'ak') {
    const ctx = this.ctx;
    if (!ctx) return;
    const S = Game.Config.audio.samples;
    if (this.sample(snd + '-far', { vol: this.gain('botShot') / (1 + distance / S.botRolloff), pan, cutoff: this.muffle(distance), rate: this.jitter() })) return;
    const t = ctx.currentTime;
    const vol = 0.7 / (1 + distance / 8);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.master);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(filter).connect(g).connect(panner);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.18);
  }

  kill(head) { this.tone(head ? 1500 : 1100, 0.07, 'sine', 0.35); this.tone(head ? 2400 : 1650, 0.18, 'sine', 0.3, 0.06); }
  hurt()     { this.tone(180, 0.12, 'sawtooth', 0.25); }
  death()    { this.tone(300, 0.6, 'sawtooth', 0.3); this.tone(150, 0.9, 'sine', 0.3, 0.1); }
  hit()      { this.tone(900, 0.05, 'square', 0.12); }
  headshot() { this.tone(1400, 0.08, 'sine', 0.35); this.tone(2100, 0.14, 'sine', 0.3, 0.05); }
  empty()    { this.click(0, 0.25); }
  // 换弹的几个动作（weapon.js 在动作做到那一步时调用）
  reloadSample(name) { return this.sample(name, { vol: this.gain('reload'), rate: this.jitter() }); }
  magOut()      { if (!this.reloadSample('mag-out')) { this.click(0, 0.28); this.tone(320, 0.06, 'triangle', 0.08); } }
  magIn()       { if (!this.reloadSample('mag-in')) { this.click(0, 0.45); this.click(0.025, 0.25); this.tone(140, 0.08, 'sine', 0.22); } }
  rackBack()    { if (!this.reloadSample('rack-back')) { this.click(0, 0.35); this.tone(600, 0.05, 'square', 0.05); } }
  rackForward() { if (!this.reloadSample('rack-forward')) { this.click(0, 0.5); this.click(0.02, 0.3); this.tone(180, 0.07, 'sine', 0.2); } }
  swap()     { this.click(0, 0.18); this.click(0.1, 0.12); }
  pullPin()  { this.click(0, 0.22); this.tone(2600, 0.05, 'sine', 0.08, 0.03); }
  spoon()    { this.tone(3200, 0.09, 'sine', 0.07); this.click(0, 0.15); }   // 握片弹开的"叮"
  // 买成功："咔"一下加两声上扬的亮音，比赏金的 cash() 响、明显
  purchase() { this.click(0, 0.45); this.tone(1320, 0.07, 'triangle', 0.32); this.tone(1980, 0.2, 'triangle', 0.3, 0.07); this.click(0.07, 0.25); }
  // 买不了（钱不够 / 带满 / 不在购买区）：低沉的两下"嗡"
  denied()   { this.tone(190, 0.09, 'square', 0.1); this.tone(150, 0.13, 'square', 0.09, 0.1); }
  cash()     { this.tone(1700, 0.05, 'sine', 0.15); this.tone(2550, 0.1, 'sine', 0.13, 0.05); }   // 买到东西 / 拿到赏金
  bounce(v)  { this.click(0, Math.min(0.35, 0.05 + v * 0.03)); }

  explosion(distance) {
    if (this.sample('frag', { vol: this.gain('explosion') / (1 + distance / 10), cutoff: this.muffle(distance), rate: this.jitter() })) return;
    const vol = 1.4 / (1 + distance / 10);
    this.noiseBurst(1200, 80, 0.9, vol);
    this.tone(90, 0.7, 'sine', vol * 0.8);
  }
  flashBang(distance) {
    if (this.sample('flash', { vol: this.gain('flash') / (1 + distance / 12), cutoff: this.muffle(distance), rate: this.jitter() })) return;
    const vol = 1.1 / (1 + distance / 12);
    this.noiseBurst(7000, 1500, 0.25, vol);
    this.tone(120, 0.25, 'sine', vol * 0.6);
  }
  // 被闪到时的耳鸣
  ring(seconds, vol) { this.tone(3400, Math.max(0.3, seconds), 'sine', 0.09 * vol); }
  smokeHiss(distance) { this.noiseBurst(3200, 1400, 2.4, 0.22 / (1 + distance / 12)); }

  // 一段噪声：低通从 f0 扫到 f1，并逐渐衰减
  noiseBurst(f0, f1, dur, vol) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  tone(freq, dur, type, vol, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  // 金属"咔哒"声：极短的高频噪声
  click(delay, vol) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.05);
  }
};
