import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// The cloud as a union of spheres (x, y, z, radius), flattened underneath: a real 3D volume,
// built from small blocks on its surface so it reads as a puffy cloud, not a wall.
const PUFFS = [
  [-2.35, -.35, .1, 1.15], [-1.0, .55, -.1, 1.45], [.75, .7, .15, 1.55], [2.3, -.15, -.05, 1.15],
  [-.2, -.35, .45, 1.2], [1.4, -.45, .5, 1.0], [-1.4, -.5, .55, .95], [.2, .1, -.7, 1.3],
];
const BASE_Y = -1.25, STEP = .4;
export const MODULES = ['Склад', 'Касса', 'Финансы', 'Продажи', 'Производство', 'Зарплата'];

let seed = 11;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const solid = (x, y, z) => y >= BASE_Y && PUFFS.some(([cx, cy, cz, r]) => (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 < r * r);

function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#0d2747';   // brand ink reads on the frosted white tiles
  x.font = '650 104px Onest, Geist, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const words = text.length > 9 ? [text.slice(0, 7) + '-', text.slice(7)] : [text];   // «Производ- / ство»
  words.forEach((w, i) => x.fillText(w, 512, 256 + (i - (words.length - 1) / 2) * 104));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const tileGeometry = new RoundedBoxGeometry(1.05, 1.05, .32, 4, .12);
let tileGlass = null;

/** A module tile: a slab of bright frosted glass with the module's name on its face. */
export function createModuleTile(name, glass) {
  tileGlass ??= glass;
  const tile = new THREE.Mesh(tileGeometry, tileGlass);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(.92, .46), new THREE.MeshBasicMaterial({
    map: labelTexture(name), transparent: true, depthWrite: false, toneMapped: false,
  }));
  label.position.z = .17;
  tile.add(label);
  return tile;
}

/**
 * The Cloudplus cloud: frosted-glass blocks around a light inside, with six larger module
 * tiles set into its front. update(explode, time): 0 = assembled, 1 = scattered.
 */
export function createBlockCloud() {
  const group = new THREE.Group();
  const blocks = [];
  for (let x = -3.8; x <= 3.8; x += STEP)
    for (let y = BASE_Y; y <= 2.4; y += STEP)
      for (let z = -2.2; z <= 2.2; z += STEP) {
        if (!solid(x, y, z)) continue;
        // Keep surface voxels only: at least one empty neighbour.
        const n = [[STEP, 0, 0], [-STEP, 0, 0], [0, STEP, 0], [0, -STEP, 0], [0, 0, STEP], [0, 0, -STEP]];
        if (n.every(([dx, dy, dz]) => solid(x + dx, y + dy, z + dz))) continue;
        if (rand() < .06) continue;   // a few gaps make it feel built, not cast
        blocks.push({
          base: new THREE.Vector3(x + (rand() - .5) * .05, y + (rand() - .5) * .05, z + (rand() - .5) * .05),
          rot: new THREE.Euler((rand() - .5) * .14, (rand() - .5) * .14, (rand() - .5) * .14),
          scale: STEP * (.78 + rand() * .14),
          spin: new THREE.Vector3(rand() - .5, rand() - .5, rand() - .5).multiplyScalar(5),
          drift: rand(),
        });
      }

  const glass = new THREE.MeshPhysicalMaterial({
    // Frosted ice: milky, lit from within, with crisp clear-coat highlights on the edges.
    color: '#eef6ff', roughness: .5, metalness: 0,
    transmission: .82, thickness: .45, ior: 1.31,
    attenuationColor: '#9fd0ff', attenuationDistance: 1.6,
    clearcoat: 1, clearcoatRoughness: .12,
    emissive: '#5aa8ef', emissiveIntensity: .16,
    specularIntensity: 1, envMapIntensity: 1.4,
  });
  const mesh = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 3, .16), glass, blocks.length);
  group.add(mesh);

  // Module tiles: larger, brighter glass, each with its name, set into the front of the cloud.
  const tileGlass = glass.clone();
  tileGlass.color.set('#f2f8ff');
  tileGlass.emissive = new THREE.Color('#2f7fd0');
  tileGlass.emissiveIntensity = .22;
  const SPOTS = [[-2.45, -.55], [-1.05, .95], [.65, 1.25], [2.2, .25], [-.25, -.45], [1.45, -.6]];
  const tiles = SPOTS.map(([x, y], i) => {
    // Find the cloud's front surface at (x, y) and sit the tile on it.
    let z = 2.2;
    while (z > -2 && !solid(x, y, z)) z -= .05;
    const tile = createModuleTile(MODULES[i], tileGlass);
    tile.userData = {
      base: new THREE.Vector3(x, y, z + .05),
      rot: new THREE.Euler((rand() - .5) * .1, (rand() - .5) * .25, (rand() - .5) * .08),
      dir: new THREE.Vector3(x * .35, y * .5 + .2, 1).normalize(),
    };
    group.add(tile);
    return tile;
  });

  // The light inside: a bright core and a brand-blue halo; bloom turns them into a glow.
  const core = new THREE.PointLight('#e6f3ff', 40, 6.5, 1.5);
  core.position.set(-.1, .25, .1);
  const halo = new THREE.PointLight('#3fa9f5', 22, 8, 1.6);
  halo.position.set(1.3, .05, -.3);
  group.add(core, halo);
  // A soft round glow behind the cloud (a sprite, so it has no edges).
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(150,200,255,0.55)');
    g.addColorStop(.4, 'rgba(70,140,230,0.18)');
    g.addColorStop(1, 'rgba(40,90,180,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.scale.set(10, 7, 1);
  glow.position.set(0, .2, -2.4);
  glow.visible = false;   // the inner lights and bloom carry the glow; a sprite showed its edges

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  const centre = new THREE.Vector3(0, .2, 0), dir = new THREE.Vector3();

  function update(explode, time) {
    const k = explode * explode * (3 - 2 * explode);
    blocks.forEach((b, i) => {
      dir.copy(b.base).sub(centre).normalize();
      const breathe = Math.sin(time * .9 + b.drift * 6.28) * .012 * (1 - k);
      p.copy(b.base).addScaledVector(dir, k * (2.5 + b.drift * 6) + breathe);
      p.y -= k * k * (1 + b.drift * 4);
      e.set(b.rot.x + b.spin.x * k, b.rot.y + b.spin.y * k, b.rot.z + b.spin.z * k);
      mesh.setMatrixAt(i, m4.compose(p, q.setFromEuler(e), s.setScalar(b.scale * (1 - k * .3))));
    });
    mesh.instanceMatrix.needsUpdate = true;
    tiles.forEach((t, i) => {
      const u = t.userData;
      // Tiles lift out first and float forward, towards the viewer.
      t.position.copy(u.base).addScaledVector(u.dir, k * (2.2 + i * .35));
      t.position.y += Math.sin(time * .7 + i) * .03;
      t.rotation.set(u.rot.x + k * (i - 2.5) * .25, u.rot.y + k * (i % 2 ? .6 : -.6), u.rot.z);
    });
    core.intensity = 40 * (1 - k * .5);
    glow.material.opacity = 1 - k * .7;
  }

  update(0, 0);
  return { group, update, count: blocks.length };
}
