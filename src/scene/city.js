import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModelParts, pbrMaterial, instances, place } from '../assets.js';
import { withWindows, nightUniform } from './facade.js';
import { createSigns } from './signs.js';
import { createLogo } from './logo.js';

// Street plan, metres. The boulevard runs along X; the industrial street runs north (-Z) at x = 90.
export const PLAN = {
  boulevard: { x0: -230, x1: 230, half: 8 },          // carriageway z in [-8, 8]
  walk: 6,                                              // sidewalk width
  industrial: { x: 90, half: 6, z0: -230 },             // carriageway x in [84, 96]
  logo: new THREE.Vector3(-3, 0, -32),
  supermarket: { x0: -165, x1: -95, z0: -80, z1: -44 },
  hq: { x0: -20, x1: 14, z0: -84, z1: -58, h: 74 },
  warehouse: { x0: 24, x1: 62, z0: -136, z1: -58, h: 11 },
  factory: { x0: 108, x1: 160, z0: -112, z1: -44, h: 13 },
  cafe: -62,
};

const B = PLAN.boulevard, W = PLAN.walk, I = PLAN.industrial;
const FRONT = B.half + W;                               // building frontage, |z| = 14

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const range = (a, b) => a + rand() * (b - a);

/** Box from y to y + h with UVs in metres / tile, so textures keep real scale on any size. */
function box(w, h, d, tile, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const u = nx > .5 ? p.getZ(i) : p.getX(i);
    const v = ny > .5 ? p.getZ(i) : p.getY(i);
    uv.setXY(i, u / tile, v / tile);
  }
  return g.translate(x, y, z);
}

/** Flat ground rectangle whose top is at y. */
function slab(x0, x1, z0, z1, y, tile, thickness = .2) {
  return box(x1 - x0, thickness, z1 - z0, tile, (x0 + x1) / 2, y - thickness, (z0 + z1) / 2);
}

/** Collects geometry per material and merges it: one draw call per material. */
class Batch {
  constructor() { this.parts = new Map(); }
  add(material, geo) {
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(geo.index ? geo.toNonIndexed() : geo);
  }
  build(group, { cast = true, receive = true } = {}) {
    for (const [material, geos] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      group.add(mesh);
    }
  }
}

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Warm interior seen through the supermarket glass: ceiling lights and shelves, drawn once. */
function storeInterior() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#efe6d4';
  x.fillRect(0, 0, 1024, 256);
  const colors = ['#d9473f', '#f0b43c', '#3f8fd9', '#4fae5a', '#ffffff', '#e57b2e'];
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 64; i++) {
      x.fillStyle = colors[(i * 7 + row * 3) % colors.length];
      x.fillRect(i * 16 + 2, 100 + row * 46, 12, 30);
    }
  x.fillStyle = '#ffffff';
  for (let i = 0; i < 8; i++) x.fillRect(40 + i * 125, 22, 80, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

export async function createCity(scene) {
  const city = new THREE.Group();
  scene.add(city);

  const [lampHead, bench, bin, hydrant, planter, plant, shutter, secLight, utility, terrace, crate, carton, barrier] =
    await Promise.all(['street_lamp_02', 'modular_street_seating', 'metal_trash_can', 'fire_hydrant', 'planter_box_01',
      'potted_plant_04', 'rollershutter_door', 'security_light', 'utility_box_01', 'outdoor_table_chair_set_01',
      'plastic_crate_02', 'cardboard_box_01', 'concrete_road_barrier_02'].map(loadModelParts));
  const signs = await createSigns();
  // The roller doors come with graffiti; plain painted metal suits a corporate site.
  for (const { material } of shutter) if (material.map) { material.map = null; material.color.set('#aeb6bf'); }

  const M = {
    asphalt: pbrMaterial('asphalt_02', { color: '#8a8f96' }),
    walk: pbrMaterial('concrete_pavement'),
    plaza: pbrMaterial('concrete_pavement', { color: '#e6e4de' }),
    curb: pbrMaterial('brushed_concrete', { color: '#d6d6d1' }),
    ground: pbrMaterial('brushed_concrete', { color: '#b4b4ae' }),
    roof: pbrMaterial('concrete_floor_02', { color: '#77756f' }),
    cornice: pbrMaterial('brushed_concrete', { color: '#ffffff' }),
    brickLight: withWindows(pbrMaterial('brick_wall_10'), { ground: 4.6 }),
    brickRed: withWindows(pbrMaterial('red_brick'), { ground: 4.6, bay: 2.8 }),
    plaster: withWindows(pbrMaterial('beige_wall_001'), { ground: 4.6, bay: 3.2, win: [.25, .75, .28, .84] }),
    plaster2: withWindows(pbrMaterial('plastered_wall', { color: '#e8e4dc' }), { ground: 4.6, bay: 3.6, win: [.12, .88, .3, .82] }),
    panels: withWindows(pbrMaterial('concrete_panels'), { bay: 4, win: [.08, .92, .32, .8], lit: .35 }),
    officeGlass: withWindows(new THREE.MeshStandardMaterial({ color: '#a7b3bd', metalness: .85, roughness: .3 }),
      { curtain: true, floor: 3.8, bay: 1.6, lit: .4 }),
    metalShed: withWindows(pbrMaterial('box_profile_metal_sheet', { color: '#d5dee8', metalness: .1 }),
      { floor: 11, bay: 6, win: [.1, .9, .74, .9], lit: .9 }),
    factory: withWindows(pbrMaterial('red_brick', { color: '#d0b8a8' }), { floor: 6.5, bay: 5, win: [.25, .75, .18, .86], lit: .8 }),
  };
  const shopFacades = [M.brickLight, M.brickRed, M.plaster, M.plaster2];
  const towerFacades = [M.panels, M.plaster2, M.brickLight, M.officeGlass];
  const pick = list => list[Math.floor(rand() * list.length)];
  // Metres covered by one texture repeat.
  const TILE = new Map([[M.asphalt, 7], [M.walk, 3], [M.curb, 2], [M.plaza, 4], [M.ground, 6], [M.roof, 6], [M.cornice, 3],
    [M.brickLight, 2.6], [M.brickRed, 2.4], [M.plaster, 3], [M.plaster2, 3], [M.panels, 4], [M.officeGlass, 4],
    [M.metalShed, 3], [M.factory, 2.6]]);
  const tile = m => TILE.get(m) ?? 3;

  const batch = new Batch();
  const flat = new Batch();   // ground pieces receive shadows but never cast them
  const addBox = (m, w, h, d, x, y, z) => batch.add(m, box(w, h, d, tile(m), x, y, z));

  // ---- Ground, roads, sidewalks ----
  flat.add(M.ground, slab(-400, 400, -400, 400, -.02, tile(M.ground)));
  flat.add(M.asphalt, slab(B.x0, B.x1, -B.half, B.half, .01, tile(M.asphalt)));
  flat.add(M.asphalt, slab(I.x - I.half, I.x + I.half, I.z0, -B.half, .01, tile(M.asphalt)));
  for (const s of [-1, 1]) {
    flat.add(M.walk, slab(B.x0, B.x1, s > 0 ? B.half : -FRONT, s > 0 ? FRONT : -B.half, .15, tile(M.walk), .3));
    flat.add(M.curb, slab(B.x0, B.x1, s > 0 ? B.half : -B.half - .25, s > 0 ? B.half + .25 : -B.half, .17, tile(M.curb), .3));
    const x0 = s > 0 ? I.x + I.half : I.x - I.half - W;
    flat.add(M.walk, slab(x0, x0 + W, I.z0, -FRONT, .15, tile(M.walk), .3));
  }
  const S = PLAN.supermarket, H = PLAN.hq, L = PLAN.warehouse, F = PLAN.factory;
  flat.add(M.asphalt, slab(S.x0 - 5, S.x1 + 5, S.z1, -FRONT, .02, tile(M.asphalt)));          // parking
  flat.add(M.plaza, slab(-30, 22, H.z1, -FRONT, .16, tile(M.plaza), .3));                      // HQ plaza
  flat.add(M.asphalt, slab(L.x1, I.x - I.half - W, L.z0, -FRONT, .02, tile(M.asphalt)));      // truck apron
  flat.add(M.asphalt, slab(I.x + I.half + W, 175, F.z1, -FRONT, .02, tile(M.asphalt)));       // factory yard

  // Road markings, parking bays and crosswalks: one instanced box.
  const marks = [];
  for (let x = B.x0; x < B.x1; x += 9) {
    if (Math.abs(x - I.x) < 12) continue;
    marks.push(place(x, .03, -.12, 0, [4.5, .02, .14]), place(x, .03, .12, 0, [4.5, .02, .14]));
    marks.push(place(x, .03, -3.8, 0, [3, .02, .14]), place(x, .03, 3.8, 0, [3, .02, .14]));
  }
  for (let z = -20; z > I.z0; z -= 9) marks.push(place(I.x, .03, z, 0, [.14, .02, 4.5]));
  for (let k = -6; k <= 6; k++) marks.push(place(I.x + k * .9, .03, -FRONT - 3, 0, [.5, .02, 4]));
  for (let k = -5; k <= 5; k++) marks.push(place(PLAN.logo.x + k * 1.4, .03, 0, 0, [.7, .02, 15]));
  for (let x = S.x0; x <= S.x1; x += 2.7) marks.push(place(x, .04, -30, 0, [.12, .02, 5.2]), place(x, .04, -40, 0, [.12, .02, 5.2]));
  const markMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#e9e9e4', roughness: .7 }), marks.length);
  marks.forEach((m, i) => markMesh.setMatrixAt(i, m));
  markMesh.receiveShadow = true;
  city.add(markMesh);

  // ---- Buildings ----
  const shopNames = ['КОФЕЙНЯ', 'АПТЕКА', 'ЭЛЕКТРОНИКА', 'ОДЕЖДА', 'ЦВЕТЫ', 'ПЕКАРНЯ', 'ОПТИКА', 'КНИГИ',
    'ОБУВЬ', 'МАРКЕТ 24/7', 'ЧАЙХАНА', 'СПОРТ', 'ИГРУШКИ', 'САЛОН КРАСОТЫ'];
  const shopStyles = [{ bg: '#14263b' }, { bg: '#ffffff', fg: '#0b3a8c' }, { bg: '#2c2c2c', fg: '#f0c96a' }, { bg: '#0b3a8c' }, { bg: '#6b2b2b' }];
  const awnings = new Batch();
  const awningMats = ['#0b3a8c', '#7a2e2e', '#2f5d3a', '#3a3a3a', '#a86a2a'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .85 }));
  let shopIndex = 0;

  /** Building with cornice and roof; shops along its street face (dir +1 faces +z, -1 faces -z). */
  function building(x0, x1, zFront, depth, h, material, dir, shops = true) {
    const w = x1 - x0, cx = (x0 + x1) / 2, cz = zFront - dir * depth / 2;
    addBox(material, w, h, depth, cx, 0, cz);
    addBox(M.cornice, w + .5, .6, depth + .5, cx, h - .6, cz);
    batch.add(M.roof, box(w - .6, .25, depth - .6, tile(M.roof), cx, h, cz));
    if (rand() < .6) addBox(M.roof, range(2, 4), range(1.2, 2.2), range(2, 4), cx + range(-w / 4, w / 4), h, cz + range(-depth / 5, depth / 5));
    if (!shops) return;
    const count = Math.max(1, Math.floor(w / 9)), step = w / count;
    for (let k = 0; k < count; k++) {
      const sx = x0 + step * (k + .5);
      // Each name keeps one style (one atlas row); the shop behind the terrace is the cafe.
      const ni = dir < 0 && Math.abs(sx - PLAN.cafe) <= step / 2 ? 0 : shopIndex % shopNames.length;
      signs.add(shopNames[ni], shopStyles[ni % shopStyles.length],
        place(sx, 4.25, zFront + dir * .09, dir > 0 ? 0 : Math.PI), .62);
      shopIndex++;
      if (rand() < .55)
        awnings.add(awningMats[shopIndex % awningMats.length],
          new THREE.BoxGeometry(step - 1.2, .12, 1.6).rotateX(dir * .32).translate(sx, 3.85, zFront + dir * .8));
    }
  }

  // South side: a continuous shop row, then a taller second row behind it.
  for (let x = B.x0 + 4; x < B.x1 - 20;) {
    const w = range(16, 26);
    building(x, x + w - .4, FRONT, range(16, 22), 4.6 + 3.4 * Math.floor(range(2, 6)), pick(shopFacades), -1);
    x += w;
  }
  for (let x = B.x0; x < B.x1;) {
    const w = range(20, 34);
    building(x, x + w - 2, FRONT + 30, 22, range(28, 60), pick(towerFacades), -1, false);
    x += w + range(4, 10);
  }
  // North side fillers between the businesses.
  for (const [a, b] of [[-90, -36], [24, I.x - I.half - W - 2], [176, B.x1 - 12]])
    for (let x = a; x < b - 8;) {
      const w = Math.min(range(16, 24), b - x);
      building(x, x + w - .4, -FRONT, range(16, 20), 4.6 + 3.4 * Math.floor(range(3, 7)), pick(shopFacades), 1);
      x += w;
    }
  building(-230, -170, -FRONT, 22, 22, M.plaster2, 1);
  // Backdrop towers to the north and buildings closing both ends of the boulevard.
  for (let k = 0; k < 26; k++) {
    const x = range(-260, 260), z = range(-260, -150), w = range(20, 34);
    if (x + w > I.x - 14 && x < I.x + 14) continue;      // keep the industrial street clear
    building(x, x + w, z, range(18, 30), range(30, 90), pick(towerFacades), 1, false);
  }
  for (const end of [-1, 1]) building(end * 236 - 20, end * 236 + 20, 20, 40, 40, M.panels, 1, false);

  // Fill every plot not taken by a street or a business with plain city blocks (seen from the air).
  const taken = [
    [-240, 240, -14, 70], [78, 102, -240, 14], [-172, -88, -88, -14], [-32, 24, -92, -14],
    [20, 80, -142, -14], [100, 178, -120, -14], [-92, 240, -38, -14], [-240, -168, -38, -14],
  ];
  const free = (x0, x1, z0, z1) => !taken.some(([a, b, c, d]) => x0 < b && x1 > a && z0 < d && z1 > c);
  for (let x = -230; x < 230; x += 38)
    for (const [z, zEnd] of [[-150, -38], [72, 200]])
      for (let zz = z; zz < zEnd; zz += 38) {
        if (!free(x, x + 30, zz, zz + 30)) continue;
        const far = Math.min(1, Math.abs(zz) / 200);
        for (const [dx, dz] of [[0, 0], [15, 0], [0, 15], [15, 15]])
          if (rand() < .8) building(x + dx, x + dx + 13, zz + dz + 13, 13, range(12, 26) + far * range(0, 40), pick(towerFacades), 1, false);
      }

  // ---- Supermarket ----
  const sx = (S.x0 + S.x1) / 2, sz = (S.z0 + S.z1) / 2;
  addBox(M.plaster2, S.x1 - S.x0, 10, S.z1 - S.z0, sx, 0, sz);
  addBox(M.cornice, S.x1 - S.x0 + .6, 1.4, S.z1 - S.z0 + .6, sx, 9.2, sz);
  batch.add(M.roof, box(S.x1 - S.x0 - 1, .25, S.z1 - S.z0 - 1, 6, sx, 10.6, sz));
  const shopGlass = new THREE.MeshStandardMaterial({
    color: '#4a5560', map: storeInterior(), metalness: .55, roughness: .05, emissive: '#ffffff', emissiveIntensity: 0,
  });
  shopGlass.emissiveMap = shopGlass.map;
  const glassFront = new THREE.Mesh(new THREE.PlaneGeometry(S.x1 - S.x0 - 4, 6.2), shopGlass);
  glassFront.position.set(sx, 3.4, S.z1 + .06);
  glassFront.receiveShadow = true;
  city.add(glassFront);
  const mullionStep = (S.x1 - S.x0 - 4) / 12;
  for (let k = 0; k <= 12; k++) addBox(M.cornice, .22, 6.4, .3, S.x0 + 2 + k * mullionStep, .3, S.z1 + .12);
  addBox(M.cornice, 14, .5, 5, sx, 6.6, S.z1 + 2.5);                       // entrance canopy
  signs.add('СУПЕРМАРКЕТ', { bg: '#0b3a8c' }, place(sx, 8.3, S.z1 + .4), 2.2);

  // ---- Cloudplus HQ tower, plaza and the hero logo ----
  const hx = (H.x0 + H.x1) / 2, hz = (H.z0 + H.z1) / 2;
  addBox(M.officeGlass, H.x1 - H.x0, H.h, H.z1 - H.z0, hx, 0, hz);
  addBox(M.cornice, H.x1 - H.x0 + 1, 6, H.z1 - H.z0 + 1, hx, 0, hz);
  addBox(M.cornice, H.x1 - H.x0 + .4, 1.2, H.z1 - H.z0 + .4, hx, H.h, hz);
  const logo = await createLogo();
  logo.group.position.copy(PLAN.logo);
  city.add(logo.group);
  addBox(M.cornice, 32, 1.4, 6, PLAN.logo.x, .1, PLAN.logo.z - .8);       // plinth
  const crownLogo = await createLogo();
  crownLogo.group.scale.setScalar(.42);
  crownLogo.group.position.set(hx, H.h + 1.2, H.z1 - 1);
  city.add(crownLogo.group);

  // ---- Logistics centre: docks face the industrial street ----
  addBox(M.metalShed, L.x1 - L.x0, L.h, L.z1 - L.z0, (L.x0 + L.x1) / 2, 0, (L.z0 + L.z1) / 2);
  addBox(M.cornice, L.x1 - L.x0 + .4, .5, L.z1 - L.z0 + .4, (L.x0 + L.x1) / 2, L.h, (L.z0 + L.z1) / 2);
  addBox(M.curb, 2.4, 1.2, L.z1 - L.z0 - 8, L.x1 + 1.2, 0, (L.z0 + L.z1) / 2);   // loading dock
  const doors = [], secLights = [], stock = [], cartons = [];
  for (let z = L.z1 - 10; z > L.z0 + 6; z -= 9) {
    // Models face +z; a quarter turn makes them face the street (+x).
    doors.push(place(L.x1 + .05, 1.2, z + 1, Math.PI / 2, [1.3, 1.4, 1.3]));
    secLights.push(place(L.x1 + .05, 6.4, z, Math.PI / 2, 1.4));
    for (let k = 0; k < 6; k++) stock.push(place(L.x1 + 1.4 + rand() * .6, 1.2 + (k % 3) * .26, z - 4 + Math.floor(k / 3) * .45, rand() * .2));
    for (let k = 0; k < 5; k++) cartons.push(place(L.x1 + 2.2, 1.2 + (k % 2) * .35, z + 3.5 + Math.floor(k / 2) * .5, 0, 1.4));
  }
  signs.add('ЛОГИСТИЧЕСКИЙ ЦЕНТР', { bg: '#0f1b2b' }, place(L.x1 + .1, 9, (L.z0 + L.z1) / 2, Math.PI / 2), 1.6);
  signs.add('ЛОГИСТИКА', { bg: '#0b3a8c' }, place((L.x0 + L.x1) / 2, 8.8, L.z1 + .1), 1.8);

  // ---- Production ----
  const fx = (F.x0 + F.x1) / 2;
  addBox(M.factory, F.x1 - F.x0, F.h, F.z1 - F.z0, fx, 0, (F.z0 + F.z1) / 2);
  for (let x = F.x0 + 4; x < F.x1; x += 8)            // sawtooth roof
    batch.add(M.roof, new THREE.CylinderGeometry(4.6, 4.6, F.z1 - F.z0 - 2, 3, 1)
      .rotateX(Math.PI / 2).rotateZ(Math.PI / 6).translate(x, F.h, (F.z0 + F.z1) / 2));
  const stack = new THREE.CylinderGeometry(1.1, 1.5, 34, 20, 1).translate(0, 17, 0);
  for (const x of [F.x1 - 8, F.x1 - 14]) batch.add(M.cornice, stack.clone().translate(x, 0, F.z0 + 10));
  signs.add('ПРОИЗВОДСТВО', { bg: '#0f1b2b' }, place(fx, 10.5, F.z1 + .1), 1.8);
  addBox(M.cornice, 10, 4.6, .4, fx, 0, F.z1 + .1);                        // gate frame

  // ---- Street furniture ----
  const poles = [], pools = [], benches = [], bins = [], hydrants = [], planters = [], utilities = [], barriers = [], trees = [], tables = [];
  for (let x = B.x0 + 6; x < B.x1; x += 26)
    for (const s of [-1, 1]) {
      if (Math.abs(x - I.x) < 10) continue;
      poles.push(place(x, .15, s * (B.half + .7), s > 0 ? Math.PI : 0));
      pools.push(place(x, .2, s * (B.half - 1.2), 0, 9));
    }
  for (let z = -24; z > I.z0; z -= 26)
    for (const s of [-1, 1]) {
      poles.push(place(I.x + s * (I.half + .7), .15, z, s > 0 ? -Math.PI / 2 : Math.PI / 2));
      pools.push(place(I.x + s * (I.half - 1.2), .2, z, 0, 9));
    }
  for (let x = B.x0 + 19; x < B.x1; x += 52)
    for (const s of [-1, 1]) {
      if (Math.abs(x - I.x) < 12 || (s < 0 && x > S.x0 - 5 && x < S.x1 + 5)) continue;
      benches.push(place(x, .3, s * (FRONT - 3.2), s > 0 ? Math.PI : 0));
      bins.push(place(x + 3.2, .3, s * (FRONT - 3.4), s > 0 ? Math.PI : 0, .9));
      hydrants.push(place(x - 9, .3, s * (B.half + 1.2), rand() * 6));
      trees.push([x - 13, s * (B.half + 2.6)], [x + 13, s * (B.half + 2.6)]);
    }
  for (let x = -26; x <= 18; x += 7.3) planters.push(place(x, .32, -FRONT - 1.2, 0, 2.4));
  const plants = planters.map(p => p.clone().multiply(place(0, .42, 0, 0, [2.2, 3.6, 2.2])));
  for (let k = 0; k < 4; k++) utilities.push(place(range(-150, 150), .3, (rand() < .5 ? -1 : 1) * (FRONT - .5), 0, 1.2));
  for (let z = F.z1 + 2; z < -FRONT - 2; z += 2) barriers.push(place(F.x0 - 2, .02, z, Math.PI / 2, 1.2));
  for (let k = 0; k < 5; k++) tables.push(place(PLAN.cafe - 6 + k * 3, .3, FRONT - 2.6, rand() * .4, 1.3));
  const wallLamps = [];
  for (let x = -86; x < -36; x += 9) wallLamps.push(place(x, 3.1, -FRONT, 0, 1.1));

  const lampPoleGeo = mergeGeometries([
    new THREE.CylinderGeometry(.08, .13, 8, 10).translate(0, 4, 0),
    new THREE.BoxGeometry(.1, .1, 2.2).translate(0, 7.9, 1.05),
    new THREE.BoxGeometry(.5, .16, .9).translate(0, 7.85, 2.1),
  ].map(g => g.toNonIndexed()));
  const poleMat = new THREE.MeshStandardMaterial({ color: '#3b434c', metalness: .8, roughness: .45 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffd9a0', emissiveIntensity: 0 });
  const heads = poles.map(m => m.clone().multiply(place(0, 7.76, 2.1, 0, [.42, .04, .78])));
  const poolMat = new THREE.MeshBasicMaterial({
    map: glowTexture('rgba(255,200,140,0.55)', 'rgba(255,200,140,0)'), transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });

  // Trees: trunk plus a crown of five lumpy spheres, instanced.
  const crown = mergeGeometries([0, 1, 2, 3, 4].map(k => {
    const g = new THREE.IcosahedronGeometry(1.3, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const n = .85 + .3 * Math.sin(p.getX(i) * 5.1 + k) * Math.cos(p.getZ(i) * 4.3 + p.getY(i) * 3.7);
      p.setXYZ(i, p.getX(i) * n, p.getY(i) * n, p.getZ(i) * n);
    }
    const a = k * 1.4, r = k ? 1 : 0;
    return g.translate(Math.cos(a) * r, k ? range(-.3, .5) : .7, Math.sin(a) * r);
  })).translate(0, 5.2, 0);
  crown.deleteAttribute('normal');
  crown.deleteAttribute('uv');
  const smoothCrown = mergeVertices(crown, .05);   // shared vertices give smooth, leafy shading
  smoothCrown.computeVertexNormals();
  const treeM = trees.map(([x, z]) => place(x, .15, z, rand() * 6, range(.9, 1.2)));

  city.add(
    instances([{ geometry: lampPoleGeo, material: poleMat }], poles),
    instances([{ geometry: new THREE.BoxGeometry(1, 1, 1), material: bulbMat }], heads, { cast: false }),
    instances([{ geometry: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material: poolMat }], pools, { cast: false, receive: false }),
    instances([{ geometry: new THREE.CylinderGeometry(.12, .2, 4.4, 8).translate(0, 2.2, 0),
      material: new THREE.MeshStandardMaterial({ color: '#4e4237', roughness: .95 }) }], treeM),
    instances([{ geometry: smoothCrown, material: new THREE.MeshStandardMaterial({ color: '#4d6a3c', roughness: .9 }) }], treeM),
    // Small props skip the shadow pass: their shadows are barely visible but cost triangles.
    instances(bench, benches), instances(bin, bins, { cast: false }), instances(hydrant, hydrants, { cast: false }),
    instances(planter, planters), instances(plant, plants, { cast: false }), instances(utility, utilities),
    instances(barrier, barriers), instances(terrace, tables), instances(shutter, doors, { cast: false }),
    instances(secLight, secLights, { cast: false }), instances(crate, stock, { cast: false }),
    instances(carton, cartons, { cast: false }), instances(lampHead, wallLamps, { cast: false }),
  );

  batch.build(city);
  flat.build(city, { cast: false });
  awnings.build(city);
  const signMesh = signs.build();
  city.add(signMesh);

  function update(light) {
    const n = THREE.MathUtils.smoothstep(light.night, .35, .85);
    nightUniform.value = n;
    bulbMat.emissiveIntensity = 4 * n;
    poolMat.opacity = n;
    shopGlass.emissiveIntensity = .55 * n;
    signMesh.material.emissiveIntensity = .1 + .9 * n;
    logo.update(n);
    crownLogo.update(n);
  }

  return { group: city, update };
}
