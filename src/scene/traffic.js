import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { manager, place, bakedGeometry } from '../assets.js';
import { PLAN } from './city.js';

const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const BASE = `${import.meta.env.BASE_URL}assets/models/`;
const WHEEL_RADIUS = .36;
const PAINT = ['#f2f4f6', '#1d2733', '#8d99a6', '#0b3a8c', '#3f6377', '#6b1f24', '#c9ccd1', '#2b2f33'];

/**
 * One car model split into body parts (per material) and one wheel, so every car of
 * that type is drawn with a handful of InstancedMeshes and wheels can spin.
 */
async function loadCar(name, count) {
  const gltf = await loader.loadAsync(`${BASE}car_${name}.glb`);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const wheelNodes = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map(n => root.getObjectByName(n));
  const inWheel = o => wheelNodes.some(w => isDescendant(o, w));

  const body = new Map(), wheel = new Map();
  const inv = new THREE.Matrix4().copy(wheelNodes[0].matrixWorld).invert();
  root.traverse(o => {
    if (!o.isMesh) return;
    const isWheel = inWheel(o);
    if (isWheel && !isDescendant(o, wheelNodes[0])) return;     // one wheel is enough, reused four times
    const m = isWheel ? new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) : o.matrixWorld;
    const geo = bakedGeometry(o.geometry, m, ['position', 'normal']);
    const map = isWheel ? wheel : body;
    if (!map.has(o.material)) map.set(o.material, []);
    map.get(o.material).push(geo.index ? geo.toNonIndexed() : geo);
  });

  const mk = (map, n) => [...map].map(([material, geos]) => {
    if (material.name === 'body_paint') material.color.set('#ffffff');   // per-instance colour
    const mesh = new THREE.InstancedMesh(mergeGeometries(geos), material, n);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  });
  const wheelOffsets = wheelNodes.map(w => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    w.matrixWorld.decompose(p, q, s);
    return { p, rot: new THREE.Matrix4().compose(new THREE.Vector3(), q, s) };
  });
  return { body: mk(body, count), wheels: mk(wheel, count * 4), wheelOffsets, count };
}

function isDescendant(o, node) {
  for (let p = o; p; p = p.parent) if (p === node) return true;
  return false;
}

/**
 * Moving traffic on the boulevard and industrial street, plus parked cars.
 * Cars on one lane share a speed, so they never run into each other.
 */
export async function createTraffic(scene) {
  const B = PLAN.boulevard, I = PLAN.industrial, S = PLAN.supermarket, L = PLAN.warehouse;
  const cars = [];
  let seed = 3;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // Lanes: right-hand traffic. Eastbound (+x) uses z > 0; cars face +x in model space.
  const lanes = [
    { axis: 'x', off: 2, dir: 1, speed: 11 }, { axis: 'x', off: 5.7, dir: 1, speed: 8.5 },
    { axis: 'x', off: -2, dir: -1, speed: 10.5 }, { axis: 'x', off: -5.7, dir: -1, speed: 8 },
    { axis: 'z', off: I.x + 2.6, dir: -1, speed: 7 }, { axis: 'z', off: I.x - 2.6, dir: 1, speed: 7.5 },
  ];
  const span = l => l.axis === 'x' ? [B.x0 + 12, B.x1 - 12] : [I.z0 + 10, -B.half - 6];
  for (const lane of lanes) {
    const [a, b] = span(lane), n = lane.axis === 'x' ? 5 : 2;
    for (let k = 0; k < n; k++)
      cars.push({ type: lane.axis === 'z' || rand() < .2 ? 'van' : rand() < .5 ? 'sedan' : 'crossover',
        lane, a, b, s: a + (b - a) * (k + rand() * .5) / n, color: PAINT[Math.floor(rand() * PAINT.length)] });
  }
  // Parked: supermarket bays and vans at the warehouse docks.
  const parked = [];
  for (let k = 0; k < 9; k++) {
    const x = S.x0 + 4 + Math.floor(rand() * 24) * 2.7;
    parked.push({ type: rand() < .5 ? 'sedan' : 'crossover', m: place(x, .02, rand() < .5 ? -30 : -40, Math.PI / 2 * (rand() < .5 ? 1 : -1)) });
  }
  for (let z = L.z1 - 10; z > L.z1 - 50; z -= 18) parked.push({ type: 'van', m: place(L.x1 + 5.2, .02, z, Math.PI), color: '#f2f4f6' });

  const counts = { sedan: 0, crossover: 0, van: 0 };
  for (const c of [...cars, ...parked]) counts[c.type]++;
  const models = {};
  await Promise.all(Object.keys(counts).map(async t => { models[t] = await loadCar(t, counts[t]); }));
  const group = new THREE.Group();
  for (const t of Object.keys(models)) group.add(...models[t].body, ...models[t].wheels);
  scene.add(group);

  // Slots per type; colours are set once.
  const slots = { sedan: 0, crossover: 0, van: 0 };
  const color = new THREE.Color();
  for (const c of [...cars, ...parked]) {
    c.slot = slots[c.type]++;
    c.model = models[c.type];
    for (const mesh of c.model.body)
      if (mesh.material.name === 'body_paint') mesh.setColorAt(c.slot, color.set(c.color ?? PAINT[c.slot % PAINT.length]));
  }

  const m = new THREE.Matrix4(), w = new THREE.Matrix4(), spin = new THREE.Matrix4(), tr = new THREE.Matrix4();
  function write(c, carMatrix, roll) {
    for (const mesh of c.model.body) mesh.setMatrixAt(c.slot, carMatrix);
    c.model.wheelOffsets.forEach((o, k) => {
      spin.makeRotationZ(-roll);
      tr.makeTranslation(o.p.x, o.p.y, o.p.z);
      w.multiplyMatrices(carMatrix, tr).multiply(spin).multiply(o.rot);
      for (const mesh of c.model.wheels) mesh.setMatrixAt(c.slot * 4 + k, w);
    });
  }
  for (const c of parked) write(c, c.m, 0);

  const lamps = new Set();
  for (const t of Object.values(models)) for (const mesh of t.body)
    if (/front_led|rear_led/.test(mesh.material.name)) lamps.add(mesh.material);
  for (const mat of lamps) mat.emissive.set(/front/.test(mat.name) ? '#fff1d6' : '#ff2a1a');

  function update(dt, night) {
    for (const c of cars) {
      const { lane, a, b } = c;
      c.s += lane.speed * lane.dir * dt;
      if (c.s > b) c.s = a;
      if (c.s < a) c.s = b;
      if (lane.axis === 'x') m.copy(place(c.s, .02, lane.off, lane.dir > 0 ? 0 : Math.PI));
      else m.copy(place(lane.off, .02, c.s, lane.dir < 0 ? Math.PI / 2 : -Math.PI / 2));
      write(c, m, c.s * lane.dir / WHEEL_RADIUS);
    }
    for (const t of Object.values(models)) for (const mesh of [...t.body, ...t.wheels]) mesh.instanceMatrix.needsUpdate = true;
    for (const mat of lamps) mat.emissiveIntensity = (/front/.test(mat.name) ? 4 : 2.5) * night;
  }
  update(0, 0);
  return { update };
}
