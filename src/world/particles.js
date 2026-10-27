import * as THREE from 'three';
import { solid } from './blockCloud.js';

// A river of light: one set of particles that flows from shape to shape. Each shape is a list of
// points (x, y, z, kind); kind 0 = surface, 1 = edge (brighter), 2 = smoke (rises), 3 = ground,
// plus 10 × a group for parts that move on their own (see GROUPS in the shader).

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/** Points on boxes [cx, cy, cz, w, h, d, rotZ?] and z/y-axis cylinders: a third on edges, the rest on faces. */
function build(n, { boxes = [], cyls = [], spheres = [], smoke = [], ground = 0, groundGroup = 0, extra = [] }) {
  const out = new Float32Array(n * 4);
  let i = 0;
  const put = (x, y, z, k) => { if (i < n) { out.set([x, y, z, k], i * 4); i++; } };
  const nSmoke = smoke.length ? Math.floor(n * .08) : 0, nGround = Math.floor(n * ground);   // ground fills what is left
  const nExtra = extra.reduce((s, e) => s + e.count, 0);
  const nBody = n - nSmoke - nGround - nExtra;
  // Area of every piece, so density is even across the shape.
  const pieces = [
    ...boxes.map(b => ({ b, a: 2 * (b[3] * b[4] + b[4] * b[5] + b[3] * b[5]) })),
    ...cyls.map(c => ({ c, a: 2 * Math.PI * c[3] * c[4] })),
    ...spheres.map(o => ({ o, a: 4 * Math.PI * o[3] * o[3] })),
  ];
  const total = pieces.reduce((s, p) => s + p.a, 0);
  for (const p of pieces) {
    const count = Math.round(nBody * p.a / total);
    for (let j = 0; j < count; j++) {
      if (p.b) {
        const [cx, cy, cz, w, h, d, rz = 0, group = 0] = p.b;
        let x = (rand() - .5) * w, y = (rand() - .5) * h, z = (rand() - .5) * d, kind = 0;
        if (rand() < .35) {   // edge: two coordinates pinned to the box's corners
          const axis = Math.floor(rand() * 3);
          if (axis !== 0) x = Math.sign(rand() - .5) * w / 2;
          if (axis !== 1) y = Math.sign(rand() - .5) * h / 2;
          if (axis !== 2) z = Math.sign(rand() - .5) * d / 2;
          kind = 1;
        } else {   // face: one coordinate pinned, picked by face area
          const r = rand() * (w * h + h * d + w * d);
          if (r < w * h) z = Math.sign(rand() - .5) * d / 2;
          else if (r < w * h + h * d) x = Math.sign(rand() - .5) * w / 2;
          else y = Math.sign(rand() - .5) * h / 2;
        }
        const c = Math.cos(rz), s = Math.sin(rz);
        put(cx + x * c - y * s, cy + x * s + y * c, cz + z, kind + group * 10);
      } else if (p.o) {
        const [cx, cy, cz, r, group = 0] = p.o, u = rand() * 2 - 1, a = rand() * Math.PI * 2, q = Math.sqrt(1 - u * u);
        put(cx + q * Math.cos(a) * r, cy + u * r, cz + q * Math.sin(a) * r, group * 10);
      } else {
        const [cx, cy, cz, r, h, axis = 'y', group = 0] = p.c;
        const a = rand() * Math.PI * 2, t = (rand() - .5) * h, rim = rand() < .2;
        const u = Math.cos(a) * r, v = Math.sin(a) * r, along = rim ? Math.sign(t) * h / 2 : t;
        const kind = (rim ? 1 : 0) + group * 10;
        if (axis === 'y') put(cx + u, cy + along, cz + v, kind);
        else if (axis === 'x') put(cx + along, cy + u, cz + v, kind);
        else put(cx + u, cy + v, cz + along, kind);
      }
    }
  }
  for (const e of extra) for (let j = 0; j < e.count; j++) put(...e.at(j), e.kind ?? 1);
  for (let j = 0; j < nSmoke; j++) {
    const [cx, cy, cz, r] = smoke[j % smoke.length];
    put(cx + (rand() - .5) * r, cy, cz + (rand() - .5) * r, 2);
  }
  while (i < n) put((rand() - .5) * 26, -.02, (rand() - .5) * 16, 3 + groundGroup * 10);
  return out;
}

/** Points on the cloud's surface, the same volume the glass blocks fill. */
function cloud(n) {
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n;) {
    const x = (rand() - .5) * 7.8, y = -1.3 + rand() * 3.8, z = (rand() - .5) * 4.6;
    if (!solid(x, y, z) || (solid(x + .3, y, z) && solid(x - .3, y, z) && solid(x, y + .3, z) && solid(x, y, z + .3) && solid(x, y, z - .3))) continue;
    out.set([x, y, z, rand() < .25 ? 1 : 0], i * 4);   // same place and size as the glass cloud it replaces
    i++;
  }
  return out;
}

/** Points filling text, standing upright, from a canvas drawing of it. */
function text(n, words, width) {
  return painted(n, 1400, 300, width, 2.6, x => {
    x.font = '600 220px Onest, Geist, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(words, 700, 160);
  });
}

// The Cloudplus mark, drawn from the same SVG as the header logo.
const markImage = new Image();
markImage.src = './mark-white.svg';

/** Points filling whatever paint() draws in white on a w × h canvas, standing upright: width wide, centred at height lift. */
function painted(n, w, h, width, lift, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  paint(x);
  const data = x.getImageData(0, 0, w, h).data, lit = [];
  for (let py = 0; py < h; py += 2) for (let px = 0; px < w; px += 2) if (data[(py * w + px) * 4 + 3] > 128) lit.push(px, py);
  const out = new Float32Array(n * 4), k = width / w;
  for (let i = 0; i < n; i++) {
    const j = Math.floor(rand() * lit.length / 2) * 2;
    out.set([(lit[j] - w / 2 + rand() * 2) * k, (h / 2 - lit[j + 1] + rand() * 2) * k + lift, (rand() - .5) * .5, rand() < .3 ? 1 : 0], i * 4);
  }
  return out;
}

// The truck's points come from the Blender model (blender/truck_points.py); until they load, a box truck stands in.
const WHEELS = [-4.5, 3.3];
const PEOPLE = [[1.6, 3.1], [3.2, 3.5], [4.6, 3.0], [6.1, 3.4], [7.5, 3.2]];
let truck = null;
const truckLoaded = Promise.all(['truck-points.bin', 'truck-points.json'].map(f => fetch(`./world/${f}`)))
  .then(async ([bin, json]) => { if (bin.ok && json.ok) truck = { pts: new Int16Array(await bin.arrayBuffer()), ...await json.json() }; })
  .catch(() => {});

const CORE = [0, 1.6, 0];
/** n points in a ball of radius r at the core. */
function ball(n, r, kind = 1) {
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 - 1, a = rand() * Math.PI * 2, q = Math.sqrt(1 - u * u), d = r * Math.cbrt(rand());
    out.set([CORE[0] + q * Math.cos(a) * d, CORE[1] + u * d, CORE[2] + q * Math.sin(a) * d, kind], i * 4);
  }
  return out;
}

function shapes(n) {
  // Warehouse: a gabled hangar with three roll-up dock doors, a forklift and pallets outside.
  const pitch = Math.atan2(.9, 5), slope = Math.hypot(.9, 5);   // a low industrial pitch, not a house
  const hangar = [[0, 2, -1, 10, 4, 7], [-2.5, 4.45, -1, slope, .1, 7.2, pitch], [2.5, 4.45, -1, slope, .1, 7.2, -pitch],
    [0, .5, 3.2, 10.4, 1, 1.4],   // loading dock
    ...[-3.3, 0, 3.3].map(x => [x, 2.45, 2.52, 2.4, 2.9, .04]),   // door frames
    // Forklift (group 4), its forks (7) and the pallet it carries (5): they shuttle pallets into the left door.
    [-7, .8, 4.4, 1.6, .9, 1.2, 0, 4], [-7.4, 2.15, 4.4, .9, .08, 1.1, 0, 4], [-7.8, 1.5, 3.9, .07, 1.4, .07, 0, 4], [-7.8, 1.5, 4.9, .07, 1.4, .07, 0, 4],
    [-6.1, 1.5, 4.4, .15, 2.6, 1, 0, 4], [-5.5, .12, 4.1, 1.1, .07, .12, 0, 7], [-5.5, .12, 4.7, 1.1, .07, .12, 0, 7],
    [-5.5, .25, 4.4, 1.2, .14, 1.1, 0, 5], [-5.5, .75, 4.4, 1.1, .85, 1, 0, 5],
    ...[[5.6, 4.6], [6.9, 4.6], [5.6, 5.9]].flatMap(([x, z]) => [[x, .1, z, 1.2, .14, 1.1], [x, .62, z, 1.1, .9, 1]]),
    [6.25, 1.55, 4.6, 1.1, .9, 1]];
  const gable = j => {   // the triangle over each end wall
    const x = (rand() - .5) * 10;
    return [x, 4 + rand() * .9 * (1 - Math.abs(x) / 5), j % 2 ? 2.5 : -4.5];
  };
  const sawtooth = () => {
    const x0 = -5 + Math.floor(rand() * 4) * 2.5, z = (rand() - .5) * 5, r = rand();
    if (r < .45) { const t = rand(); return [x0 + 2.5 * t, 3.2 + 1.2 * t, z, 0]; }   // the slope
    if (r < .75) return [x0 + 2.5, 3.2 + rand() * 1.2, Math.round(z * 2) / 2 + (rand() - .5) * .04, 1];   // glazing bars
    return [x0 + 2.5 * (r < .87 ? 1 : rand()), r < .87 ? 4.4 : 3.2 + 1.2 * rand(), (rand() - .5) * 5, 1];   // ridges
  };
  const windows = () => {   // a band of windows along the hall's front
    const i = Math.floor(rand() * 7), x = -4.2 + i * 1.4, w = .9, h = .7, e = rand() * 2 * (w + h);
    const [dx, dy] = e < w ? [e, 0] : e < w + h ? [w, e - w] : e < 2 * w + h ? [e - w - h, h] : [0, e - 2 * w - h];
    return [x - w / 2 + dx, 1.9 + dy, 2.52, 1];
  };
  const slats = door => () => [door * 3.3 + (rand() - .5) * 2.3, 1.1 + Math.floor(rand() * 11) * .25, 2.55];   // slats catch the light
  const oneC = () => {   // the 1C exchange: «1С» standing on a ring
    const t = text(Math.floor(n * .7), '1С', 4.5);
    return build(n, { cyls: [[0, .05, 0, 2.6, .1]], extra: [{ count: t.length / 4, at: j => [t[j * 4], t[j * 4 + 1] - .6, t[j * 4 + 2], t[j * 4 + 3]] }] });
  };
  const sales = () => {   // sales: a rising bar chart with its trend line
    const bars = [1.4, 2.2, 1.8, 3, 3.9];
    return build(n, {
      boxes: bars.map((h, i) => [-3.2 + i * 1.6, h / 2, 0, 1, h, 1]),
      extra: [{ count: Math.floor(n * .12), at: () => {
        const t = rand() * 4, i = Math.floor(t);
        return [-3.2 + t * 1.6, bars[i] + (bars[Math.min(4, i + 1)] - bars[i]) * (t - i) + .6, 0];
      } }],
    });
  };
  // Shapes are built on first use: the shop's sign and the wordmark need the web font.
  const makers = {
    cloud: () => cloud(n),
    production: () => build(n, {
      boxes: [[0, 1.6, 0, 10, 3.2, 5], [-6.6, 1.1, .6, 3, 2.2, 3.8], [-6.2, .9, 2.52, 1.4, 1.8, .04],   // hall, annex, its gate
        [3.5, .55, 3.4, 8, .12, .9], ...[0, 2.5, 5, 7.5].map(x => [x, .4, 3.4, .1, .8, .1]),   // conveyor belt and legs
        ...[0, 1.75, 3.5, 5.25].map(x => [x, .9, 3.4, .7, .6, .6, 0, 8])],
      cyls: [[3.4, 4.6, -1.6, .45, 6.6], [4.7, 4.1, -1.6, .35, 5.6], [-3.5, 1.2, 3.5, .9, 2.4], [-1.4, 1.2, 3.5, .9, 2.4],
        [-7.4, 2.4, -2.6, .85, 4.8], [-5.5, 2.4, -2.6, .85, 4.8], [-4.4, 4.2, -2.6, .12, 2.2, 'x']],   // silos and the pipe into the hall
      extra: [
        { count: Math.floor(n * .1), at: sawtooth },   // north-light roof: slopes and bright glazing
        { count: Math.floor(n * .05), at: windows },
        { count: Math.floor(n * .03), at: j => {   // the silos' conical caps
          const t = rand(), a = rand() * Math.PI * 2, r = .85 * (1 - t);
          return [(j % 2 ? -7.4 : -5.5) + Math.cos(a) * r, 4.8 + t * .7, -2.6 + Math.sin(a) * r, t < .03 ? 1 : 0];
        } },
      ],
      smoke: [[3.4, 7.9, -1.6, .5], [4.7, 6.9, -1.6, .4]],   // crates on the belt (group 8) ride out of the hall
      ground: .06,
    }),
    warehouse: () => build(n, {
      boxes: hangar,
      cyls: [[-7.6, .32, 4.4, .32, 1.3, 'z', 4], [-6.5, .32, 4.4, .32, 1.3, 'z', 4]],
      extra: [{ count: Math.floor(n * .05), at: gable, kind: 0 }, { count: Math.floor(n * .02), at: slats(-1), kind: 61 },
        { count: Math.floor(n * .04), at: j => slats(j % 2 ? 1 : 0)() }],
      ground: .06,
    }),
    // The truck (group 11) idles on a road that runs past (10); its wheels (9) turn, spokes show the spin.
    distribution: () => truck ? build(n, {
      extra: [{ count: Math.floor(n * .82), at: j => {
        const i = (j % truck.count) * 4, d = truck.pts, jit = j < truck.count ? 0 : .012;   // repeats are jittered apart
        return [d[i] / 1000 + (rand() - .5) * jit, d[i + 1] / 1000 + (rand() - .5) * jit, d[i + 2] / 1000 + (rand() - .5) * jit, d[i + 3]];
      } }, { count: Math.floor(n * .05), kind: 101, at: j => [(rand() - .5) * 26, 0, j % 2 ? 2.3 : -2.3] }],
      ground: .08, groundGroup: 10,
    }) : build(n, {
      boxes: [[-4.6, 1.75, 0, 2.2, 2.3, 2.4, 0, 11], [-4.9, 2.4, 0, 1.4, 1, 2.2, .35, 11], [1.2, 2.25, 0, 7.6, 3.3, 2.6, 0, 11], [-1, .55, 0, 11, .35, 1.4, 0, 11]],
      cyls: WHEELS.flatMap(x => [[x, .62, 1.15, .62, .45, 'z', 9], [x, .62, -1.15, .62, .45, 'z', 9]]),
      extra: [{ count: Math.floor(n * .03), kind: 91, at: j => {
        const x = WHEELS[j % 2], z = j % 4 < 2 ? 1.38 : -1.38, a = (j % 3) * 2.094, r = rand() * .58;
        return [x + Math.cos(a) * r, .62 + Math.sin(a) * r, z];
      } }, { count: Math.floor(n * .05), kind: 101, at: j => [(rand() - .5) * 26, 0, j % 2 ? 2.2 : -2.2] }],   // lane lines
      ground: .08, groundGroup: 10,
    }),
    // The shop: its sign lights up (group 12), shoppers (13) walk in at the door.
    retail: () => {
      const sign = text(Math.floor(n * .06), 'МАГАЗИН', 5.6);
      return build(n, {
        boxes: [[0, 2.1, -.6, 11, 4.2, 4.2], [0, 3.3, 1.9, 11.4, .12, 1.6], [0, 4.9, 1.5, 7, 1, .25],
          [0, 1.3, 1.52, 1.8, 2.6, .05],   // door frame
          ...[-3.2, 0, 3.2].flatMap(x => [[x, 1.4, -1.4, 2.2, 2.8, .08],   // shelf units with goods on them
            ...[.5, 1.2, 1.9, 2.6].map(y => [x, y - .3, -1.1, 2.2, .05, .6]),
            ...[-.8, -.27, .27, .8].flatMap(dx => [.5, 1.2, 1.9].map(y => [x + dx, y - .1, -1.1, .4, .35, .4]))]),
          [3.8, .7, 3.4, 1.1, .6, .7], [3.3, .95, 3.4, .06, .9, .06]],   // shopping cart and its handle
        cyls: [[3.4, .15, 3.4, .14, .7, 'z'], [4.2, .15, 3.4, .14, .7, 'z'],
          // shoppers (group 13): body and two legs; heads are spheres below
          ...PEOPLE.flatMap(([x, z]) => [[x, 1.1, z, .2, .7, 'y', 13], [x - .09, .38, z, .07, .75, 'y', 13], [x + .09, .38, z, .07, .75, 'y', 13]])],
        spheres: PEOPLE.map(([x, z]) => [x, 1.62, z, .15, 13]),
        extra: [{ count: sign.length / 4, kind: 121, at: j => [sign[j * 4], sign[j * 4 + 1] - 2.6 + 4.9, 1.66] },
          { count: Math.floor(n * .05), at: j => {   // storefront glazing bars and the awning's stripes
            if (j % 3) { const x = -5.5 + Math.floor(rand() * 11) * 1.1; return [Math.abs(x) < 1 ? x * 1.4 : x, .1 + rand() * 2.9, 1.52]; }
            return [-5.7 + Math.floor(rand() * 20) * .6, 3.3, 1.1 + rand() * 1.6];
          } }],
        ground: .06,
      });
    },
    // The configurator: the visitor's company in miniature, six module slots round a glowing core.
    // Slot s is group 20 + s; the shader collapses unpicked slots into the core. kind 4 = data flowing in.
    company: () => {
      const out = new Float32Array(n * 4), per = Math.floor(n * .13), flows = Math.floor(n * .02);
      const minis = [makers.warehouse(), makers.retail(), oneC(), sales(), makers.production(), makers.distribution()];
      let i = 0;
      minis.forEach((src, slot) => {
        const a = slot / 6 * Math.PI * 2 + Math.PI / 2, cx = Math.cos(a) * 5.2, cz = Math.sin(a) * 5.2, group = (20 + slot) * 10;
        for (let j = 0; j < per;) {
          const q = Math.floor(rand() * n) * 4;
          if (src[q + 3] % 10 === 3) continue;   // no ground under the miniatures
          out.set([cx + src[q] * .26, src[q + 1] * .26, cz + src[q + 2] * .26, (src[q + 3] % 10) + group], i++ * 4);
          j++;
        }
        for (let j = 0; j < flows; j++) out.set([cx + (rand() - .5) * .6, .6 + rand() * .6, cz + (rand() - .5) * .6, 4 + group], i++ * 4);
      });
      const core = ball(n - i, .9);
      for (let j = 0; i < n; j++, i++) {   // a bright ball and a ring round it
        if (j % 3) out.set(core.subarray(j * 4, j * 4 + 4), i * 4);
        else { const a = rand() * Math.PI * 2; out.set([Math.cos(a) * 1.7, CORE[1], Math.sin(a) * 1.7, 1], i * 4); }
      }
      return out;
    },
    core: () => ball(n, .35),
    // The finale: the Cloudplus mark, or the wordmark if the SVG has not loaded.
    outro: () => markImage.complete && markImage.naturalWidth ? painted(n, 800, 600, 11, 3.2, x => x.drawImage(markImage, 40, 30, 720, 540)) : text(n, 'Cloudplus', 21),
  };
  return makers;
}

const vertexShader = /* glsl */`
attribute vec4 aA;
attribute vec4 aB;
attribute float aRand;
uniform float uMix, uTime, uSize, uFocus, uReveal, uMouseOn, uWheelY, uDensity, uFlash;
uniform float uModules[6];
uniform vec2 uWheels;
uniform vec3 uMouse, uView;
varying float vAlpha, vGlow;
vec3 flow(vec3 p, float t) {
  return vec3(sin(p.y * .35 + t * .7) + sin(p.z * .21 - t * .4),
              sin(p.z * .31 + t * .6) + sin(p.x * .17 + t * .5),
              sin(p.x * .27 - t * .8) + sin(p.y * .23 + t * .3));
}
void main() {
  // Each particle leaves at its own moment, swirls out along a flow field and lands in the new shape.
  float k = smoothstep(0., 1., clamp(uMix * 1.7 - aRand * .7, 0., 1.));
  vec3 p = mix(aA.xyz, aB.xyz, k);
  float kind = k < .5 ? aA.w : aB.w;
  float group = floor(kind / 10.);
  kind -= group * 10.;
  float swirl = sin(3.14159 * k);
  p += flow(p * .5 + aRand * 6., uTime) * (swirl * 2.6 + .035);
  vAlpha = 1.;
  if (kind > 1.5 && kind < 2.5) {   // smoke: rises, drifts with the wind and fades
    float h = fract(uTime * .07 + aRand * 5.);
    p += vec3(h * h * 2.5, h * 4.2, 0.) + flow(p, uTime) * h * .5;
    vAlpha = (1. - h) * .7;
  }
  if (group > 19.5) {   // GROUPS 20–25: the configurator's six modules round the core
    vec3 core = vec3(0., 1.6, 0.);
    float m = uModules[int(group - 19.5)];
    if (kind > 3.5) {   // data flowing from the module into the core, arcing up on the way
      float h = fract(uTime * .45 + aRand * 4.);
      p = mix(p, core, h) + vec3(0., sin(h * 3.14159) * .9, 0.);
      vAlpha *= sin(h * 3.14159);
      kind = 1.;
    }
    p = mix(core, p, m);   // a module that is not picked waits inside the core
    vAlpha *= m;
  } else if (group > 7.5) {
    // GROUPS 8–13 move on their own: crates on the conveyor, the truck's wheels, road, body, the shop's sign and shoppers.
    if (group < 8.5) { float o = mod(p.x + uTime * .6, 7.); p.x = o; vAlpha *= smoothstep(0., .6, o) * smoothstep(7., 6.4, o); }
    else if (group < 9.5) {
      float cx = abs(p.x - uWheels.x) < abs(p.x - uWheels.y) ? uWheels.x : uWheels.y;   // nearest axle
      vec2 d = p.xy - vec2(cx, uWheelY);
      float a = uTime * 8.;   // the cab leads towards -x: wheels roll anticlockwise at road speed / radius
      p.xy = vec2(cx, uWheelY) + mat2(cos(a), sin(a), -sin(a), cos(a)) * d;
    }
    else if (group < 10.5) {   // the road runs back past the truck
      float o = mod(p.x + uTime * 5. + 13., 26.);
      p.x = o - 13.; vAlpha *= smoothstep(0., 3., o) * smoothstep(26., 23., o);
    }
    else if (group < 11.5) p.y += sin(uTime * 13.) * .015 + sin(uTime * 3.1) * .02;
    else if (group < 12.5) vAlpha *= .55 + 1.2 * pow(.5 + .5 * sin(uTime * 1.6), 6.);
    else { float o = mod(p.x - .8 - uTime * .9, 7.5); p.x = .8 + o; vAlpha *= smoothstep(0., .8, o) * smoothstep(7.5, 6.5, o); }
  } else if (group > 3.5) {
    // GROUPS 4–7: a seven-second cycle at the warehouse. 4 forklift, 7 its forks, 5 the pallet, 6 the left door.
    float c = fract(uTime / 7.);
    float go = smoothstep(0., .35, c) * (1. - smoothstep(.6, .95, c));
    float lift = smoothstep(.22, .4, c) * (1. - smoothstep(.62, .85, c));
    if (group < 4.5) p.x += go * 2.2;
    else if (group > 6.5) p += vec3(go * 2.2, lift * .9, 0.);
    else if (group < 5.5) {   // the pallet rides in, is pushed through the open door and a fresh one appears
      p += vec3(2.2 * (c < .6 ? go : 1.), .9 * smoothstep(.22, .4, c), -2.6 * smoothstep(.42, .6, c));
      vAlpha *= max(1. - smoothstep(.5, .6, c), smoothstep(.93, 1., c));
    } else p.y += (3.85 - p.y) * .92 * smoothstep(.36, .48, c) * (1. - smoothstep(.72, .88, c));   // the door rolls up
  }
  // The pointer parts the particles and stirs them round it.
  vec3 d = p - uMouse;
  float m = exp(-dot(d, d) / 5.) * uMouseOn;
  p += normalize(d + 1e-4) * m * 1.4 + cross(uView, d) * m * .6;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  float blur = clamp(abs(-mv.z - uFocus) * .035, 0., 1.);   // depth of field: out of focus = bigger, fainter
  float edge = step(.5, kind) * step(kind, 1.5) + step(11.5, group) * step(group, 12.5);
  gl_PointSize = uSize * (1. + blur * 2.2) * (1. + edge * .35) / -mv.z;
  vAlpha *= uReveal / (1. + blur * 3.) * (kind > 2.5 ? .4 : 1.) * inversesqrt(uDensity) * (1. + uFlash);
  if (aRand > uDensity) gl_PointSize = 0.;   // weaker devices draw a share of the particles, a little brighter
  vGlow = max(edge, aRand * aRand);
  gl_Position = projectionMatrix * mv;
}`;
const fragmentShader = /* glsl */`
varying float vAlpha, vGlow;
void main() {
  vec2 c = gl_PointCoord - .5;
  float r = dot(c, c);
  if (r > .25) discard;
  vec3 col = mix(vec3(.2, .55, 1.), vec3(.86, .95, 1.), vGlow);
  gl_FragColor = vec4(col * (.55 + .75 * vGlow), smoothstep(.25, 0., r) * vAlpha * .32);
}`;

/** The particle river. show(from, to, mix) picks the two shapes it is between; names as in shapes(). */
export function createParticles(n) {
  const make = shapes(n), all = {};
  const get = name => (all[name] ??= make[name]());
  const geo = new THREE.BufferGeometry();
  const a = new THREE.BufferAttribute(get('cloud').slice(), 4), b = new THREE.BufferAttribute(get('cloud').slice(), 4);
  const r = new Float32Array(n).map(() => rand());
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aA', a);
  geo.setAttribute('aB', b);
  geo.setAttribute('aRand', new THREE.BufferAttribute(r, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 30);
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uMix: { value: 0 }, uTime: { value: 0 }, uSize: { value: 60 }, uFocus: { value: 24 }, uReveal: { value: 0 },
      uMouse: { value: new THREE.Vector3(0, 0, 99) }, uMouseOn: { value: 0 }, uView: { value: new THREE.Vector3(0, 0, 1) },
      uWheels: { value: new THREE.Vector2(...WHEELS) }, uWheelY: { value: .62 }, uDensity: { value: 1 }, uFlash: { value: 0 },
      uModules: { value: [0, 0, 0, 0, 0, 0] },
    },
  });
  const points = new THREE.Points(geo, material);
  truckLoaded.then(() => { if (truck) { material.uniforms.uWheels.value.set(...truck.wheels); material.uniforms.uWheelY.value = truck.wheelY; } });
  let pair = 'cloud>cloud';
  return {
    points,
    uniforms: material.uniforms,
    show(from, to, mix) {
      if (`${from}>${to}` !== pair) {
        pair = `${from}>${to}`;
        a.array.set(get(from)); b.array.set(get(to));
        a.needsUpdate = b.needsUpdate = true;
      }
      material.uniforms.uMix.value = mix;
    },
  };
}

const ambientVertex = /* glsl */`
attribute vec4 aSeed;   // x: stream (0) or dust (1), y: lane, z/w: offsets
uniform float uTime, uSize, uFocus, uReveal, uDensity;
varying float vAlpha, vGlow;
void main() {
  vec3 p;
  if (aSeed.x < .5) {
    // Streams of data: ribbons of light that flow through the scene from one side to the other.
    float h = fract(uTime * (.018 + aSeed.z * .012) + aSeed.w * 7.);
    float x = mix(-48., 48., h), lane = aSeed.y;
    p = vec3(x, 1.2 + lane * 2.6 + sin(x * .11 + lane * 2.3) * 1.6, -9. + lane * 7. + cos(x * .07 + lane) * 3.);
    p += vec3(0., sin(aSeed.w * 40.) , cos(aSeed.w * 33.)) * (.15 + aSeed.z * .5);
    vAlpha = smoothstep(0., .12, h) * smoothstep(1., .85, h);
    vGlow = aSeed.z;
  } else {
    // Dust hanging deep in the night, drifting slowly.
    p = vec3(aSeed.y * 90. - 45., aSeed.z * 16. - 1., aSeed.w * 70. - 40.);
    p += vec3(sin(uTime * .05 + aSeed.w * 30.), sin(uTime * .07 + aSeed.y * 20.) * .6, cos(uTime * .04 + aSeed.z * 25.)) * 1.5;
    vAlpha = .35;
    vGlow = .2;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  float blur = clamp(abs(-mv.z - uFocus) * .035, 0., 1.);
  gl_PointSize = uSize * (1. + blur * 2.2) / -mv.z;
  vAlpha *= uReveal / (1. + blur * 3.);
  if (aSeed.w > uDensity) gl_PointSize = 0.;
  gl_Position = projectionMatrix * mv;
}`;

/** Life around the shapes: flowing streams of light and drifting dust, so no frame is ever empty. */
export function createAmbience(n) {
  const seeds = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const stream = i < n * .65;
    seeds.set(stream ? [0, Math.floor(rand() * 3), rand(), rand()] : [1, rand(), rand(), rand()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 80);
  const material = new THREE.ShaderMaterial({
    vertexShader: ambientVertex, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSize: { value: 60 }, uFocus: { value: 24 }, uReveal: { value: 0 }, uDensity: { value: 1 } },
  });
  return { points: new THREE.Points(geo, material), uniforms: material.uniforms };
}
