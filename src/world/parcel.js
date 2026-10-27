import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TRAIL = 64, PER = 18;   // positions remembered, particles per position

function dot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * The order itself: a glowing cube with a comet tail. Each business hands it on: the business is
 * drawn into the cube, the cube flies to the next one and bursts into it. update(at, vis, time)
 * places it; vis 0 hides it.
 */
export function createParcel() {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new RoundedBoxGeometry(.7, .7, .7, 3, .12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(.9, 2, 4.2), transparent: true }));   // above 1, so bloom makes it glow
  group.add(box);

  const history = Array.from({ length: TRAIL }, () => new THREE.Vector3());
  const n = TRAIL * PER, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), jitter = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const age = Math.floor(i / PER) / TRAIL, fade = (1 - age) ** 1.6;
    col.set([.25 * fade, .8 * fade, 1.9 * fade], i * 3);   // brand blue, apart from the white dust; additive: darker is fainter
    for (let a = 0; a < 3; a++) jitter[i * 3 + a] = (Math.random() - .5) * (.08 + age * .9);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const tail = new THREE.Points(geo, new THREE.PointsMaterial({
    size: .3, map: dot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  tail.frustumCulled = false;
  group.add(tail);
  let fresh = true;

  function update(at, vis, time) {
    group.visible = vis > .001;
    if (!group.visible) { fresh = true; return; }
    box.position.copy(at);
    box.rotation.set(time * .5, time * .35, 0);
    box.scale.setScalar(.3 + .7 * vis);
    if (fresh) { history.forEach(h => h.copy(at)); fresh = false; }
    history.unshift(history.pop().copy(at));   // reuse the oldest vector as the newest
    // A tail only while moving: at rest its points would pile onto the cube, often right by the lens.
    const moving = Math.min(1, history[0].distanceTo(history[12]) * 2);
    box.material.opacity = vis;
    tail.material.opacity = vis * moving;
    tail.visible = moving > .01;
    for (let i = 0; i < n; i++) {
      const h = history[Math.floor(i / PER)];
      pos[i * 3] = h.x + jitter[i * 3];
      pos[i * 3 + 1] = h.y + jitter[i * 3 + 1];
      pos[i * 3 + 2] = h.z + jitter[i * 3 + 2];
    }
    geo.attributes.position.needsUpdate = true;
  }

  return { group, update };
}

/** A raised arc between two points, high above the dust: k 0 … 1 along it, into out. */
export function arc(from, to, k, out) {
  const mid = from.clone().lerp(to, .5);
  mid.y += 3 + from.distanceTo(to) * .08;
  const e = k * k * (3 - 2 * k), u = 1 - e;
  return out.copy(from).multiplyScalar(u * u).addScaledVector(mid, 2 * u * e).addScaledVector(to, e * e);
}
