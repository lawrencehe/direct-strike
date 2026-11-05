#!/usr/bin/env node
// 用游戏实际使用的 three.js 加载 glb，做预览和压缩前后对比。
//   node tools/glb-view.mjs preview 文件.glb [--clip Walk] [--time 0.3] [--angle 20] [--out 图片.jpg]
//   node tools/glb-view.mjs compare 原始.glb 新.glb [--tolerance 0.01]
// compare 逐动画采样骨骼位置和蒙皮后顶点的包围盒，偏差超过容差（米）时退出码为 1，并输出并排渲染图。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openGame, OUT } from './lib/game-page.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const [cmd, a, b] = argv;
const dir = path.join(OUT, 'glb');
fs.mkdirSync(dir, { recursive: true });

const { page, problems, close } = await openGame({ width: 640, height: 360 });
const serve = (name, file) => page.route(`**/__glb/${name}`, (r) => r.fulfill({ body: fs.readFileSync(file), contentType: 'model/gltf-binary' }));

// 页面内的工具函数
await page.evaluate(() => {
  window.__view = {
    load: (url) => new Promise((ok, no) => new THREE.GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(url, ok, undefined, no)),
    // 采样某个动画某一时刻的所有骨骼世界坐标，以及每个蒙皮网格变形后的包围盒
    sample(gltf, clipName, t) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
      if (clip) { mixer.clipAction(clip).play(); mixer.setTime(t); }
      gltf.scene.updateMatrixWorld(true);
      const bones = {}, boxes = {};
      const v = new THREE.Vector3();
      gltf.scene.traverse((o) => {
        if (o.isBone) bones[o.name] = o.getWorldPosition(new THREE.Vector3()).toArray();
        if (o.isSkinnedMesh) {
          const box = new THREE.Box3();
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            o.boneTransform(i, v);
            box.expandByPoint(v.applyMatrix4(o.matrixWorld));
          }
          boxes[o.name] = [...box.min.toArray(), ...box.max.toArray()];
        }
      });
      mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
      return { bones, boxes };
    },
    // 用独立的 canvas 渲染，避免和游戏循环抢画布
    render(gltf, clipName, t, angle = 20, w = 480, h = 640) {
      const canvas = document.createElement('canvas');
      const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      r.setSize(w, h, false); r.outputEncoding = THREE.sRGBEncoding; r.setClearColor(0x8a939c);
      const s = new THREE.Scene();
      s.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.1));
      const d = new THREE.DirectionalLight(0xffffff, 1.2); d.position.set(2, 4, 3); s.add(d);
      s.add(gltf.scene);
      const mixer = new THREE.AnimationMixer(gltf.scene);
      const clip = clipName && THREE.AnimationClip.findByName(gltf.animations, clipName);
      if (clip) { mixer.clipAction(clip).play(); mixer.setTime(t); }
      gltf.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          if (o.isSkinnedMesh) o.boneTransform(i, v);
          box.expandByPoint(v.applyMatrix4(o.matrixWorld));
        }
      });
      const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      const cam = new THREE.PerspectiveCamera(35, w / h, 0.01, 1000);
      const dist = Math.max(size.y / 2 / Math.tan(35 * Math.PI / 360), size.x * 1.6) * 1.15;
      // angle 是相机绕模型的水平角度（度），0 在 +z 方向。朝向不对时改 --angle
      const ang = angle * Math.PI / 180;
      cam.position.set(c.x + dist * Math.sin(ang), c.y + dist * 0.08, c.z + dist * Math.cos(ang));
      cam.lookAt(c);
      r.render(s, cam);
      const url = canvas.toDataURL('image/png');
      s.remove(gltf.scene); r.dispose();
      return url;
    },
  };
});
const writePng = (dataUrl, file) => fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
let code = 0;

if (cmd === 'preview' && a) {
  await serve('a.glb', a);
  const clip = opt('clip'); const time = Number(opt('time', 0));
  const png = path.join(dir, 'preview.png');
  writePng(await page.evaluate(async ([c, t, g]) => __view.render(await __view.load('/__glb/a.glb'), c, t, g), [clip, time, Number(opt('angle', 20))]), png);
  const out = opt('out', path.join(dir, 'preview.jpg'));
  execFileSync('magick', [png, '-quality', '80', out]);
  console.log(`预览: ${path.relative(process.cwd(), out)}`);
} else if (cmd === 'compare' && a && b) {
  await serve('a.glb', a); await serve('b.glb', b);
  const tol = Number(opt('tolerance', 0.01));
  const res = await page.evaluate(async () => {
    const A = await __view.load('/__glb/a.glb'), B = await __view.load('/__glb/b.glb');
    const out = [];
    const namesB = new Set(B.animations.map((c) => c.name));
    const missing = A.animations.filter((c) => !namesB.has(c.name)).map((c) => c.name);
    for (const clip of A.animations) {
      if (!namesB.has(clip.name) || clip.duration < 0.1) continue;
      let boneMax = 0, boneAt = '', boxMax = 0, boneCount = 0, missingBones = 0;
      for (let i = 0; i <= 12; i++) {
        const t = clip.duration * i / 12;
        const sa = __view.sample(A, clip.name, t), sb = __view.sample(B, clip.name, t);
        boneCount = Object.keys(sa.bones).length;
        for (const [n, p] of Object.entries(sa.bones)) {
          const q = sb.bones[n];
          if (!q) { missingBones++; continue; }
          const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
          if (d > boneMax) { boneMax = d; boneAt = `${n}@${t.toFixed(2)}s`; }
        }
        for (const [n, p] of Object.entries(sa.boxes)) {
          const q = sb.boxes[n];
          if (!q) continue;
          p.forEach((x, k) => { boxMax = Math.max(boxMax, Math.abs(x - q[k])); });
        }
      }
      out.push({ clip: clip.name, boneMax, boneAt, boxMax, boneCount, missingBones });
    }
    const tex = (g) => { const s = new Set(); g.scene.traverse((o) => { if (o.material?.map?.image) s.add(`${o.material.map.image.width}x${o.material.map.image.height}`); }); return [...s].join(','); };
    return { out, missing, texA: tex(A), texB: tex(B) };
  });
  for (const r of res.out) {
    const ok = r.boneMax <= tol && r.boxMax <= tol && !r.missingBones;
    if (!ok) code = 1;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${r.clip.padEnd(8)} 骨骼偏差 ${(r.boneMax * 1000).toFixed(2)}mm（${r.boneAt}） 蒙皮包围盒偏差 ${(r.boxMax * 1000).toFixed(2)}mm  骨骼 ${r.boneCount}${r.missingBones ? ` 缺失 ${r.missingBones}` : ''}`);
  }
  if (res.missing.length) console.log(`新文件没有的动画: ${res.missing.join(', ')}`);
  console.log(`贴图尺寸: ${res.texA} → ${res.texB}`);
  const clip = opt('clip', res.out[0]?.clip);
  const pa = path.join(dir, 'a.png'), pb = path.join(dir, 'b.png'), side = path.join(dir, 'compare.jpg');
  for (const [u, p] of [['a', pa], ['b', pb]]) {
    writePng(await page.evaluate(async ([url, c, g]) => __view.render(await __view.load(url), c, 0.3, g), [`/__glb/${u}.glb`, clip, Number(opt('angle', 20))]), p);
  }
  execFileSync('magick', [pa, pb, '+append', '-quality', '80', side]);
  console.log(`并排图（左原始 右新，动画 ${clip}）: ${path.relative(process.cwd(), side)}`);
} else { console.error('用法见文件开头'); code = 2; }

const real = problems.filter((p) => !p.includes('__glb'));
if (real.length) { console.log(`页面问题 ${real.length} 条：`); real.slice(0, 5).forEach((p) => console.log(`  ${p.slice(0, 200)}`)); code = code || 1; }
await close();
process.exit(code);
