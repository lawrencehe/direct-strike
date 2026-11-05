// ============================================================
// 音效：全部用 Web Audio API 实时合成，不需要任何音频文件。
// 枪声 = 一段白噪声（"嘭"的嘶声）+ 一个快速下降的低音（"咚"的冲击感）
// ============================================================
Game.Audio = class Audio {
  constructor() {
    this.ctx = null;
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
  }

  // kind：'rifle' 或 'pistol'（手枪更脆、更短，低音也轻）
  shot(kind = 'rifle') {
    const ctx = this.ctx;
    if (!ctx) return;
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

  // NPC 的枪声：更闷（远处高频衰减），pan = -1 左 ~ 1 右
  botShot(pan, distance) {
    const ctx = this.ctx;
    if (!ctx) return;
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
  reload(time) { this.click(0.05, 0.3); this.click(time - 0.25, 0.4); }
  swap()     { this.click(0, 0.18); this.click(0.1, 0.12); }
  pullPin()  { this.click(0, 0.22); this.tone(2600, 0.05, 'sine', 0.08, 0.03); }
  bounce(v)  { this.click(0, Math.min(0.35, 0.05 + v * 0.03)); }

  explosion(distance) {
    const vol = 1.4 / (1 + distance / 10);
    this.noiseBurst(1200, 80, 0.9, vol);
    this.tone(90, 0.7, 'sine', vol * 0.8);
  }
  flashBang(distance) {
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
