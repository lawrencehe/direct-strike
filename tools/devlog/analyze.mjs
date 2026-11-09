// 分析开发者模式上传的数据（js/devlog.js → server/api.py → ~/direct-strike-data/devlogs/<编号>/）
//
//   node tools/devlog/analyze.mjs                 # 最新的一次上传
//   node tools/devlog/analyze.mjs 20261109-2130…  # 指定编号（或目录、或下载到本地的 .json.gz）
//   node tools/devlog/analyze.mjs --list          # 列出所有上传
//   选项：--around 3   标记前后看几秒（默认 3）
//         --at 12.5    额外看某个时刻（秒，相对录制开始；可以写多个，逗号分隔）
//         --no-video   不拆视频帧
//
// 输出到 tools/out/devlog/<编号>/：
//   report.md               文字报告（也打印到终端）：设备、帧时间、卡顿及当时在做什么、枪模跳变、换弹时长、标记
//   overview.png            整段的帧时间和事件
//   marker-N.png / at-T.png 标记（或指定时刻）前后的曲线：帧时间、枪模位置和旋转、动作进度、左手
//   jump-N.png              枪模跳变最大的几处
//   marker-N-video.jpg      标记前后的视频帧拼图（录了画面才有）
// 格式说明见 docs/devmode.md。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = process.env.DEVLOG_DIR || path.join(os.homedir(), 'direct-strike-data/devlogs');

// ---------- 参数 ----------
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const AROUND = Number(opt('--around', 3));
const AT = (opt('--at', '') || '').split(',').filter(Boolean).map(Number);
const NO_VIDEO = flag('--no-video');
const LIST = flag('--list');

const uploads = () => (fs.existsSync(DATA) ? fs.readdirSync(DATA).filter((d) => /^\d{8}-\d{6}-/.test(d)).sort() : []);
if (LIST) {
  for (const id of uploads()) {
    let m = {};
    try { m = JSON.parse(fs.readFileSync(path.join(DATA, id, 'meta.json'))).client || {}; } catch (e) { /* 没有就算了 */ }
    const files = fs.readdirSync(path.join(DATA, id));
    console.log(`${id}  ${m.version || ''}  ${m.mode || ''}  ${(m.seconds || 0).toFixed?.(0) || ''}s  ${Math.round(m.fps || 0)}fps  标记 ${m.markers ?? '?'}  视频 ${files.filter((f) => f.startsWith('seg-')).length} 片  ${m.gpu || ''}`);
  }
  process.exit(0);
}

let src = args[0] || uploads().at(-1);
if (!src) { console.error(`没有上传的数据（${DATA}）`); process.exit(2); }
let dir, framesFile;
if (fs.existsSync(src) && fs.statSync(src).isFile()) { framesFile = src; dir = path.dirname(src); }
else { dir = fs.existsSync(src) ? src : path.join(DATA, src); framesFile = path.join(dir, 'frames.json.gz'); }
if (!fs.existsSync(framesFile)) { console.error(`找不到 ${framesFile}`); process.exit(2); }
const id = path.basename(dir === path.dirname(framesFile) && framesFile.endsWith('frames.json.gz') ? dir : framesFile).replace(/\.json\.gz$/, '');
const OUT = path.join(ROOT, 'tools/out/devlog', id);
fs.mkdirSync(OUT, { recursive: true });

const J = JSON.parse(zlib.gunzipSync(fs.readFileSync(framesFile)));
// 帧按时间排序（真机录的本来就是递增的；测试脚本混用模拟时钟时可能乱序）
{
  const order = J.t.map((_, i) => i).sort((a, b) => J.t[a] - J.t[b]);
  if (order.some((v, i) => v !== i)) {
    J.t = order.map((i) => J.t[i]);
    for (const k of Object.keys(J.data)) J.data[k] = order.map((i) => J.data[k][i]);
  }
  J.events.sort((a, b) => a.t - b.t);
}
const D = J.data;
const N = J.t.length;
const T0 = J.t[0];
const sec = (ms) => (ms - T0) / 1000;           // 相对录制开始的秒数
const tS = J.t.map(sec);
const W = J.weapons;

// ---------- 统计 ----------
const sorted = (a) => a.filter((v) => v !== null).sort((x, y) => x - y);
const pct = (s, p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
const dts = sorted(D.dtRaw);
const median = pct(dts, 0.5);
const hz = 1000 / median;
const FACTOR = J.meta.config?.dev?.hitchFactor || 2;

// 第 i 帧在做什么（给卡顿、跳变配上下文）
function doing(i) {
  const w = W[D.weapon[i]] || '?';
  const parts = [w];
  if (D.reload[i] >= 0) parts.push(`换弹 ${(D.reload[i] * 100).toFixed(0)}%${D.reloadEmpty[i] ? '（空枪）' : ''}`);
  if (D.switchPhase[i]) parts.push(`切枪${D.switchPhase[i] === 1 ? '收' : '掏'} ${D.switchT[i].toFixed(2)}s`);
  if (D.throwState[i]) parts.push(D.throwState[i] === 1 ? '攥雷' : '挥臂');
  if (!D.onGround[i]) parts.push('空中');
  const sp = Math.hypot(D.velX[i], D.velZ[i]);
  if (sp > 0.5) parts.push(`移动 ${sp.toFixed(1)}m/s`);
  if (D.crouchT[i] > 0.5) parts.push('蹲');
  return parts.join('，');
}
const evNear = (tms, win = 60) => J.events.filter((e) => Math.abs(e.t - tms) <= win).map((e) => e.type);
const fmtT = (s) => `${s.toFixed(2)}s`;

// 卡顿
const hitches = [];
for (let i = 0; i < N; i++) if (D.dtRaw[i] > median * FACTOR) hitches.push(i);
const worst = [...hitches].sort((a, b) => D.dtRaw[b] - D.dtRaw[a]).slice(0, 12);

// 枪模跳变：这一帧枪模位置 / 旋转的变化，按"每 60Hz 帧"折算，和平常比大很多的。开枪那一帧后坐是正常的，排除
const jumps = [];
const fireT = J.events.filter((e) => e.type === 'fire').map((e) => e.t);
const nearFire = (tms) => fireT.some((t) => tms - t >= -5 && tms - t < 40);
for (let i = 1; i < N; i++) {
  if (D.weapon[i] !== D.weapon[i - 1] || D.dtRaw[i] === null) continue;
  const k = 16.67 / Math.max(1, D.dtRaw[i]);
  const dp = Math.hypot(D.vmX[i] - D.vmX[i - 1], D.vmY[i] - D.vmY[i - 1], D.vmZ[i] - D.vmZ[i - 1]) * k;
  const dr = Math.hypot(D.vmRX[i] - D.vmRX[i - 1], D.vmRY[i] - D.vmRY[i - 1], D.vmRZ[i] - D.vmRZ[i - 1]) * k;
  const dl = D.lhX[i] === null || D.lhX[i - 1] === null ? 0 : Math.hypot(D.lhX[i] - D.lhX[i - 1], D.lhY[i] - D.lhY[i - 1], D.lhZ[i] - D.lhZ[i - 1]) * k;
  if (nearFire(J.t[i])) continue;
  // 门槛：60Hz 下一帧移动 1.5cm、转 0.06 弧度（3.4°）、左手 3cm
  const score = Math.max(dp / 0.015, dr / 0.06, dl / 0.03);
  if (score > 1) jumps.push({ i, dp, dr, dl, score });
}
jumps.sort((a, b) => b.score - a.score);
// 相邻帧只留一个
const topJumps = [];
for (const j of jumps) { if (topJumps.every((x) => Math.abs(x.i - j.i) > 10)) topJumps.push(j); if (topJumps.length >= 8) break; }

// 换弹时长（真实时间）
const reloads = [];
let rs = null;
for (const e of J.events) {
  if (e.type === 'reloadStart') rs = e;
  else if ((e.type === 'reloadEnd' || e.type === 'reloadCancel') && rs) { reloads.push({ t: sec(rs.t), dur: (e.t - rs.t) / 1000, empty: !!rs.v, ok: e.type === 'reloadEnd' }); rs = null; }
}
const markers = J.events.filter((e) => e.type === 'marker');
const longtasks = J.events.filter((e) => e.type === 'longtask');
// 最后一个不晚于 tms 的帧（取窗口末端用，数据中间有空档时不会把空档后面的帧带进来）
const idxBefore = (tms) => { const i = idxAt(tms); return J.t[i] > tms ? Math.max(0, i - 1) : i; };
const idxAt = (tms) => { let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (J.t[m] < tms) lo = m + 1; else hi = m; } return lo; };

// ---------- 报告 ----------
const m = J.meta;
const L = [];
L.push(`# 开发者数据 ${id}`, '');
L.push(`- 版本 ${m.version}，模式 ${m.mode}，录制于 ${m.recordedAt}`);
L.push(`- 设备：${m.gpu}；${m.cores} 核${m.memoryGB ? `，${m.memoryGB}GB` : ''}；屏幕 ${m.screen.w}×${m.screen.h}@${m.screen.dpr}x，画布 ${m.canvas.w}×${m.canvas.h}${m.fullscreen ? '（全屏）' : ''}`);
L.push(`- 浏览器：${m.userAgent}`);
L.push(`- 武器：${m.weapons.rifle} / ${m.weapons.pistol}；录制耗时 平均 ${J.recordCost.avgUs.toFixed(1)}µs，最大 ${J.recordCost.maxUs.toFixed(0)}µs`);
L.push('', '## 帧时间', '');
L.push(`- ${N} 帧，${(tS[N - 1]).toFixed(1)} 秒；中位 ${median.toFixed(2)}ms（≈ ${hz.toFixed(0)}Hz，多半就是显示器刷新率）`);
L.push(`- p95 ${pct(dts, 0.95).toFixed(1)}ms，最慢 1% ${pct(dts, 0.99).toFixed(1)}ms，最慢 ${dts.at(-1).toFixed(1)}ms`);
L.push(`- 卡顿（> 中位 ${FACTOR} 倍）${hitches.length} 次，占 ${(hitches.length / N * 100).toFixed(2)}%；浏览器长任务 ${longtasks.length} 次`);
const work = sorted(D.work);
L.push(`- 每帧 CPU（逻辑 + 提交渲染）中位 ${pct(work, 0.5).toFixed(2)}ms，最慢 1% ${pct(work, 0.99).toFixed(2)}ms`);
if (worst.length) {
  L.push('', '最慢的几帧（CPU 小而帧间隔大 → 卡在显卡 / 浏览器合成；CPU 大 → 卡在脚本）：', '');
  L.push('| 时刻 | 帧间隔 | CPU | 在做什么 | 附近事件 |', '|---|---|---|---|---|');
  for (const i of worst) L.push(`| ${fmtT(tS[i])} | ${D.dtRaw[i].toFixed(1)}ms | ${D.work[i].toFixed(1)}ms | ${doing(i)} | ${evNear(J.t[i], 100).join(' ')} |`);
}
L.push('', '## 枪模跳变', '');
if (!topJumps.length) L.push('没有发现（门槛：60Hz 下一帧移动 1.5cm / 转 3.4° / 左手 3cm，开枪那一帧除外）。');
else {
  L.push('| 时刻 | 位移/帧 | 转角/帧 | 左手/帧 | 帧间隔 | 在做什么 |', '|---|---|---|---|---|---|');
  topJumps.forEach((j) => L.push(`| ${fmtT(tS[j.i])} | ${(j.dp * 100).toFixed(1)}cm | ${(j.dr * 57.3).toFixed(1)}° | ${(j.dl * 100).toFixed(1)}cm | ${D.dtRaw[j.i].toFixed(1)}ms | ${doing(j.i)} |`));
  L.push('', '（已按 60Hz 折算；图见 jump-N.png）');
}
if (reloads.length) {
  L.push('', '## 换弹', '');
  for (const r of reloads) L.push(`- ${fmtT(r.t)} ${r.empty ? '空枪' : '非空'}换弹 ${r.dur.toFixed(2)}s ${r.ok ? '' : '（中途打断）'}`);
}
L.push('', '## 标记', '');
if (!markers.length) L.push('没有标记。');
markers.forEach((e, k) => { const i = idxAt(e.t); L.push(`- #${k + 1} ${fmtT(sec(e.t))}：${doing(i)}；前 1 秒事件：${J.events.filter((x) => x.t < e.t && e.t - x.t < 1000 && x.type !== 'marker').map((x) => x.type).join(' ') || '无'}`); });
const evCount = {};
for (const e of J.events) evCount[e.type] = (evCount[e.type] || 0) + 1;
L.push('', `事件统计：${Object.entries(evCount).map(([k, v]) => `${k} ${v}`).join('，')}`);
L.push(`视频：${J.video.length ? J.video.map((v) => `${v.file} ${fmtT(sec(v.t0))}~${fmtT(sec(v.t1 || v.t0))}`).join('，') : '未录'}`);

// ---------- 图 ----------
// 在无头 Chromium 里用 canvas 画，不引入画图库
// 视频用 file:// 打开，画到 canvas 上默认算跨源，取图会报错；允许本地文件互访
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.setContent('<html><body style="margin:0;background:#111"><canvas id="c"></canvas></body></html>');

const COLORS = ['#ff6b5b', '#6bd06b', '#5ba8ff', '#f2c14e', '#c77dff', '#4ed8d8'];
async function chart(file, i0, i1, title, highlightT) {
  i0 = Math.max(0, i0); i1 = Math.min(N - 1, i1);
  const slice = (k) => D[k].slice(i0, i1 + 1);
  // 位置、旋转减去窗口里的中位数，三条线共用一个以 0 为中心的刻度，小幅抖动也看得清
  const rel = (k) => { const s = slice(k); const md = sorted(s)[Math.floor(s.filter((v) => v !== null).length / 2)] ?? 0; return s.map((v) => (v === null ? null : v - md)); };
  const panels = [
    { name: '帧间隔 / CPU (ms)，纵轴封顶中位数 8 倍', series: [['dtRaw', slice('dtRaw')], ['work', slice('work')]], ref: [median], cap: median * 8 },
    { name: '枪模位置 (m，减去窗口中位数)', series: [['vmX', rel('vmX')], ['vmY', rel('vmY')], ['vmZ', rel('vmZ')]] },
    { name: '枪模旋转 (rad，减去窗口中位数)', series: [['vmRX', rel('vmRX')], ['vmRY', rel('vmRY')], ['vmRZ', rel('vmRZ')]] },
    { name: '动作', series: [['reload', slice('reload').map((v) => (v < 0 ? null : v))], ['switchT', slice('switchT')], ['kick', slice('kick')], ['throw', slice('throwState').map((v) => v / 2)]] },
    { name: '左手 (枪坐标 m，减去窗口中位数)', series: [['lhX', rel('lhX')], ['lhY', rel('lhY')], ['lhZ', rel('lhZ')]] },
    { name: '鼠标 (px/帧) 和移动', series: [['lookX', slice('lookX')], ['lookY', slice('lookY')], ['speed', slice('velX').map((v, k) => Math.hypot(v, D.velZ[i0 + k]))]] },
  ];
  const ts = tS.slice(i0, i1 + 1);
  const evs = J.events.filter((e) => e.t >= J.t[i0] && e.t <= J.t[i1] && e.type !== 'longtask' && e.type !== 'videoSegment').map((e) => ({ t: sec(e.t), type: e.type }));
  await page.evaluate(({ panels, ts, evs, title, COLORS, highlightT }) => {
    const c = document.getElementById('c');
    const Wd = 1400, PH = 140, top = 34;
    c.width = Wd; c.height = top + panels.length * PH + 10;
    const x = c.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, c.width, c.height);
    x.font = '14px sans-serif'; x.fillStyle = '#eee'; x.fillText(title, 10, 22);
    const L = 70, R = Wd - 20, t0 = ts[0], t1 = ts[ts.length - 1] || t0 + 1;
    const X = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (R - L);
    panels.forEach((p, k) => {
      const y0 = top + k * PH, h = PH - 22;
      let lo = Infinity, hi = -Infinity;
      for (const [, s] of p.series) for (const v of s) if (v !== null && Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
      if (p.ref) { hi = Math.max(hi, p.ref[0] * 2); lo = 0; }
      if (p.cap) hi = Math.min(hi, p.cap);
      if (hi - lo < 1e-6) { hi += 0.5; lo -= 0.5; }
      const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
      const Y = (v) => y0 + 18 + h - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * h;
      x.fillStyle = '#1a1a1a'; x.fillRect(L, y0 + 18, R - L, h);
      x.fillStyle = '#aaa'; x.font = '12px sans-serif'; x.fillText(p.name, L, y0 + 13);
      x.fillText(hi.toPrecision(3), 4, y0 + 28); x.fillText(lo.toPrecision(3), 4, y0 + 18 + h);
      if (p.ref) { x.strokeStyle = '#555'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(L, Y(p.ref[0])); x.lineTo(R, Y(p.ref[0])); x.stroke(); x.setLineDash([]); }
      // 事件竖线
      for (const e of evs) {
        x.strokeStyle = e.type === 'marker' ? '#ff5f00' : 'rgba(255,255,255,.18)';
        x.beginPath(); x.moveTo(X(e.t), y0 + 18); x.lineTo(X(e.t), y0 + 18 + h); x.stroke();
      }
      if (highlightT !== null) { x.strokeStyle = '#ff5f00'; x.lineWidth = 2; x.beginPath(); x.moveTo(X(highlightT), y0 + 18); x.lineTo(X(highlightT), y0 + 18 + h); x.stroke(); x.lineWidth = 1; }
      p.series.forEach(([name, s], si) => {
        x.strokeStyle = COLORS[si]; x.beginPath();
        let pen = false;
        s.forEach((v, i) => { if (v === null || !Number.isFinite(v)) { pen = false; return; } if (!pen) { x.moveTo(X(ts[i]), Y(v)); pen = true; } else x.lineTo(X(ts[i]), Y(v)); });
        x.stroke();
        // 每帧一个点，看得出帧率
        if (s.length < 700) { x.fillStyle = COLORS[si]; s.forEach((v, i) => { if (v !== null && Number.isFinite(v)) x.fillRect(X(ts[i]) - 1, Y(v) - 1, 2, 2); }); }
        x.fillStyle = COLORS[si]; x.fillText(name, R - 280 + si * 70, y0 + 13);
      });
    });
    // 时间轴和事件名
    x.fillStyle = '#888'; x.font = '11px sans-serif';
    const yb = top + panels.length * PH;
    for (let k = 0; k <= 10; k++) { const t = t0 + ((t1 - t0) * k) / 10; x.fillText(`${t.toFixed(2)}s`, X(t) - 14, yb + 6); }
    let lastX = -1e9, row = 0;
    for (const e of evs) { const px = X(e.t); row = px - lastX < 60 ? (row + 1) % 3 : 0; lastX = px; x.fillStyle = e.type === 'marker' ? '#ff5f00' : '#bbb'; x.fillText(e.type, px + 2, top + 30 + row * 12); }
  }, { panels, ts, evs, title, COLORS, highlightT: highlightT ?? null });
  await (await page.$('#c')).screenshot({ path: path.join(OUT, file) });
}

// 整段帧时间
async function overview() {
  await page.evaluate(({ t, dt, evs, median }) => {
    const c = document.getElementById('c');
    c.width = 1400; c.height = 220;
    const x = c.getContext('2d');
    x.fillStyle = '#111'; x.fillRect(0, 0, 1400, 220);
    const L = 50, R = 1380, top = 30, H = 170;
    const t0 = t[0], t1 = t[t.length - 1];
    const maxMs = Math.max(median * 4, 34);
    const X = (v) => L + ((v - t0) / (t1 - t0 || 1)) * (R - L);
    const cols = new Float32Array(R - L);
    t.forEach((v, i) => { const k = Math.min(cols.length - 1, Math.floor(X(v) - L)); cols[k] = Math.max(cols[k], dt[i] || 0); });
    cols.forEach((v, k) => { x.fillStyle = v > median * 2 ? '#ff5b4b' : '#7cc96b'; const h = Math.min(H, (v / maxMs) * H); x.fillRect(L + k, top + H - h, 1, h); });
    x.fillStyle = '#aaa'; x.font = '12px sans-serif';
    x.fillText(`帧间隔（每列取最慢一帧），上限 ${maxMs.toFixed(0)}ms，虚线 = 中位 ${median.toFixed(1)}ms`, L, 18);
    x.strokeStyle = '#666'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(L, top + H - (median / maxMs) * H); x.lineTo(R, top + H - (median / maxMs) * H); x.stroke(); x.setLineDash([]);
    for (const e of evs) { x.fillStyle = '#ff5f00'; x.fillRect(X(e.t) - 1, top, 2, H); x.fillText(`#${e.n}`, X(e.t) + 3, top + 12); }
    for (let k = 0; k <= 10; k++) { const v = t0 + ((t1 - t0) * k) / 10; x.fillStyle = '#888'; x.fillText(`${v.toFixed(0)}s`, X(v) - 8, 215); }
  }, { t: tS, dt: D.dtRaw, evs: markers.map((e, k) => ({ t: sec(e.t), n: k + 1 })), median });
  await (await page.$('#c')).screenshot({ path: path.join(OUT, 'overview.png') });
}

await overview();
const imgs = ['overview.png'];
const window = (tsec) => [idxAt(T0 + (tsec - AROUND) * 1000), idxBefore(T0 + (tsec + AROUND) * 1000)];
for (let k = 0; k < markers.length; k++) {
  const ts = sec(markers[k].t);
  const [a, b] = window(ts);
  await chart(`marker-${k + 1}.png`, a, b, `标记 #${k + 1} @ ${fmtT(ts)}（前后 ${AROUND}s）`, ts);
  imgs.push(`marker-${k + 1}.png`);
}
for (const ts of AT) {
  const [a, b] = window(ts);
  await chart(`at-${ts}.png`, a, b, `${fmtT(ts)} 前后 ${AROUND}s`, ts);
  imgs.push(`at-${ts}.png`);
}
for (let k = 0; k < Math.min(4, topJumps.length); k++) {
  const j = topJumps[k];
  const [a, b] = [idxAt(J.t[j.i] - 1500), idxBefore(J.t[j.i] + 1500)];   // 前后 1.5 秒
  await chart(`jump-${k + 1}.png`, a, b, `枪模跳变 #${k + 1} @ ${fmtT(tS[j.i])}：${doing(j.i)}`, tS[j.i]);
  imgs.push(`jump-${k + 1}.png`);
}

// ---------- 视频帧拼图 ----------
// MediaRecorder 录的 webm 没有索引，跳转不准，所以整片顺序播放，用 requestVideoFrameCallback 取需要的时刻
async function videoSheet(file, centerSec, label) {
  const want = [];
  for (let k = -5; k <= 6; k++) want.push(centerSec + k * 0.1);   // 前 0.5 秒到后 0.6 秒，每 0.1 秒一张
  const segs = J.video.filter((v) => fs.existsSync(path.join(dir, v.file)) && sec(v.t0) <= want.at(-1) && sec(v.t1 || v.t0 + 99999) >= want[0]);
  if (!segs.length) return false;
  const vp = await browser.newPage({ viewport: { width: 1300, height: 100 } });
  await vp.goto(pathToFileURL(path.join(OUT, '.blank.html')).href).catch(() => {});
  const frames = [];
  for (const s of segs) {
    const got = await vp.evaluate(async ({ url, startSec, want }) => {
      const v = document.createElement('video');
      v.muted = true; v.src = url; v.playbackRate = 2;
      document.body.appendChild(v);
      // 每个目标时刻留最近的一帧（录制帧率低时也能出图）
      const best = want.map(() => ({ d: Infinity, t: 0, img: null }));
      const cv = document.createElement('canvas');
      await new Promise((resolve) => {
        const onFrame = (now, md) => {
          const t = startSec + md.mediaTime;
          want.forEach((w, i) => {
            const d = Math.abs(t - w);
            if (d >= best[i].d || d > 0.3) return;
            if (!cv.width) { cv.width = 320; cv.height = Math.round((320 * v.videoHeight) / v.videoWidth); }
            cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
            best[i] = { d, t, img: cv.toDataURL('image/jpeg', 0.8) };
          });
          if (v.ended || t > want[want.length - 1] + 0.3) { resolve(); return; }
          v.requestVideoFrameCallback(onFrame);
        };
        v.requestVideoFrameCallback(onFrame);
        v.onended = () => resolve();
        v.onerror = () => resolve();
        v.play().catch(() => resolve());
        setTimeout(resolve, 30000);
      });
      const out = [];
      best.forEach((b, i) => { if (b.img) out.push({ i, t: b.t, img: b.img }); });
      return out;
    }, { url: pathToFileURL(path.join(dir, s.file)).href, startSec: sec(s.t0), want });
    frames.push(...got);
  }
  frames.sort((a, b) => a.i - b.i);
  for (let k = frames.length - 1; k > 0; k--) if (Math.abs(frames[k].t - frames[k - 1].t) < 1e-4) frames.splice(k, 1);
  if (!frames.length) { await vp.close(); return false; }
  await vp.setContent(`<html><body style="margin:0;background:#111;color:#ddd;font:13px sans-serif;width:1300px">
    <div style="padding:8px">${label}（每张 0.1 秒，橙框 = 那一刻）</div>
    <div style="display:grid;grid-template-columns:repeat(4,320px);gap:4px;padding:4px">
    ${frames.map((f) => `<div style="position:relative;outline:${Math.abs(f.t - centerSec) < 0.06 ? '3px solid #ff5f00' : 'none'}"><img src="${f.img}" style="display:block;width:320px"><span style="position:absolute;left:4px;top:2px;background:#000a;padding:0 4px">${f.t.toFixed(2)}s</span></div>`).join('')}
    </div></body></html>`);
  await vp.screenshot({ path: path.join(OUT, file), fullPage: true, type: 'jpeg', quality: 85 });
  await vp.close();
  return true;
}
if (!NO_VIDEO && J.video.length) {
  fs.writeFileSync(path.join(OUT, '.blank.html'), '<html><body></body></html>');
  const spots = [...markers.map((e, k) => [`marker-${k + 1}-video.jpg`, sec(e.t), `标记 #${k + 1}`]), ...AT.map((t) => [`at-${t}-video.jpg`, t, `${t}s`])];
  for (const [file, t, label] of spots) if (await videoSheet(file, t, label)) imgs.push(file);
}
await browser.close();

L.push('', '## 图', '', ...imgs.map((f) => `- ${path.join(path.relative(ROOT, OUT), f)}`));
const report = L.join('\n');
fs.writeFileSync(path.join(OUT, 'report.md'), report + '\n');
console.log(report);
