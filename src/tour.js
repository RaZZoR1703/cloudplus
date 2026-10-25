import * as THREE from 'three';

// Camera keys: position, look-at point, and cruising speed (m/s) when passing that key.
// The loop starts and ends on the logo, the main subject.
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const KEYS = [
  { pos: v(-3, 6.5, -4), look: v(-3, 6.5, -32), speed: 1.6 },     // logo, close
  { pos: v(14, 12, 9), look: v(-3, 6, -32), speed: 3.5 },         // pull back and rise
  { pos: v(-36, 3.2, 4), look: v(-80, 3, -4), speed: 7 },         // down to street level, heading west
  { pos: v(-60, 2.6, 4.5), look: v(-63, 2.8, 16), speed: 4 },     // shops and the cafe terrace
  { pos: v(-100, 3, 2), look: v(-128, 3.5, -30), speed: 7 },      // supermarket comes into view
  { pos: v(-128, 4, -16), look: v(-130, 4.5, -44), speed: 4 },    // supermarket front
  { pos: v(-150, 13, -6), look: v(-110, 6, -32), speed: 7 },      // rise over the parking
  { pos: v(-60, 17, 0), look: v(30, 9, -12), speed: 14 },         // fast run east above the boulevard
  { pos: v(72, 6, 5), look: v(92, 4, -40), speed: 8 },            // turn into the industrial street
  { pos: v(100, 5, -24), look: v(134, 7, -46), speed: 5 },        // production
  { pos: v(88, 4, -66), look: v(62, 3, -78), speed: 5 },          // logistics docks, vans
  { pos: v(84, 3.5, -108), look: v(62, 2, -96), speed: 5 },
  { pos: v(62, 46, -62), look: v(-3, 8, -32), speed: 12 },       // climb over the warehouse, the plaza ahead
  { pos: v(30, 30, 18), look: v(-3, 7, -32), speed: 9 },          // circle round to the boulevard
  { pos: v(-3, 11, 7), look: v(-3, 7, -32), speed: 5 },           // dive back to the plaza
];

/** Smooth, endlessly looping camera flight over KEYS with per-key speeds. */
export function createTour() {
  const posCurve = new THREE.CatmullRomCurve3(KEYS.map(k => k.pos), true, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3(KEYS.map(k => k.look), true, 'centripetal');
  const n = KEYS.length;

  // Table of (time, curve parameter) built by integrating ds / speed along the arc.
  const SAMPLES = 3000;
  const times = new Float32Array(SAMPLES + 1), params = new Float32Array(SAMPLES + 1);
  const prev = posCurve.getPoint(0), cur = new THREE.Vector3();
  for (let i = 1; i <= SAMPLES; i++) {
    const p = i / SAMPLES;
    posCurve.getPoint(p, cur);
    const seg = p * n, k = Math.floor(seg) % n, f = seg - Math.floor(seg);
    const speed = THREE.MathUtils.lerp(KEYS[k].speed, KEYS[(k + 1) % n].speed, (1 - Math.cos(f * Math.PI)) / 2);
    times[i] = times[i - 1] + cur.distanceTo(prev) / speed;
    params[i] = p;
    prev.copy(cur);
  }
  const duration = times[SAMPLES];

  function paramAt(time) {
    const t = ((time % duration) + duration) % duration;
    let lo = 0, hi = SAMPLES;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid; else hi = mid;
    }
    const f = (t - times[lo]) / (times[hi] - times[lo] || 1);
    return params[lo] + (params[hi] - params[lo]) * f;
  }

  return {
    duration,
    /** Writes the camera pose at the given time into pos and look. */
    sample(time, pos, look) {
      const p = paramAt(time);
      posCurve.getPoint(p, pos);
      lookCurve.getPoint(p, look);
    },
  };
}
