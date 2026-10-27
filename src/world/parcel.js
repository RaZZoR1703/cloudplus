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
 * One order, carried through the whole site: a glowing parcel with a comet tail that flies
 * from one business to the next while the scene changes. update(from, to, k, time) puts it
 * k (0 … 1) of the way along an arc between two points; outside 0 … 1 it rests hidden.
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
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
  const tail = new THREE.Points(geo, new THREE.PointsMaterial({
    size: .3, map: dot(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  group.add(tail);

  const at = new THREE.Vector3(), mid = new THREE.Vector3();
  let fresh = true;

  function update(from, to, k, time) {
    const on = k > 0 && k < 1;
    group.visible = on;
    if (!on) { fresh = true; return; }
    // A raised arc from one business to the next: a quadratic curve through a point above the middle.
    mid.lerpVectors(from, to, .5).y += 5 + from.distanceTo(to) * .3;   // high above the swirling dust
    const e = k * k * (3 - 2 * k), u = 1 - e;
    at.copy(from).multiplyScalar(u * u).addScaledVector(mid, 2 * u * e).addScaledVector(to, e * e);
    box.position.copy(at);
    box.rotation.set(time * 2.1, time * 1.4, 0);
    // Fade in on take-off and out on landing.
    const vis = Math.min(1, k * 8, (1 - k) * 8);
    box.scale.setScalar(.4 + .6 * vis);
    box.material.opacity = vis;
    tail.material.opacity = vis;
    if (fresh) { history.forEach(h => h.copy(at)); fresh = false; }
    history.unshift(history.pop().copy(at));   // reuse the oldest vector as the newest
    for (let i = 0; i < n; i++) {
      const h = history[Math.floor(i / PER)];
      pos[i * 3] = h.x + jitter[i * 3];
      pos[i * 3 + 1] = h.y + jitter[i * 3 + 1];
      pos[i * 3 + 2] = h.z + jitter[i * 3 + 2];
    }
    geo.attributes.position.needsUpdate = true;
  }

  update(null, null, 0, 0);
  return { group, update };
}
