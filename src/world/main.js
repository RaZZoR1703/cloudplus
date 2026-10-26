import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createBlockCloud } from './blockCloud.js';
import { createSky, createCloudSea, createMotes, PALETTE } from './atmosphere.js';
import { createParticles, createAmbience } from './particles.js';

gsap.registerPlugin(ScrollTrigger);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = innerWidth < 820;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = THREE.MathUtils.lerp;

// ---------- Renderer, scene, camera ----------
const canvas = document.querySelector('#world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.6));
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = .95;

const scene = new THREE.Scene();
const fog = new THREE.FogExp2(PALETTE.horizon.clone(), .0075);
scene.fog = fog;
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
scene.environmentIntensity = .5;
const camera = new THREE.PerspectiveCamera(34, 1, .1, 900);

const sky = createSky();
const sea = createCloudSea();
const motes = createMotes(small ? 350 : 700);
const cloud = createBlockCloud({ animateIn: !still });
scene.add(sky, sea.mesh, motes.mesh, cloud.group);

// Night light over the clouds: a cool moon and a soft sky fill.
const moon = new THREE.DirectionalLight('#c7dcff', 1.6);
moon.position.set(-6, 9, 6);
scene.add(moon, new THREE.HemisphereLight('#4a6a96', '#0b1220', .6));

// ---------- The particle river: the cloud's dust becomes each business in turn ----------
const river = createParticles(small ? 60000 : 140000);
scene.add(river.points);
const ambience = createAmbience(small ? 12000 : 30000);
scene.add(ambience.points);
const SHAPES = ['production', 'warehouse', 'distribution', 'retail'];

// ---------- Post ----------
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .3, .45, 1);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float v = smoothstep(1.15, .35, length((vUv - .5) * vec2(1.25, 1.)));
      c.rgb *= mix(.6, 1., v);
      c.rgb += (h(vUv * 1000.) - .5) * .016;
      gl_FragColor = c;
    }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

// ---------- Scroll: which section, and how far through it ----------
if (!still) {
  const lenis = new Lenis({ lerp: .085 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
const sections = [...document.querySelectorAll('[data-phase]')];
let ranges = [];
function measure() {
  ranges = sections.map(el => ({ phase: el.dataset.phase, key: el.dataset.business, top: el.offsetTop, span: Math.max(1, el.offsetHeight - innerHeight) }));
}
function where() {
  const y = scrollY;
  for (let i = ranges.length - 1; i >= 0; i--)
    if (y >= ranges[i].top || i === 0) return { ...ranges[i], p: Math.min(1, Math.max(0, (y - ranges[i].top) / ranges[i].span)) };
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = w / h < 1 ? 58 : small ? 46 : 34;
  camera.updateProjectionMatrix();
  measure();
}
addEventListener('resize', resize);
resize();

// ---------- Camera poses ----------
const Y = new THREE.Vector3(0, 1, 0);
/** Circling the shape: the scroll turns the camera a little way round it while a chapter plays. */
function orbitPose(p, turn = 0) {
  const ang = turn + (p - .5) * .9, dist = small ? 38 : 29;
  return {
    pos: new THREE.Vector3(Math.sin(ang) * dist, 6.5 - p * 2, Math.cos(ang) * dist),
    look: new THREE.Vector3(0, 2, 0),
  };
}

const pointer = { x: 0, y: 0, on: 0 }, lean = { x: 0, y: 0, on: 0 };
// Only a mouse hovers: a touch would leave a dent of light stuck where the finger lifted.
addEventListener('pointermove', e => { pointer.x = e.clientX / innerWidth - .5; pointer.y = e.clientY / innerHeight - .5; pointer.on = e.pointerType === 'mouse' ? 1 : 0; });
document.documentElement.addEventListener('pointerleave', () => { pointer.on = 0; });
function heroPose(p, t) {
  const pull = smooth(0, .45, p), explode = smooth(.45, 1, p);
  const orbit = Math.sin(t * .07) * .22 + lean.x * .35;
  const dist = (small ? 14 : 13) + pull * 4 + explode * 6;
  return {
    explode,
    pos: new THREE.Vector3(Math.sin(orbit) * dist, .9 + lean.y * -.8 + pull * 1.2, Math.cos(orbit) * dist),
    look: new THREE.Vector3(small ? 0 : -2.3 * (1 - explode), .15 - explode * 1.2, 0),
  };
}

// ---------- Live panels: a thread of light runs from the scene to the panel ----------
const thread = document.querySelector('.thread'), threadPath = thread.querySelector('path'), threadDot = thread.querySelector('circle');
const panels = Object.fromEntries([...document.querySelectorAll('.panel')].map(el => [el.dataset.overlay, {
  el, anchor: new THREE.Vector3(...el.dataset.anchor.split(',').map(Number)),
  count: el.querySelector('[data-count]'), bar: el.querySelector('[data-bar]'), row: el.querySelector('[data-row]'), status: el.querySelector('[data-status]'),
}]));
// What each panel says at time t; it follows the same cycles as the moving parts in the shader.
const PANELS = {
  production(t) {   // a crate leaves the hall every 1.75 / .6 s, each worth 20 units
    const n = Math.floor(t * .6 / 1.75) % 28, made = 640 + n * 20;
    return { count: `${num(made)} из 1 200`, bar: made / 1200, row: `Ящик ${33 + n} · линия 2`, status: 'на ленте', ok: false };
  },
  warehouse(t) {   // the forklift brings a pallet every seven seconds
    const c = (t / 7) % 1, n = Math.floor(t / 7) % 7, done = 17 + n + (c > .6 ? 1 : 0);
    return { count: `${done} из 24`, bar: done / 24, row: `Паллета ${18 + n} · ячейка B-${14 + n}`,
      status: c < .45 ? 'везут' : c < .6 ? 'сканирование…' : 'принята ✓', ok: c >= .6 };
  },
  distribution(t) {   // a drop every six seconds
    const c = (t / 6) % 1, n = Math.floor(t / 6) % 5, done = 7 + n + (c > .8 ? 1 : 0);
    return { count: `${done} из 12`, bar: done / 12, row: `Точка ${8 + n} · прибытие 14:${20 + n * 12}`,
      status: c > .8 ? 'доставлено ✓' : 'едет', ok: c > .8 };
  },
  retail(t) {   // a shopper reaches the till every 7.5 / .9 s; stock below 40 triggers a reorder
    const n = Math.floor(t * .9 / 1.5) % 8, left = 44 - n;
    return { count: num(312 + n), bar: left / 60, row: `Кофе 250 г · ${left} шт`,
      status: left < 40 ? 'автозаказ ✓' : 'в наличии', ok: left < 40 };
  },
};
const num = n => n.toLocaleString('ru-RU');
let panelState = '';
function updatePanel(key, amount, t) {
  const panel = panels[key];
  thread.style.opacity = panel ? amount : 0;
  if (!panel || amount < .01) return;
  const v = PANELS[key](t), state = key + JSON.stringify(v);
  if (state !== panelState) {
    panelState = state;
    panel.count.textContent = v.count;
    panel.bar.style.width = `${Math.min(1, v.bar) * 100}%`;
    panel.row.textContent = v.row;
    panel.status.textContent = v.status;
    panel.status.className = v.ok ? 'chip ok' : 'chip';
  }
  const a = panel.anchor.clone().project(camera), r = panel.el.getBoundingClientRect();
  const ax = (a.x + 1) / 2 * innerWidth, ay = (1 - a.y) / 2 * innerHeight;
  // The panel sits under the scene on wide screens and above it on phones; the thread meets its nearest edge.
  const px = r.left + r.width / 2, py = small ? r.bottom : r.top, bend = small ? -60 : 90;
  threadPath.setAttribute('d', `M${ax},${ay} C${ax},${ay + bend} ${px},${py - bend} ${px},${py}`);
  threadDot.setAttribute('cx', ax); threadDot.setAttribute('cy', ay);
}

// ---------- Chapter overlays ----------
const overlays = [...document.querySelectorAll('[data-overlay]')];
function showOverlay(key, amount) {
  for (const o of overlays) {
    const on = o.dataset.overlay === key ? amount : 0;
    o.style.opacity = on;
    o.style.visibility = on > .01 ? 'visible' : 'hidden';
    o.style.transform = `translateY(${(1 - on) * 18}px)`;
  }
}

gsap.fromTo('.hero-copy > *', { opacity: 0, y: 26, filter: 'blur(10px)' },
  { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.4, stagger: .14, ease: 'expo.out', delay: .4 });

// ---------- Loop ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const heroCopy = document.querySelector('.hero-copy');
const turns = [-.5, .4, -.3, .6];
const ray = new THREE.Raycaster(), plane = new THREE.Plane(), view = new THREE.Vector3();
let first = true;
gsap.ticker.add(time => {
  const t = still ? 0 : time;
  lean.x += (pointer.x - lean.x) * .04;
  lean.y += (pointer.y - lean.y) * .04;
  lean.on += (pointer.on - lean.on) * .05;
  const w = where();
  let target, explode = 1, reveal = 1, offset = small ? 0 : -7, overlayKey = null, overlayAmt = 0;

  if (w.phase === 'hero') {
    target = heroPose(w.p, t); explode = target.explode; offset = 0;
    heroCopy.style.opacity = 1 - smooth(.3, .5, w.p);
    // The glass shatters into dust: particles take over the cloud's shape as the blocks fly apart.
    reveal = smooth(.1, .7, explode);
    river.show('cloud', 'cloud', 1);
  } else if (w.phase === 'descend') {
    const h = heroPose(1, t), o = orbitPose(0, turns[0]), k = smooth(0, 1, w.p);
    target = { pos: h.pos.lerp(o.pos, k), look: h.look.lerp(o.look, k) };
    offset *= k;
    river.show('cloud', 'production', smooth(.1, .95, w.p));
  } else if (w.phase === 'chapter') {
    const idx = SHAPES.indexOf(w.key);
    target = orbitPose(w.p, turns[idx]);
    river.show(SHAPES[Math.max(0, idx - 1)], w.key, idx ? smooth(0, .4, w.p) : 1);
    overlayKey = w.key;
    overlayAmt = smooth(.3, .42, w.p) * (1 - smooth(.9, .98, w.p));
  } else {
    const o = orbitPose(1, turns[3]), k = smooth(0, .6, w.p);
    target = { pos: o.pos.lerp(new THREE.Vector3(0, 3, small ? 40 : 30), k), look: o.look.lerp(new THREE.Vector3(0, small ? -2 : -.5, 0), k) };   // the wordmark rides high, above the closing copy
    offset *= 1 - k;
    river.show('retail', 'outro', smooth(0, .5, w.p));
    overlayKey = 'outro';
    overlayAmt = smooth(.55, .75, w.p);
  }

  // Ease the camera towards its target: the scroll is already smoothed, this removes jitter.
  if (first) { camPos.copy(target.pos); camLook.copy(target.look); first = false; }
  camPos.lerp(target.pos, still ? 1 : .12);
  camLook.lerp(target.look, still ? 1 : .12);
  camera.position.copy(camPos);
  camera.up.copy(Y);
  camera.lookAt(camLook);
  // On wide screens the shape sits right of centre, clear of the chapter copy on the left.
  camera.filmOffset += (offset - camera.filmOffset) * (still ? 1 : .08);
  camera.updateProjectionMatrix();

  cloud.group.visible = w.phase === 'hero' && explode < .999;   // by then every block has shrunk to nothing
  cloud.group.rotation.y = Math.sin(t * .11) * .12;
  cloud.update(explode, t, still ? undefined : lean);
  const u = river.uniforms;
  u.uTime.value = t;
  u.uReveal.value = reveal;
  u.uFocus.value = camPos.distanceTo(camLook);
  u.uSize.value = (small ? 70 : 60) * renderer.getPixelRatio() * innerHeight / 900;
  // The pointer's place in the scene, on the plane through the shape facing the camera.
  camera.getWorldDirection(view);
  plane.setFromNormalAndCoplanarPoint(view, camLook);
  ray.setFromCamera({ x: lean.x * 2, y: -lean.y * 2 }, camera);
  ray.ray.intersectPlane(plane, u.uMouse.value);
  u.uView.value.copy(view);
  u.uMouseOn.value = still ? 0 : lean.on;
  const am = ambience.uniforms;
  am.uTime.value = t;
  am.uSize.value = u.uSize.value;
  am.uFocus.value = u.uFocus.value;
  am.uReveal.value = w.phase === 'hero' ? reveal : 1;
  sea.update(t, 1 - explode * .7);
  motes.update(t, renderer.getPixelRatio());
  showOverlay(overlayKey, overlayAmt);
  updatePanel(overlayKey, overlayAmt, t);
  grade.uniforms.uTime.value = t % 10;
  composer.render();
});
