#!/usr/bin/env node
// 把一张地图用到的道具 glb（meshopt 压缩 + 量化）还原成 Blender 能读的普通 glb，贴图缩小，给 Blender 地图工具当显示用的模型（#115）。
// 集装箱每种颜色的颜色贴图也转成 png 放在旁边（插件按颜色换贴图，和游戏一样）。
//   node tools/mapkit/decode-props.mjs <地图.json> <输出目录> [--tex 512]
// 输出：<输出目录>/<地图 id>/<models 里写的路径>
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [mapFile, outRoot] = process.argv.slice(2);
const ti = process.argv.indexOf('--tex');
const tex = ti >= 0 ? +process.argv[ti + 1] : 512;
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const id = map.id || path.basename(mapFile, '.json');
const src = path.join('assets/maps', id);
const dst = path.join(outRoot, id);

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const file of Object.values(map.models || {})) {
  const doc = await io.read(path.join(src, file));
  // Blender 读不了 meshopt 压缩；量化的坐标还原成浮点；贴图转 png、缩小（只是编辑时看，压缩包小）
  await doc.transform(dequantize(), textureCompress({ encoder: sharp, targetFormat: 'png', resize: [tex, tex] }));
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp'].includes(ext.extensionName)) ext.dispose();
  }
  const out = path.join(dst, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await io.writeBinary(doc));
  console.log(`${out}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}
if (map.models && map.models.container) {
  const dir = path.dirname(map.models.container);
  for (const f of fs.readdirSync(path.join(src, dir)).filter((n) => /^container_\w+_diff\.webp$/.test(n))) {
    await sharp(path.join(src, dir, f)).resize(tex, tex).png().toFile(path.join(dst, dir, f.replace('.webp', '.png')));
  }
}
