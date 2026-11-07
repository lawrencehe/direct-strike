// 修材质：把 Opacity 贴图合进 baseColor 的 alpha，BLEND 改 MASK，法线强度改 1。由 build.sh 调用
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
const [inp, out, texDir] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
for (const m of doc.getRoot().listMaterials()) {
  const k = m.getName().match(/PackedMaterial(\d)/)[1];
  const tex = m.getBaseColorTexture();
  const rgb = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = rgb.info;
  const alpha = await sharp(`${texDir}/Ukrainian_Soldier1_Packed${k}_Opacity.png`).extractChannel(0).resize(width, height).raw().toBuffer();
  const raw = { width, height, channels: 3 };
  const png = await sharp(rgb.data, { raw }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
  tex.setImage(png).setMimeType('image/png');
  m.setAlphaMode('MASK').setAlphaCutoff(0.5);
  if (m.getNormalTexture()) m.setNormalScale(1);
  console.log(m.getName(), width, height, 'MASK');
}
await io.write(out, doc);
