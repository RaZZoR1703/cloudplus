import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// The cloud as a union of spheres (x, y, z, radius), flattened underneath: a real 3D volume,
// built from small blocks on its surface so it reads as a puffy cloud, not a wall.
const PUFFS = [
  [-2.35, -.35, .1, 1.15], [-1.0, .55, -.1, 1.45], [.75, .7, .15, 1.55], [2.3, -.15, -.05, 1.15],
  [-.2, -.35, .45, 1.2], [1.4, -.45, .5, 1.0], [-1.4, -.5, .55, .95], [.2, .1, -.7, 1.3],
];
const BASE_Y = -1.25, STEP = .4;

let seed = 11;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
export const solid = (x, y, z) => y >= BASE_Y && PUFFS.some(([cx, cy, cz, r]) => (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 < r * r);

export const tileGeometry = new RoundedBoxGeometry(1.05, 1.05, .32, 4, .12);

// ---------- Live screens: small fragments of the Cloudplus interface set into the cloud ----------
// Each draws one moment of a business process at time t and returns a key; a new key means
// the value just changed, and that change sends a ripple of light through the blocks.
const BIG = '600 88px Onest, Geist, sans-serif';
export const UI = '500 40px Onest, Geist, sans-serif';
export const BLUE = '#3fa9f5', SOFT = 'rgba(214,232,255,.62)';
const num = n => Math.round(n).toLocaleString('ru-RU');

export function screenBase(x, title) {
  x.clearRect(0, 0, 512, 512);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#15305a'); g.addColorStop(1, '#0a1730');
  x.fillStyle = g;
  x.beginPath(); x.roundRect(10, 10, 492, 492, 60); x.fill();
  x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  x.fillStyle = SOFT; x.font = UI;
  x.fillText(title, 52, 98);
}
function big(x, text, y = 236) { x.fillStyle = '#fff'; x.font = BIG; x.fillText(text, 52, y); }
function foot(x, text) { x.fillStyle = SOFT; x.font = UI; x.fillText(text, 52, 452); }

const SCREENS = [
  (x, t) => {   // warehouse: stock of one SKU goes down as orders are picked
    const step = Math.floor(t / 2.4) % 7;
    screenBase(x, 'Склад · остаток');
    big(x, `${num(1284 - step * 24)} шт`);
    [.55, .7, .48, .82, .64, .9, .74].forEach((h, i) => {
      x.fillStyle = i === 6 ? BLUE : 'rgba(150,190,240,.32)';
      const hh = (i === 6 ? h - step * .05 : h) * 110;
      x.beginPath(); x.roundRect(52 + i * 58, 400 - hh, 40, hh, 8); x.fill();
    });
    return step;
  },
  (x, t) => {   // till: receipts of the day tick up
    const step = Math.floor(t / 1.9);
    screenBase(x, 'Касса · чеков');
    big(x, num(312 + step % 40));
    foot(x, 'средний чек 86 000');
    return step;
  },
  (x, t) => {   // 1C exchange: syncs, then holds a green tick
    const k = (t % 6) / 6, busy = k < .3;
    screenBase(x, 'Обмен с 1С');
    x.strokeStyle = BLUE; x.lineWidth = 16; x.lineCap = 'round';
    x.beginPath();
    if (busy) x.arc(256, 280, 82, t * 6, t * 6 + 4.2);
    else { x.arc(256, 280, 82, 0, 7); x.moveTo(218, 282); x.lineTo(246, 310); x.lineTo(298, 254); }
    x.stroke();
    x.fillStyle = SOFT; x.font = UI; x.textAlign = 'center';
    x.fillText(busy ? 'синхронизация…' : 'данные совпадают', 256, 452);
    return busy ? 0 : 1;
  },
  (x, t) => {   // sales: the day's curve draws itself
    const k = Math.min(1, (t % 7) / 5);
    screenBase(x, 'Продажи сегодня');
    big(x, `${(31.2 + k * 17.4).toFixed(1).replace('.', ',')} млн`);
    const pts = [0, .18, .12, .34, .3, .52, .47, .7, .66, .88];
    const n = Math.max(2, Math.ceil(k * pts.length));
    x.strokeStyle = BLUE; x.lineWidth = 9; x.lineJoin = 'round';
    x.beginPath();
    pts.slice(0, n).forEach((v, i) => x.lineTo(52 + i * 45.3, 430 - v * 140));
    x.stroke();
    return Math.floor(t / 7);
  },
  (x, t) => {   // production: a batch fills up, then the next one starts
    const k = (t % 9) / 9, batch = 37 + Math.floor(t / 9);
    screenBase(x, `Партия №${batch}`);
    x.lineWidth = 22; x.lineCap = 'round';
    x.strokeStyle = 'rgba(150,190,240,.2)';
    x.beginPath(); x.arc(256, 300, 110, 0, 7); x.stroke();
    x.strokeStyle = BLUE;
    x.beginPath(); x.arc(256, 300, 110, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); x.stroke();
    x.fillStyle = '#fff'; x.font = '600 64px Onest, Geist, sans-serif'; x.textAlign = 'center';
    x.fillText(`${Math.round(k * 100)}%`, 256, 322);
    return batch;
  },
  (x, t) => {   // orders: one order walks through its statuses
    const steps = ['Принят', 'Собран', 'Отгружен'], i = Math.floor(t / 2.6) % 3;
    screenBase(x, 'Заказ №5214');
    big(x, steps[i], 230);
    steps.forEach((_, j) => {
      x.fillStyle = j <= i ? BLUE : 'rgba(150,190,240,.25)';
      x.beginPath(); x.roundRect(52 + j * 140, 330, 128, 14, 7); x.fill();
    });
    foot(x, i === 2 ? 'клиент получил SMS' : 'склад №1');
    return i;
  },
];

export function createScreen(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, toneMapped: false, fog: false, opacity: 0,
  }));
  mesh.position.z = .17;
  let key = null;
  return {
    mesh,
    /** Redraws the screen; returns true when its value just changed. */
    draw(t) {
      const k = draw(ctx, t);
      map.needsUpdate = true;
      const changed = key !== null && k !== key;
      key = k;
      return changed;
    },
  };
}

/** The frosted glass of every block; aGlow (per instance, optional) adds brand-blue light. */
export function makeGlass() {
  const glass = new THREE.MeshPhysicalMaterial({
    // Frosted ice: milky, lit from within, with crisp clear-coat highlights on the edges.
    color: '#eef6ff', roughness: .46, metalness: 0,
    transmission: .84, thickness: .45, ior: 1.31,   // no dispersion: it triples the transmission samples, unseen through frost
    attenuationColor: '#9fd0ff', attenuationDistance: 1.6,
    clearcoat: 1, clearcoatRoughness: .1,
    emissive: '#5aa8ef', emissiveIntensity: .08,
    specularIntensity: 1, envMapIntensity: 1.5,
  });
  // Per-block light: ripples of data pass through the cloud as brand-blue glow.
  glass.onBeforeCompile = s => {
    s.vertexShader = 'attribute float aGlow;\nvarying float vGlow;\n' +
      s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    s.fragmentShader = 'varying float vGlow;\n' +
      s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(.25, .62, 1.) * vGlow;');
  };
  return glass;
}

const clamp01 = v => Math.min(1, Math.max(0, v));
const easeOut = v => 1 - (1 - v) ** 4;
const easeBack = v => 1 + 2.2 * (v - 1) ** 3 + 1.2 * (v - 1) ** 2;

/**
 * The Cloudplus cloud: frosted-glass blocks around a light inside, with six live interface
 * screens set into its front. update(explode, time, hover): 0 = assembled, 1 = scattered;
 * hover = { x, y, on } is the pointer in screen units (-.5….5) and how present it is (0…1).
 */
export function createBlockCloud({ animateIn = true } = {}) {
  const group = new THREE.Group();
  const centre = new THREE.Vector3(0, .2, 0);
  const blocks = [];
  for (let x = -3.8; x <= 3.8; x += STEP)
    for (let y = BASE_Y; y <= 2.4; y += STEP)
      for (let z = -2.2; z <= 2.2; z += STEP) {
        if (!solid(x, y, z)) continue;
        // Keep surface voxels only: at least one empty neighbour.
        const n = [[STEP, 0, 0], [-STEP, 0, 0], [0, STEP, 0], [0, -STEP, 0], [0, 0, STEP], [0, 0, -STEP]];
        if (n.every(([dx, dy, dz]) => solid(x + dx, y + dy, z + dz))) continue;
        if (rand() < .06) continue;   // a few gaps make it feel built, not cast
        const base = new THREE.Vector3(x + (rand() - .5) * .05, y + (rand() - .5) * .05, z + (rand() - .5) * .05);
        blocks.push({
          base,
          dir: base.clone().sub(centre).normalize(),
          dist: base.distanceTo(centre),
          rot: new THREE.Euler((rand() - .5) * .14, (rand() - .5) * .14, (rand() - .5) * .14),
          scale: STEP * (.78 + rand() * .14),
          spin: new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5).multiplyScalar(3),
          drift: rand(),
          tint: rand() * .05,
        });
      }
  // Front blocks first: the camera stays in front, so the depth test skips the costly glass hidden behind them.
  blocks.sort((a, b) => b.base.z - a.base.z);
  const far = Math.max(...blocks.map(b => b.dist));
  for (const b of blocks) {
    b.out = b.dist / far;
    b.delay = b.out * .9 + b.drift * .35;   // the cloud builds from its glowing core outwards
  }

  const glass = makeGlass();
  const geometry = new RoundedBoxGeometry(1, 1, 1, 3, .14);
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(blocks.length), 1);
  geometry.setAttribute('aGlow', glow);
  const mesh = new THREE.InstancedMesh(geometry, glass, blocks.length);
  group.add(mesh);

  // Screens: larger, brighter glass slabs, each holding one live fragment of the program.
  const tileGlass = glass.clone();
  tileGlass.onBeforeCompile = () => {};
  tileGlass.color.set('#f2f8ff');
  tileGlass.emissive = new THREE.Color('#2f7fd0');
  tileGlass.emissiveIntensity = .18;
  const SPOTS = [[-2.45, -.55], [-1.05, .95], [.65, 1.25], [2.2, .25], [-.25, -.45], [1.45, -.6]];
  const tiles = SPOTS.map(([x, y], i) => {
    // Find the cloud's front surface at (x, y) and sit the tile on it.
    let z = 2.2;
    while (z > -2 && !solid(x, y, z)) z -= .05;
    const tile = new THREE.Mesh(tileGeometry, tileGlass);
    const screen = createScreen(SCREENS[i]);
    tile.add(screen.mesh);
    tile.userData = {
      screen,
      base: new THREE.Vector3(x, y, z + .5),   // well clear of the blocks, so tilting never cuts into them
      rot: new THREE.Euler((rand() - .5) * .1, (rand() - .5) * .25, (rand() - .5) * .08),
      dir: new THREE.Vector3(x * .35, y * .5 + .2, 1).normalize(),
      delay: 1.5 + i * .14,
    };
    group.add(tile);
    return tile;
  });

  // The light inside: a soft core and a brand-blue halo; bloom turns them into a glow.
  const core = new THREE.PointLight('#cfe6ff', 4, 6.5, 1.5);
  core.position.set(-.1, .25, .1);
  const halo = new THREE.PointLight('#3fa9f5', 14, 8, 1.6);
  halo.position.set(1.3, .05, -.3);
  group.add(core, halo);

  const ripples = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  const hot = new THREE.Vector3();
  let lastDraw = -1;

  function update(explode, time, hover = { x: 0, y: 0, on: 0 }) {
    const intro = t => animateIn ? clamp01(t) : 1;
    // Screens redraw at ~12 fps while the cloud is in view; a changed value starts a ripple.
    if (explode < 1 && time - lastDraw > .08) {
      lastDraw = time;
      tiles.forEach(t => { if (t.userData.screen.draw(time)) ripples.push({ from: t.userData.base, at: time }); });
      while (ripples.length && time - ripples[0].at > 3) ripples.shift();
    }
    hot.set(hover.x * 9, -hover.y * 6 + .2, 2.4);

    blocks.forEach((b, i) => {
      // Build-up on load: each block flies in from outside and settles, core first.
      const a = easeOut(intro((time - .15 - b.delay) / 1.4));
      // On scroll the outer shell peels off first, then the inner layers follow.
      const k = smooth01((explode - (1 - b.out) * .3) / .7);
      const breathe = Math.sin(time * .9 + b.drift * 6.28) * .012 * (1 - k);
      // The pointer presses a soft dent of light into the cloud.
      const near = Math.exp(-b.base.distanceToSquared(hot) / 1.6) * hover.on * (1 - k);
      let g = b.tint + near * .5;
      for (const r of ripples) {
        const front = (time - r.at) * 3.2, d = b.base.distanceTo(r.from);
        g += Math.exp(-((d - front) ** 2) / .18) * (1 - (time - r.at) / 3) * .9;
      }
      glow.setX(i, g * (1 - k));
      p.copy(b.base)
        .addScaledVector(b.dir, (1 - a) * (5 + b.drift * 4) + k * (1.2 + b.drift * 2.5) + breathe + near * .18);
      p.y -= k * k * (.3 + b.drift);   // blocks melt into dust close to the cloud, where its particles appear
      const turn = (1 - a) * 1.6 + k * .6;
      e.set(b.rot.x + b.spin.x * turn, b.rot.y + b.spin.y * turn, b.rot.z + b.spin.z * turn);
      mesh.setMatrixAt(i, m4.compose(p, q.setFromEuler(e), s.setScalar(b.scale * a * (1 - k) ** 1.5)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    glow.needsUpdate = true;

    tiles.forEach((t, i) => {
      const u = t.userData;
      // Screens slide out of the cloud once it has formed, then switch on.
      const a = intro((time - u.delay) / 1.1), on = intro((time - u.delay - .5) / .6);
      const k = smooth01((explode - i * .04) / .76);
      t.position.copy(u.base).addScaledVector(u.dir, k * (2.2 + i * .35) - (1 - easeBack(a)) * .9);
      t.position.y += Math.sin(time * .7 + i) * .03;
      t.rotation.set(u.rot.x + k * (i - 2.5) * .25 + hover.y * .12 * hover.on, u.rot.y + k * (i % 2 ? .6 : -.6) + hover.x * .2 * hover.on, u.rot.z);
      t.scale.setScalar(Math.max(.001, a * (1 - k)));
      u.screen.mesh.material.opacity = on * (1 - k);
    });
    core.intensity = 4 * (1 - explode * .5) * intro((time - .1) / 1.2);
  }

  update(0, 0);
  return { group, update, count: blocks.length };
}

function smooth01(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
