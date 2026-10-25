import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { facadeMaterial, nightUniform } from './facade.js';

// Stage-1 placeholder city: real CC0 models replace these primitives in stage 2.
// The layout (grid, hero lots, roads) is what later stages build on.
const GRID = { cells: 6, pitch: 28, road: 8 };
const HALF = GRID.cells * GRID.pitch / 2 + 8;         // half-size of the diorama base
const roadLine = i => -GRID.cells * GRID.pitch / 2 + i * GRID.pitch;
const blockCenter = j => roadLine(j) + GRID.pitch / 2;
const BLOCK = GRID.pitch - GRID.road;

// Department lots, by block index [column, row].
const DEPARTMENTS = {
  hq: { block: [2, 2], name: 'Штаб-квартира и ИИ' },
  sales: { block: [1, 3], name: 'Продажи (CRM)' },
  warehouse: { block: [4, 1], name: 'Склад' },
  production: { block: [4, 4], name: 'Производство' },
  finance: { block: [1, 1], name: 'Финансы' },
};

let seed = 9;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = arr => arr[Math.floor(rand() * arr.length)];

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const c = new THREE.Color();

function instanced(geo, mat, items, { cast = true, receive = true, colors } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
    if (colors) mesh.setColorAt(i, c.set(colors[i]));
  });
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.computeBoundingSphere();
  return mesh;
}

const box = (x, y, z, w, h, d, ry = 0) =>
  new THREE.Matrix4().compose(v.set(x, y, z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ry), s.set(w, h, d));

export function createCity(scene) {
  const city = new THREE.Group();
  scene.add(city);
  const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);

  // Diorama base and the world around it.
  const plinthMat = new THREE.MeshStandardMaterial({ color: '#e9edf2', roughness: .9 });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 6, 4, HALF * 2 + 6).translate(0, -2, 0), plinthMat);
  plinth.receiveShadow = true;
  city.add(plinth);

  const world = new THREE.Mesh(
    new THREE.CircleGeometry(1400, 64).rotateX(-Math.PI / 2).translate(0, -4, 0),
    new THREE.MeshStandardMaterial({ color: '#c9d3de', roughness: 1 }));
  world.receiveShadow = true;
  city.add(world);

  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2).rotateX(-Math.PI / 2).translate(0, .01, 0),
    new THREE.MeshStandardMaterial({ color: '#6a717c', roughness: .92 }));   // mid-grey so shadows read
  asphalt.receiveShadow = true;
  city.add(asphalt);

  // Sidewalk slabs (one per block) and dashed lane markings.
  const slabs = [];
  for (let i = 0; i < GRID.cells; i++)
    for (let j = 0; j < GRID.cells; j++)
      slabs.push(box(blockCenter(i), 0, blockCenter(j), BLOCK + 2, .3, BLOCK + 2));
  city.add(instanced(unit, new THREE.MeshStandardMaterial({ color: '#d6dbe1', roughness: .95 }), slabs, { cast: false }));

  const dashes = [];
  for (let i = 0; i <= GRID.cells; i++)
    for (let p = -HALF + 2; p < HALF - 2; p += 6) {
      dashes.push(box(roadLine(i), .02, p, .25, .02, 3));
      dashes.push(box(p, .02, roadLine(i), 3, .02, .25));
    }
  city.add(instanced(unit, new THREE.MeshBasicMaterial({ color: '#c9ced6' }), dashes, { cast: false, receive: false }));

  // Filler buildings: one instanced mesh, procedural windows from the facade shader.
  const palette = ['#f2f4f7', '#e6eaf0', '#dde3ea', '#eef0ea', '#e3e7ef', '#d7dee8'];
  const buildings = [], buildingColors = [];
  const heroBlocks = new Set(Object.values(DEPARTMENTS).map(d => d.block.join()));
  for (let i = 0; i < GRID.cells; i++)
    for (let j = 0; j < GRID.cells; j++) {
      if (heroBlocks.has(`${i},${j}`)) continue;
      const cx = blockCenter(i), cz = blockCenter(j);
      const edge = Math.max(Math.abs(i - 2.5), Math.abs(j - 2.5));   // taller towards the centre
      if (rand() < .35) {
        buildings.push(box(cx, .3, cz, BLOCK - 3, 10 + rand() * 18 * (3 - edge * .6), BLOCK - 3));
        buildingColors.push(pick(palette));
        continue;
      }
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (rand() < .12) continue;
        const w = BLOCK / 2 - 1.6 - rand() * 1.5, d = BLOCK / 2 - 1.6 - rand() * 1.5;
        const h = 6 + rand() * 9 + rand() * 14 * (3 - edge * .7);
        buildings.push(box(cx + dx * BLOCK / 4, .3, cz + dz * BLOCK / 4, w, h, d));
        buildingColors.push(pick(palette));
      }
    }
  city.add(instanced(unit, facadeMaterial(), buildings, { colors: buildingColors }));

  const departments = {};
  for (const [key, dept] of Object.entries(DEPARTMENTS)) {
    const g = heroBuilding(key, unit);
    g.position.set(blockCenter(dept.block[0]), .3, blockCenter(dept.block[1]));
    g.userData = { dept: key, name: dept.name };
    city.add(g);
    departments[key] = g;
  }

  const trees = makeTrees(heroBlocks);
  city.add(...trees);
  const lamps = makeLamps(unit);
  city.add(...lamps.meshes);
  const traffic = makeTraffic();
  city.add(traffic.group);

  function update(dt, light) {
    nightUniform.value = THREE.MathUtils.smoothstep(light.night, .45, .9);   // windows light up after sunset
    lamps.bulbMat.emissiveIntensity = 4 * THREE.MathUtils.smoothstep(light.night, .35, .7);
    traffic.update(dt, light.night);
  }

  return { group: city, departments, update, radius: HALF };
}

// Placeholder "hero" buildings for each department, in brand colours.
function heroBuilding(key, unit) {
  const g = new THREE.Group();
  const brand = new THREE.MeshStandardMaterial({ color: '#2f86d6', roughness: .35, metalness: .2 });
  const glow = new THREE.MeshStandardMaterial({ color: '#0b3a8c', emissive: '#3fa9f5', emissiveIntensity: 1.6 });
  const add = (geo, mat, x, y, z, w, h, d) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  switch (key) {
    case 'hq':
      add(unit, facadeMaterial({ color: '#eef3f9' }), 0, 0, 0, 13, 44, 13);
      add(unit, facadeMaterial({ color: '#e2e9f2' }), 0, 0, 0, 17, 9, 17);
      add(unit, glow, 0, 43.2, 0, 13.3, .4, 13.3);   // thin rim just under the roof edge
      add(unit, brand, 0, 44.6, 0, 7, 3, 7);
      break;
    case 'sales':
      add(unit, facadeMaterial({ color: '#f4f1ec' }), 0, 0, 0, 16, 7, 12);
      add(unit, brand, 0, 4.2, 6.6, 16.4, .4, 2.2);
      add(unit, glow, 0, 6.3, 0, 16.2, .35, 12.2);
      break;
    case 'warehouse':
      add(unit, new THREE.MeshStandardMaterial({ color: '#dcd8d0', roughness: .85 }), 0, 0, 0, 17, 9, 15);
      for (let k = -6; k <= 6; k += 3) add(unit, brand, k, 9, 0, 1.2, .5, 15.4);
      add(unit, new THREE.MeshStandardMaterial({ color: '#4a5260' }), 0, 0, 7.6, 6, 5.5, .3);
      break;
    case 'production': {
      add(unit, facadeMaterial({ color: '#e7e3dc' }), 0, 0, 0, 16, 10, 13);
      const stack = new THREE.CylinderGeometry(.8, 1, 1, 16).translate(0, .5, 0);
      const metal = new THREE.MeshStandardMaterial({ color: '#9aa4ae', roughness: .4, metalness: .6 });
      add(stack, metal, 5, 0, -3, 1, 18, 1);
      add(stack, metal, 2, 0, -3, 1, 15, 1);
      add(unit, glow, 0, 9.3, 0, 16.2, .35, 13.2);
      break;
    }
    case 'finance':
      add(unit, facadeMaterial({ color: '#edf0f4' }), 0, 0, 0, 12, 26, 12);
      add(unit, brand, 0, 26, 0, 12.6, 1.2, 12.6);
      break;
  }
  return g;
}

function makeTrees(heroBlocks) {
  const trunks = [], crowns = [], colors = [];
  const greens = ['#7fa66a', '#6e9a5f', '#8db377', '#769f68'];
  for (let i = 0; i < GRID.cells; i++)
    for (let j = 0; j < GRID.cells; j++) {
      const cx = blockCenter(i), cz = blockCenter(j), e = BLOCK / 2 + .2;
      const spots = heroBlocks.has(`${i},${j}`) ? 6 : 3;
      for (let k = 0; k < spots; k++) {
        const side = Math.floor(rand() * 4), t = (rand() - .5) * BLOCK * .9;
        const x = cx + (side === 0 ? -e : side === 1 ? e : t);
        const z = cz + (side === 2 ? -e : side === 3 ? e : t);
        const sc = .8 + rand() * .5;
        trunks.push(box(x, .3, z, .35 * sc, 2.2 * sc, .35 * sc));
        crowns.push(box(x, .3 + 3.2 * sc, z, 2.2 * sc, 2.4 * sc, 2.2 * sc, rand() * 6));
        colors.push(pick(greens));
      }
    }
  const trunkGeo = new THREE.CylinderGeometry(.5, .6, 1, 6).translate(0, .5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  return [
    instanced(trunkGeo, new THREE.MeshStandardMaterial({ color: '#7b6a58', roughness: 1 }), trunks),
    instanced(crownGeo, new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true }), crowns, { colors }),
  ];
}

function makeLamps(unit) {
  const poles = [], bulbs = [];
  for (let i = 0; i <= GRID.cells; i++)
    for (let j = 0; j <= GRID.cells; j++) {
      const x = roadLine(i) + GRID.road / 2 + .6, z = roadLine(j) + GRID.road / 2 + .6;
      if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) continue;
      poles.push(box(x, .3, z, .18, 5, .18));
      bulbs.push(box(x, 5.1, z, .7, .25, .7));
    }
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#ffd59a', emissiveIntensity: 0 });
  return {
    bulbMat,
    meshes: [
      instanced(unit, new THREE.MeshStandardMaterial({ color: '#5a636e', roughness: .5, metalness: .4 }), poles),
      instanced(unit, bulbMat, bulbs, { cast: false }),
    ],
  };
}

// Cars drive straight along the road grid and wrap at the base edge.
function makeTraffic(count = 40) {
  const body = new THREE.BoxGeometry(1.9, .8, 4.2).translate(0, .75, 0);
  const cabin = new THREE.BoxGeometry(1.7, .6, 2.2).translate(0, 1.45, -.2);
  const geo = mergeGeometries([body, cabin]);
  const mat = new THREE.MeshStandardMaterial({ roughness: .35, metalness: .3 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.receiveShadow = true;    // no shadow casting: the static shadow map is not redrawn for cars
  const lightsMat = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff1cf', emissiveIntensity: 0 });
  const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, .2, .1).translate(0, .85, 2.12), lightsMat, count);
  mesh.frustumCulled = lights.frustumCulled = false;

  const colors = ['#ffffff', '#d9dee5', '#2f86d6', '#1e2a3a', '#9aa4ae', '#c8442f', '#0b3a8c'];
  const cars = [];
  for (let k = 0; k < count; k++) {
    const dir = rand() < .5 ? 1 : -1, axis = k % 2;
    cars.push({
      axis, line: roadLine(Math.floor(rand() * (GRID.cells + 1))),
      dir, lane: (axis === 0 ? -dir : dir) * 2,   // right-hand traffic
      p: (rand() * 2 - 1) * HALF, speed: 7 + rand() * 6,
    });
    mesh.setColorAt(k, c.set(pick(colors)));
  }
  const group = new THREE.Group();
  group.add(mesh, lights);

  function update(dt, night) {
    lightsMat.emissiveIntensity = 3 * THREE.MathUtils.smoothstep(night, .3, .7);
    cars.forEach((car, k) => {
      car.p += car.speed * car.dir * dt;
      if (car.p > HALF - 3) car.p = -HALF + 3;
      if (car.p < -HALF + 3) car.p = HALF - 3;
      const along = car.p, across = car.line + car.lane;
      const yaw = car.axis === 0 ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      v.set(car.axis === 0 ? across : along, .02, car.axis === 0 ? along : across);
      m4.compose(v, q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw), s.set(1, 1, 1));
      mesh.setMatrixAt(k, m4);
      lights.setMatrixAt(k, m4);
    });
    mesh.instanceMatrix.needsUpdate = lights.instanceMatrix.needsUpdate = true;
  }
  return { group, update };
}
