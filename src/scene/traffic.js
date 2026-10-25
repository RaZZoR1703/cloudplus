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
  return { name, body: mk(body, count), wheels: mk(wheel, count * 4), wheelOffsets };
}

function isDescendant(o, node) {
  for (let p = o; p; p = p.parent) if (p === node) return true;
  return false;
}

const v2 = (x, z) => new THREE.Vector3(x, .02, z);

/** Straight runs joined by quarter-circle turns; cars follow it at constant speed. */
function route(points, radius = 5) {
  const path = new THREE.CurvePath();
  let from = points[0];
  for (let i = 1; i < points.length; i++) {
    const corner = points[i], next = points[i + 1];
    if (!next) { path.add(new THREE.LineCurve3(from, corner)); break; }
    const a = corner.clone().addScaledVector(from.clone().sub(corner).normalize(), radius);
    const b = corner.clone().addScaledVector(next.clone().sub(corner).normalize(), radius);
    path.add(new THREE.LineCurve3(from, a));
    path.add(new THREE.QuadraticBezierCurve3(a, corner, b));
    from = b;
  }
  return path;
}

/**
 * Moving traffic plus parked cars.
 * Every street runs on into the fog, so cars appear and disappear far away.
 * A lane group shares one speed and one cycle: cars in it keep their spacing on the
 * stretch their routes have in common (the start or the end), so they never overlap.
 * Only cars near the camera are written to the instanced meshes.
 */
export async function createTraffic(scene) {
  const B = PLAN.boulevard, I = PLAN.industrial, S = PLAN.supermarket, L = PLAN.warehouse;
  const E = B.x1 - 20, N = I.z0 + 20;                        // where routes start and end, deep in the fog
  let seed = 3;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const type = () => rand() < .2 ? 'van' : rand() < .5 ? 'sedan' : 'crossover';

  // Right-hand traffic: eastbound (+x) lanes at z > 0. Routes are listed with how many cars use them.
  const groups = [
    { speed: 11, align: 'start', routes: [[route([v2(-E, 2), v2(E, 2)]), 14]] },
    { speed: 8.5, align: 'start', routes: [[route([v2(-E, 5.7), v2(E, 5.7)]), 12]] },
    // Westbound inner lane: some cars turn right into the industrial street.
    { speed: 10.5, align: 'start', routes: [[route([v2(E, -2), v2(-E, -2)]), 10],
      [route([v2(E, -2), v2(I.x + 2.6, -2), v2(I.x + 2.6, N)]), 4]] },
    // Westbound outer lane: cars from the industrial street merge in by a right turn.
    { speed: 8, align: 'end', routes: [[route([v2(E, -5.7), v2(-E, -5.7)]), 10],
      [route([v2(I.x - 2.6, N), v2(I.x - 2.6, -5.7), v2(-E, -5.7)]), 4]] },
  ];
  const cars = [];
  for (const g of groups) {
    g.period = Math.max(...g.routes.map(([r]) => r.getLength()));
    const total = g.routes.reduce((n, [, c]) => n + c, 0);
    let k = 0;
    for (const [r, count] of g.routes)
      for (let c = 0; c < count; c++, k++) {
        const turning = r !== g.routes[0][0];   // industrial-street traffic is mostly vans
        // Spread the group evenly over its cycle; a little jitter, never closer than ~25 m.
        const u0 = (k + rand() * .3) * g.period / total;
        cars.push({ type: turning && rand() < .6 ? 'van' : type(), group: g, route: r, length: r.getLength(), u0 });
      }
  }
  for (const c of cars) c.color = PAINT[Math.floor(rand() * PAINT.length)];

  const parked = [];
  for (let k = 0; k < 9; k++) {
    const x = S.x0 + 4 + Math.floor(rand() * 24) * 2.7;
    parked.push({ type: rand() < .5 ? 'sedan' : 'crossover', color: PAINT[k % PAINT.length],
      m: place(x, .02, rand() < .5 ? -30 : -40, Math.PI / 2 * (rand() < .5 ? 1 : -1)) });
  }
  for (let z = L.z1 - 10; z > L.z1 - 50; z -= 18) parked.push({ type: 'van', color: '#f2f4f6', m: place(L.x1 + 5.2, .02, z, Math.PI) });

  // Instance slots per type: enough for everything near the camera at once.
  const MAX = { sedan: 24, crossover: 24, van: 16 };
  const models = {};
  await Promise.all(Object.keys(MAX).map(async t => { models[t] = await loadCar(t, MAX[t]); }));
  const group = new THREE.Group();
  for (const t of Object.keys(models)) group.add(...models[t].body, ...models[t].wheels);
  scene.add(group);
  for (const t of Object.values(models)) t.paint = t.body.find(m => m.material.name === 'body_paint');

  const lamps = new Set();
  for (const t of Object.values(models)) for (const mesh of t.body)
    if (/front_led|rear_led/.test(mesh.material.name)) lamps.add(mesh.material);
  for (const mat of lamps) mat.emissive.set(/front/.test(mat.name) ? '#fff1d6' : '#ff2a1a');

  const used = { sedan: 0, crossover: 0, van: 0 };
  const color = new THREE.Color(), w = new THREE.Matrix4(), spin = new THREE.Matrix4(), tr = new THREE.Matrix4();
  const pos = new THREE.Vector3(), tan = new THREE.Vector3(), m = new THREE.Matrix4();
  function write(model, carMatrix, roll, paint) {
    const slot = used[model.name]++;
    for (const mesh of model.body) mesh.setMatrixAt(slot, carMatrix);
    model.paint.setColorAt(slot, color.set(paint));
    spin.makeRotationZ(-roll);
    model.wheelOffsets.forEach((o, k) => {
      tr.makeTranslation(o.p.x, o.p.y, o.p.z);
      w.multiplyMatrices(carMatrix, tr).multiply(spin).multiply(o.rot);
      for (const mesh of model.wheels) mesh.setMatrixAt(slot * 4 + k, w);
    });
  }

  const RANGE = 320;   // cars further from the camera than this are not drawn
  /** time: seconds since start (absolute, so any moment can be rendered exactly). */
  function update(time, night, camera) {
    used.sedan = used.crossover = used.van = 0;
    for (const p of parked) {
      pos.setFromMatrixPosition(p.m);
      if (pos.distanceTo(camera) < RANGE && used[p.type] < MAX[p.type]) write(models[p.type], p.m, 0, p.color);
    }
    for (const c of cars) {
      const g = c.group;
      const u = (c.u0 + g.speed * time) % g.period;
      const s = u - (g.align === 'end' ? g.period - c.length : 0);
      if (s < 0 || s > c.length) continue;                      // off its route this cycle
      const f = s / c.length;
      c.route.getPointAt(f, pos);
      if (pos.distanceTo(camera) > RANGE || used[c.type] >= MAX[c.type]) continue;
      c.route.getTangentAt(f, tan);
      m.makeRotationY(Math.atan2(-tan.z, tan.x)).setPosition(pos);
      write(models[c.type], m, s / WHEEL_RADIUS, c.color);
    }
    for (const [t, model] of Object.entries(models)) {
      for (const mesh of model.body) { mesh.count = used[t]; mesh.instanceMatrix.needsUpdate = true; }
      for (const mesh of model.wheels) { mesh.count = used[t] * 4; mesh.instanceMatrix.needsUpdate = true; }
      if (model.paint.instanceColor) model.paint.instanceColor.needsUpdate = true;
    }
    for (const mat of lamps) mat.emissiveIntensity = (/front/.test(mat.name) ? 4 : 2.5) * night;
  }
  return { update };
}
