// Turns the downloaded Poly Haven sources (assets-src/, not in git) into web-ready files in public/assets/.
//   models:   simplified, welded, meshopt-compressed GLB with 512 px WebP textures
//   textures: 1k WebP colour + normal, and a packed ORM map (R = AO, G = roughness, B = metalness 0)
//   HDRIs:    copied as-is (1k .hdr)
// Usage: node scripts/build-assets.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, meshopt, resample, flatten, join } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const SRC = 'assets-src', OUT = 'public/assets';

// Target triangle budget per model, used to pick the simplify ratio.
const MODELS = {
  street_lamp_02: 3000, metal_trash_can: 1200, modular_street_seating: 1500, concrete_road_barrier_02: 1200,
  fire_hydrant: 1500, planter_box_01: 2500, rollershutter_door: 1200, security_light: 1200, utility_box_01: 1500,
  outdoor_table_chair_set_01: 3000, plastic_crate_02: 400, potted_plant_04: 2500, cardboard_box_01: 600,
};

async function countTriangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      n += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    }
  return Math.round(n);
}

async function buildModels() {
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  await fs.mkdir(`${OUT}/models`, { recursive: true });
  for (const [name, budget] of Object.entries(MODELS)) {
    const doc = await io.read(`${SRC}/models/${name}/${name}_1k.gltf`);
    const before = await countTriangles(doc);
    const ratio = Math.min(1, budget / before);
    await doc.transform(
      dedup(), flatten(), join(), weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio, error: .03, lockBorder: false }),
      resample(), prune(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512] }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    const after = await countTriangles(doc);
    await io.write(`${OUT}/models/${name}.glb`, doc);
    const kb = (await fs.stat(`${OUT}/models/${name}.glb`)).size / 1024;
    console.log(`${name}: ${before} -> ${after} tris, ${kb.toFixed(0)} KB`);
  }

  // The v8 cars (the user's own models): keep node names and materials, just lighter.
  for (const name of ['sedan', 'crossover', 'van']) {
    const doc = await io.read(`public/v8/assets/models/${name}.glb`);
    const before = await countTriangles(doc);
    await doc.transform(
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio: .4, error: .002 }),
      prune(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    await io.write(`${OUT}/models/car_${name}.glb`, doc);
    console.log(`car_${name}: ${before} -> ${await countTriangles(doc)} tris`);
  }
}

async function buildTextures() {
  await fs.mkdir(`${OUT}/tex`, { recursive: true });
  for (const name of await fs.readdir(`${SRC}/tex`)) {
    const dir = `${SRC}/tex/${name}`;
    const files = await fs.readdir(dir);
    const find = key => files.find(f => f.includes(`_${key}_`)) && path.join(dir, files.find(f => f.includes(`_${key}_`)));
    const out = `${OUT}/tex/${name}`;
    // Neutral grey for the metal cladding, so the material colour can tint it.
    const grey = name === 'box_profile_metal_sheet';
    const diff = sharp(find('diff'));
    if (grey) diff.greyscale().linear(3.4, 15);   // red paint is dark once grey: lift it to a light metal
    await diff.webp({ quality: 82 }).toFile(`${out}_color.webp`);
    await sharp(find('nor')).webp({ quality: 90 }).toFile(`${out}_normal.webp`);

    // ORM: prefer Poly Haven's packed "arm" map (R AO, G rough, B metal); otherwise build it.
    if (find('arm')) {
      await sharp(find('arm')).webp({ quality: 88 }).toFile(`${out}_orm.webp`);
    } else {
      const { width, height } = await sharp(find('rough')).metadata();
      const grey = async file => file
        ? sharp(file).resize(width, height).greyscale().raw().toBuffer()
        : Buffer.alloc(width * height, 255);
      const rough = await grey(find('rough')), ao = await grey(find('ao'));
      const orm = Buffer.alloc(width * height * 3);
      for (let i = 0; i < width * height; i++) {
        orm[i * 3] = ao[i];
        orm[i * 3 + 1] = rough[i];
        orm[i * 3 + 2] = 0;
      }
      await sharp(orm, { raw: { width, height, channels: 3 } }).webp({ quality: 88 }).toFile(`${out}_orm.webp`);
    }
    console.log(`texture ${name}`);
  }
}

async function copyHdris() {
  await fs.mkdir(`${OUT}/hdri`, { recursive: true });
  for (const f of await fs.readdir(`${SRC}/hdri`)) {
    if (!f.endsWith('_1k.hdr')) continue;
    await fs.copyFile(`${SRC}/hdri/${f}`, `${OUT}/hdri/${f.replace('_1k', '')}`);
    console.log(`hdri ${f}`);
  }
}

await buildTextures();
await copyHdris();
await buildModels();
