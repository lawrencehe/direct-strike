#!/usr/bin/env node
// glb 查看和优化。
//   node tools/glb.mjs info 文件.glb
//   node tools/glb.mjs optimize 输入.glb 输出.glb [--drop TPose,Foo] [--texture-size 1024]
//                               [--quality 80] [--level medium|high] [--no-meshopt] [--no-webp] [--no-resample]
//   node tools/glb.mjs attach 模型.glb 道具.glb 输出.glb --bone RightHand [--offset x,y,z] [--rot x,y,z] [--scale s]
//       把道具挂到骨骼上。offset 单位是米、rot 单位是度，都在骨骼局部坐标系里；scale 是道具的真实缩放（不受骨架缩放影响）。
// 优化时保留所有骨骼和叶子节点，不做减面（减面用 rig.sh decimate，需要人眼验收）。
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, resample, textureCompress, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

// 出错时只打印一行，不打印调用栈
process.on('uncaughtException', (e) => { console.error(`错误: ${e.message}`); process.exit(1); });

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const mb = (n) => (n / 1048576).toFixed(2) + 'MB';

function info(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${file} 不是 GLB 文件`);
  const j = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)));
  const acc = j.accessors || [];
  let tris = 0;
  for (const m of j.meshes || []) for (const p of m.primitives) {
    tris += Math.floor((p.indices !== undefined ? acc[p.indices].count : acc[p.attributes.POSITION].count) / 3);
  }
  const imgBytes = (j.images || []).reduce((s, i) => s + (i.bufferView !== undefined ? j.bufferViews[i.bufferView].byteLength : 0), 0);
  const clips = (j.animations || []).map((a) => {
    const dur = Math.max(0, ...a.samplers.map((s) => acc[s.input].max?.[0] ?? 0));
    return `${a.name}(${dur.toFixed(2)}s)`;
  });
  return {
    size: buf.length, imgBytes, tris, clips,
    joints: (j.skins || []).map((s) => s.joints.length),
    images: (j.images || []).map((i) => (i.mimeType || 'uri').replace('image/', '')),
    ext: j.extensionsUsed || [],
  };
}
const show = (name, i) => console.log(`${name}: ${mb(i.size)}（贴图 ${mb(i.imgBytes)}，其余 ${mb(i.size - i.imgBytes)}）  三角面 ${i.tris}  骨骼 ${i.joints.join('+') || 0}  贴图格式 ${i.images.join(',') || '-'}
  动画: ${i.clips.join(' ') || '-'}
  扩展: ${i.ext.join(' ') || '-'}`);

const [cmd, input, output] = argv;
if (cmd === 'info' && input) {
  show(path.basename(input), info(input));
} else if (cmd === 'optimize' && input && output && !output.startsWith('--')) {
  if (path.resolve(input) === path.resolve(output)) throw new Error('输入和输出不能是同一个文件：先写到新文件，验证通过后再替换');
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(input);
  const drop = (opt('drop', '') || '').split(',').filter(Boolean);
  const names = doc.getRoot().listAnimations().map((a) => a.getName());
  for (const d of drop) if (!names.includes(d)) throw new Error(`没有名为 ${d} 的动画，现有：${names.join(', ')}`);
  doc.getRoot().listAnimations().filter((a) => drop.includes(a.getName())).forEach((a) => a.dispose());
  const steps = [dedup(), prune({ keepLeaves: true, keepAttributes: true })];
  if (!flag('no-resample')) steps.push(resample());
  if (!flag('no-webp')) {
    const size = Number(opt('texture-size', 0));
    steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: Number(opt('quality', 80)), ...(size ? { resize: [size, size] } : {}) }));
  }
  if (!flag('no-meshopt')) steps.push(meshopt({ encoder: MeshoptEncoder, level: opt('level', 'medium') }));
  await doc.transform(...steps);
  await io.write(output, doc);
  const a = info(input), b = info(output);
  show('优化前', a); show('优化后', b);
  console.log(`体积 ${mb(a.size)} → ${mb(b.size)}（减少 ${((1 - b.size / a.size) * 100).toFixed(0)}%）。还需用 tools/verify.mjs 确认游戏内正常。`);
} else if (cmd === 'attach' && argv[3] && !argv[3].startsWith('--') && opt('bone')) {
  const prop = output, out = argv[3], boneName = opt('bone');
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(input), propDoc = await io.read(prop);
  const joints = new Set(doc.getRoot().listSkins().flatMap((s) => s.listJoints()));
  const strip = (n) => n.replace(/^mixamorig\d*:?/, '');
  const bone = [...joints].find((n) => n.getName() === boneName || strip(n.getName()) === strip(boneName));
  if (!bone) throw new Error(`找不到骨骼 ${boneName}，相近的有：${[...joints].map((n) => n.getName()).filter((n) => n.toLowerCase().includes(strip(boneName).toLowerCase())).slice(0, 5).join(', ') || '无'}`);
  const map = mergeDocuments(doc, propDoc);
  const scene = map.get(propDoc.getRoot().getDefaultScene() || propDoc.getRoot().listScenes()[0]);
  // 骨架通常带缩放（Mixamo 是 0.01），这里除掉，让参数都是真实尺寸
  const m = bone.getWorldMatrix();
  const worldScale = Math.hypot(m[0], m[1], m[2]);
  const nums = (n, d) => opt(n, d).split(',').map(Number);
  const [ox, oy, oz] = nums('offset', '0,0,0'), [rx, ry, rz] = nums('rot', '0,0,0').map((v) => v * Math.PI / 360);
  const s = Number(opt('scale', 1)) / worldScale;
  const q = [Math.sin(rx) * Math.cos(ry) * Math.cos(rz) - Math.cos(rx) * Math.sin(ry) * Math.sin(rz),
    Math.cos(rx) * Math.sin(ry) * Math.cos(rz) + Math.sin(rx) * Math.cos(ry) * Math.sin(rz),
    Math.cos(rx) * Math.cos(ry) * Math.sin(rz) - Math.sin(rx) * Math.sin(ry) * Math.cos(rz),
    Math.cos(rx) * Math.cos(ry) * Math.cos(rz) + Math.sin(rx) * Math.sin(ry) * Math.sin(rz)];
  const holder = doc.createNode(`attach_${path.basename(prop, path.extname(prop))}`)
    .setTranslation([ox / worldScale, oy / worldScale, oz / worldScale]).setRotation(q).setScale([s, s, s]);
  bone.addChild(holder);
  for (const c of scene.listChildren()) { scene.removeChild(c); holder.addChild(c); }
  scene.dispose();
  await doc.transform(unpartition(), prune({ keepLeaves: true, keepAttributes: true }));
  await io.write(out, doc);
  show(path.basename(out), info(out));
  console.log(`已挂到骨骼 ${bone.getName()}（骨架缩放 ${worldScale.toFixed(4)}）。用 glb-view.mjs preview 看位置。`);
} else {
  console.error('用法见文件开头'); process.exit(2);
}
