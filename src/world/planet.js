import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The world below the clouds: a small planet with four businesses on it.
// Built in Kenney units (a small building is ~1 unit wide), then scaled up as a whole.
export const R = 9;
export const SCALE = 1.7;
// Layout offsets below were tuned in degrees on a radius-6 planet; K converts them to this radius.
const K = 6 / R;
export const CENTER = new THREE.Vector3(0, -62, 0);
const MODELS = '../world/models/';
const deg = THREE.MathUtils.degToRad;

/** Business spots: latitude and longitude in degrees; north of the road faces south. */
export const BUSINESSES = {
  production: { lat: 16 * K, lon: 0 },
  warehouse: { lat: -16 * K, lon: 85 },
  cafe: { lat: 16 * K, lon: 175 },
  store: { lat: -16 * K, lon: 265 },
};

let seed = 21;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/** Position on the sphere (local planet space) at latitude/longitude (degrees) and height. */
export function surface(lat, lon, alt = 0, out = new THREE.Vector3()) {
  const a = deg(lat), b = deg(lon), r = R + alt;
  return out.set(r * Math.cos(a) * Math.sin(b), r * Math.sin(a), r * Math.cos(a) * Math.cos(b));
}

/** Matrix standing an object on the sphere: local +Y up, +X east, +Z south, turned by yaw (degrees). */
function standing(lat, lon, yaw = 0, scale = 1, alt = 0) {
  const p = surface(lat, lon, alt);
  const up = p.clone().normalize();
  const east = new THREE.Vector3(Math.cos(deg(lon)), 0, -Math.sin(deg(lon)));
  const south = new THREE.Vector3().crossVectors(east, up);
  const m = new THREE.Matrix4().makeBasis(east, up, south);
  m.multiply(new THREE.Matrix4().makeRotationY(deg(yaw)));
  m.scale(new THREE.Vector3(scale, scale, scale));
  return m.setPosition(p);
}

export async function createPlanet() {
  const loader = new GLTFLoader();
  const cache = new Map();
  const load = name => {
    if (!cache.has(name)) cache.set(name, loader.loadAsync(MODELS + name + '.glb').then(g => {
      g.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      return g.scene;
    }));
    return cache.get(name);
  };

  const planet = new THREE.Group();
  planet.position.copy(CENTER);
  planet.scale.setScalar(SCALE);

  // Ground: soft sage with gentle patches, so it reads as land, not plastic.
  const groundGeo = new THREE.SphereGeometry(R, 160, 120);
  const colors = [], p = groundGeo.attributes.position, c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 1.7 + z * .9) * Math.cos(y * 1.3 - x * .6) * .5 + Math.sin(z * 3.1 + y * 2.2) * .25;
    c.setHSL(.28 + n * .025, .44, .47 + n * .05);
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }));
  ground.receiveShadow = true;
  planet.add(ground);

  // The ring road along the equator, with a dashed centre line and kerbs.
  const half = .55 / R;
  const road = new THREE.Mesh(new THREE.SphereGeometry(R + .01, 240, 1, 0, Math.PI * 2, Math.PI / 2 - half, half * 2),
    new THREE.MeshStandardMaterial({ color: '#5a6170', roughness: .9 }));
  road.receiveShadow = true;
  planet.add(road);
  const kerb = new THREE.MeshStandardMaterial({ color: '#d9dde2', roughness: .8 });
  for (const s of [-1, 1]) {
    const k = new THREE.Mesh(new THREE.SphereGeometry(R + .03, 240, 1, 0, Math.PI * 2, Math.PI / 2 + s * half - .004, .008), kerb);
    planet.add(k);
  }
  const dashGeo = new THREE.BoxGeometry(.03, .01, .22);
  const dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshStandardMaterial({ color: '#f4efe2', roughness: .6 }), 120);
  for (let i = 0; i < 120; i++) dashes.setMatrixAt(i, standing(0, i * 3, 0, 1, .012));
  planet.add(dashes);

  async function put(name, lat, lon, yaw = 0, scale = 1, alt = 0) {
    const model = (await load(name)).clone();
    model.matrixAutoUpdate = false;
    model.matrix.copy(standing(lat, lon, yaw, scale, alt));
    planet.add(model);
    return model;
  }

  // ---- The four businesses ----
  const B = BUSINESSES, face = b => (b.lat > 0 ? 0 : 180);
  const spots = [];
  const near = (b, dlat, dlon) => [b.lat + dlat * K * Math.sign(b.lat), b.lon + dlon * K];
  const jobs = [];
  {
    const b = B.production, f = face(b);
    jobs.push(put('industrial/building-m', b.lat, b.lon, f, 1.1));
    jobs.push(put('industrial/chimney-large', ...near(b, 4, -12), 0, 1.1));
    jobs.push(put('industrial/detail-tank-large', ...near(b, 1, 11), 0, 1));
    jobs.push(put('industrial/detail-tank', ...near(b, -3, 13), f + 90, .9));
    jobs.push(put('industrial/water-tower', ...near(b, 8, 9), 0, .9));
  }
  {
    const b = B.warehouse, f = face(b);
    jobs.push(put('industrial/building-s', b.lat, b.lon, f, 1.3));
    jobs.push(put('industrial/shipping-container-a', ...near(b, 1.5, -18), f + 90, .7));
    jobs.push(put('industrial/shipping-container-b', ...near(b, 3.8, -18), f + 90, .7));
    jobs.push(put('industrial/shipping-container-c', ...near(b, 1.5, -18), f + 90, .7, .25));
    jobs.push(put('cars/delivery', ...near(b, -8.2, -6), f + 90, .18));
    jobs.push(put('cars/delivery', ...near(b, -8.2, 1), f + 90, .18));
    jobs.push(put('cars/truck-flat', ...near(b, -8.2, 9), f + 90, .18));
    for (let i = 0; i < 6; i++) jobs.push(put('cars/box', ...near(b, -6.4 + (i % 2) * .6, 12 + Math.floor(i / 2) * .7), rand() * 30, .09, i > 3 ? .09 : 0));
  }
  {
    const b = B.cafe, f = face(b);
    jobs.push(put('commercial/building-c', b.lat, b.lon, f, 1.25));
    jobs.push(put('commercial/detail-awning', ...near(b, -6.4, 0), f, .9));
    for (const d of [-7, -2.5, 2.5, 7]) jobs.push(put('commercial/detail-parasol-' + (d > 0 ? 'a' : 'b'), ...near(b, -9, d), 0, .55));
    for (const [d, w] of [[-8.5, -8], [-4.5, -9.4], [4.5, -8.4], [8.6, -9.4]]) jobs.push(put('people/character-' + (d > 0 ? 'female-a' : 'male-b'), ...near(b, w, d), rand() * 360, .22));
    jobs.push(put('suburban/planter', ...near(b, -7, -10), 0, .9));
    jobs.push(put('suburban/planter', ...near(b, -7, 10), 0, .9));
  }
  {
    const b = B.store, f = face(b);
    jobs.push(put('commercial/building-k', b.lat, b.lon, f, 1.2));
    jobs.push(put('commercial/detail-awning-wide', ...near(b, -5.3, 0), f, 1.05));
    for (const [d, m] of [[-10, 'sedan'], [-6, 'suv'], [6, 'hatchback-sports'], [10, 'taxi']]) jobs.push(put('cars/' + m, ...near(b, -8, d), f + 180, .17));
    for (const [d, w, who] of [[-1, -7.4, 'female-b'], [2.5, -8, 'male-a'], [-3.5, -7, 'female-c']]) jobs.push(put('people/character-' + who, ...near(b, w, d), rand() * 360, .22));
  }
  for (const [key, b] of Object.entries(B)) spots.push({ key, ...b });

  // ---- The rest of the world: houses, offices, trees, keeping clear of the road and the businesses ----
  const clear = (lat, lon) => Math.abs(lat) > 10 * K && spots.every(s => {
    const dl = Math.abs(((lon - s.lon + 540) % 360) - 180);
    return dl > (s.key ? 26 : 13) * K || Math.abs(lat - s.lat) > (s.key ? 22 : 12) * K;
  });
  const fillers = ['commercial/building-a', 'commercial/building-b', 'commercial/building-e', 'commercial/building-f', 'commercial/building-g',
    'commercial/building-i', 'suburban/building-type-a', 'suburban/building-type-b', 'suburban/building-type-c', 'suburban/building-type-d', 'suburban/building-type-e'];
  let placed = 0;
  for (let tries = 0; tries < 1600 && placed < 95; tries++) {
    const lat = (rand() * 2 - 1) * 70, lon = rand() * 360;
    if (!clear(lat, lon)) continue;
    const tall = rand() < .12 && Math.abs(lat) > 45;   // towers stay far from the business close-ups
    const name = tall ? 'commercial/building-skyscraper-' + ['a', 'b', 'c', 'e'][Math.floor(rand() * 4)] : fillers[Math.floor(rand() * fillers.length)];
    jobs.push(put(name, lat, lon, Math.round(rand() * 4) * 90, tall ? .85 : .9));
    placed++;
    spots.push({ lat, lon });   // keeps later fillers from overlapping
  }
  const angle = (lat, lon, s) => Math.hypot(lat - s.lat, Math.abs(((lon - s.lon + 540) % 360) - 180) * Math.cos(deg(lat)));
  for (let i = 0; i < 700; i++) {
    const lat = (rand() * 2 - 1) * 82, lon = rand() * 360;
    // Trees keep off the road, out of the business yards and away from buildings.
    if (Math.abs(lat) < 7 * K || spots.some(s => angle(lat, lon, s) < (s.key ? 24 : 7) * K)) continue;
    jobs.push(put('suburban/tree-' + (rand() < .6 ? 'large' : 'small'), lat, lon, rand() * 360, 1.1 + rand() * .7));
  }
  await Promise.all(jobs);

  // ---- Traffic on the ring road ----
  const carNames = ['sedan', 'suv', 'taxi', 'hatchback-sports', 'van', 'delivery', 'truck', 'sedan'];
  const cars = await Promise.all(carNames.map(async (n, i) => {
    const car = (await load('cars/' + n)).clone();
    car.matrixAutoUpdate = false;
    planet.add(car);
    return { car, lon: i * 45 + rand() * 20, dir: i % 2 ? 1 : -1, speed: (5 + rand() * 3) * K };
  }));

  // World-space anchor of each business (for the camera).
  const anchors = {};
  for (const [key, b] of Object.entries(B)) {
    anchors[key] = surface(b.lat, b.lon, .9).multiplyScalar(SCALE).add(CENTER);
  }

  function update(time) {
    for (const c of cars) {
      const lon = c.lon + c.dir * c.speed * time;
      // Right-hand traffic: eastbound in the southern lane.
      c.car.matrix.copy(standing((c.dir > 0 ? -1.4 : 1.4) * K, lon, c.dir > 0 ? 90 : -90, .17, .015));
    }
  }

  return { group: planet, anchors, update };
}
