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
import { createParcel, arc } from './parcel.js';
import { createSound } from './sound.js';

gsap.registerPlugin(ScrollTrigger);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = innerWidth < 820;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = THREE.MathUtils.lerp;

// ---------- Renderer, scene, camera ----------
const canvas = document.querySelector('#world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.25));   // the glow and grain hide the difference; the fill rate does not
renderer.transmissionResolutionScale = .5;   // the glass is frosted: its refraction can be soft
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

// One order through the whole site. The businesses stand apart along the way; each hands the order on
// as a glowing cube: the business is drawn into it at its exit, the cube flies on and bursts into the next.
const parcel = createParcel();
scene.add(parcel.group);
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const PLACE = { cloud: v(0, 0, 0), production: v(36, 0, -6), warehouse: v(72, 0, 4), distribution: v(108, 0, -6), retail: v(144, 0, 4), company: v(180, 0, 0), outro: v(180, 0, 0) };
const CLOUD = v(0, .6, 0), CORE = v(0, 1.6, 0);
// Where, in each shape's own frame, the order leaves (the conveyor's end, the right dock door, the truck's back) and arrives.
const EXIT = { cloud: CLOUD, production: v(7, .9, 3.4), warehouse: v(3.3, 1.5, 2.6), distribution: v(5.2, 2.4, 0), retail: v(0, 1.3, 1.6), company: CORE };
const ENTRY = { production: v(0, 1.6, 2.6), warehouse: v(-3.3, 1.5, 2.6), distribution: v(5.2, 2.4, 0), retail: v(0, 1.3, 1.6), company: CORE, outro: CORE };
const cube = new THREE.Vector3();
let handing = false, carry = 0;   // set when this frame runs a hand-over (otherwise the cube is hidden), and how visible the cube is
const sound = createSound();
let lastHand = { pair: '', q: 0 };   // to hear the moment a hand-over passes its burst
/** Shape `name` standing still at its place. */
function settle(name) { river.show(name, name, 1, PLACE[name], PLACE[name], PLACE[name]); }
/** The hand-over from one business to the next at q (0 … 1); returns how far the camera should have moved (0 … 1). */
function handover(from, to, q, t) {
  const A = EXIT[from].clone().add(PLACE[from]), B = ENTRY[to].clone().add(PLACE[to]);
  handing = true;
  // arc() eases once over a wide window: easing twice made the cube dart through the middle.
  arc(A, B, Math.min(1, Math.max(0, (q - .26) / .48)), cube);
  river.show(from, to, q, PLACE[from], PLACE[to], cube);
  carry = smooth(.14, .3, q) * (1 - smooth(.7, .86, q));
  parcel.update(cube, carry, t);
  // Played forward past the burst (the finale's flash comes at .5): a chime, or the closing swell.
  const pair = from + to, at = to === 'outro' ? .5 : .72;
  if (pair === lastHand.pair && lastHand.q < at && q >= at) to === 'outro' ? sound.swell() : sound.chime(Object.keys(PLACE).indexOf(to));
  lastHand = { pair, q };
  return smooth(.2, .8, q);
}
const mixPose = (a, b, k) => ({ pos: a.pos.lerp(b.pos, k), look: a.look.lerp(b.look, k) });

// ---------- Post ----------
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .3, .45, 1);
composer.addPass(bloom);
const bloomSize = bloom.setSize.bind(bloom);
bloom.setSize = (w, h) => bloomSize(w / 2, h / 2);   // a glow is blurry anyway: half the pixels to blur
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
const lenis = still ? null : new Lenis({ lerp: .085 });
if (lenis) {
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
const sections = [...document.querySelectorAll('[data-phase]')];
let ranges = [];
function measure() {
  ranges = sections.map(el => ({ phase: el.dataset.phase, key: el.dataset.business, top: el.offsetTop, span: Math.max(1, el.offsetHeight - innerHeight) }));
}
// The scene follows a softened copy of the scroll, so a flick of the wheel or a fast swipe still
// plays every transition through instead of jumping (touch scrolling is not smoothed by Lenis).
let softY = scrollY, softAt = 0;
function where() {
  const y = softY;
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
/** Over the configurator's ring: high enough to see every slot, turning slowly as the visitor scrolls. */
function companyPose(p) {
  const ang = .5 + p * .7, dist = small ? 30 : 23, c = PLACE.company;
  return {
    pos: new THREE.Vector3(Math.sin(ang) * dist, small ? 17 : 13, Math.cos(ang) * dist).add(c),
    look: new THREE.Vector3(0, small ? -7 : .5, 0).add(c),   // on phones the ring rides above the module buttons
  };
}

/** Circling the shape: the scroll turns the camera a little way round it while a chapter plays. */
function orbitPose(p, turn, c) {
  const ang = turn + (p - .5) * .9, dist = small ? 38 : 29;
  return {
    pos: new THREE.Vector3(Math.sin(ang) * dist, 6.5 - p * 2, Math.cos(ang) * dist).add(c),
    look: new THREE.Vector3(0, 2, 0).add(c),
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
// Pointing at a panel lights its part of the scene; pointing at that spot in the scene lights the panel.
let panelState = '', panelHover = false, hotAmt = 0, linked = false;
for (const { el } of Object.values(panels)) {
  el.addEventListener('pointerenter', () => { panelHover = true; });
  el.addEventListener('pointerleave', () => { panelHover = false; });
  el.addEventListener('focus', () => { panelHover = true; });
  el.addEventListener('blur', () => { panelHover = false; });
}
function updatePanel(key, amount, t) {
  const panel = panels[key];
  thread.classList.toggle('on', !!panel && amount > .5);
  hotAmt += ((panel && amount > .5 && linked ? 1 : 0) - hotAmt) * .12;
  river.uniforms.uHotAmt.value = still ? (linked ? 1 : 0) * Number(!!panel) : hotAmt;
  if (panel) river.uniforms.uHot.value = Number(panel.el.dataset.hot);
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
  const a = panel.anchor.clone().add(PLACE[key]).project(camera), r = panel.el.getBoundingClientRect();
  const ax = (a.x + 1) / 2 * innerWidth, ay = (1 - a.y) / 2 * innerHeight;
  // The panel sits under the scene on wide screens and above it on phones; the thread meets its nearest edge.
  const px = r.left + r.width / 2, py = small ? r.bottom : r.top, bend = small ? -60 : 90;
  threadPath.setAttribute('d', `M${ax},${ay} C${ax},${ay + bend} ${px},${py - bend} ${px},${py}`);
  threadDot.setAttribute('cx', ax); threadDot.setAttribute('cy', ay);
  const near = pointer.on && Math.hypot((pointer.x + .5) * innerWidth - ax, (pointer.y + .5) * innerHeight - ay) < 120;
  linked = panelHover || near;
  panel.el.classList.toggle('linked', linked);
  thread.classList.toggle('linked', linked);
}

// ---------- Chapter overlays ----------
// The scroll only says which copy is on; CSS plays the fade on its own clock, so it never stalls half-shown.
const overlays = [...document.querySelectorAll('[data-overlay]')];
function showOverlay(key, amount) {
  for (const o of overlays) o.classList.toggle('on', o.dataset.overlay === key && amount > .5);
}

// ---------- Configurator: the visitor picks modules, the cloud builds from them ----------
// Module i is slot i of the 'company' shape: its miniature business, collapsed into the core while unpicked.
const MODULES = ['Склад', 'Касса', 'Обмен с 1С', 'Продажи', 'Производство', 'Заказы и доставка'];
const chosen = new Set([0, 1, 3]), picked = river.uniforms.uModules.value;
const plural = n => (n % 10 === 1 && n % 100 !== 11 ? 'модуль' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'модуля' : 'модулей');
const configCount = document.querySelector('[data-config-count]'), configCta = document.querySelector('[data-config-cta]');
function renderConfig() {
  const names = [...chosen].sort().map(i => MODULES[i]);
  configCount.textContent = names.length ? `В сборке ${names.length} ${plural(names.length)}` : 'Отметьте хотя бы один модуль';
  configCta.href = `https://cloudplus.uz/?modules=${encodeURIComponent(names.join(', '))}`;
}
document.querySelectorAll('[data-module]').forEach(btn => {
  const i = Number(btn.dataset.module);
  btn.setAttribute('aria-pressed', chosen.has(i));
  btn.addEventListener('click', () => {
    chosen.has(i) ? chosen.delete(i) : chosen.add(i);
    btn.setAttribute('aria-pressed', chosen.has(i));
    sound.tick(chosen.has(i));
    renderConfig();
  });
});
renderConfig();

// ---------- Autoplay: the page scrolls itself through the story; any wheel, touch or key hands it back ----------
const playBtn = document.querySelector('.play'), playLabel = playBtn.querySelector('span');
const auto = { on: false, y: 0 };
const maxY = () => document.documentElement.scrollHeight - innerHeight;
function setAuto(on) {
  auto.on = on;
  if (on) auto.y = scrollY >= maxY() - 2 ? 0 : scrollY;   // from the end, start over
  playBtn.classList.toggle('on', on);
  playLabel.textContent = on ? 'Пауза' : 'Смотреть историю';
}
if (still) playBtn.hidden = true;   // reduced motion: no scene to watch play
playBtn.addEventListener('click', () => setAuto(!auto.on));
const stopAuto = e => { if (auto.on && !(e.type === 'keydown' && playBtn.contains(e.target))) setAuto(false); };   // Enter or Space on the button is its own click
for (const type of ['wheel', 'touchstart', 'keydown']) addEventListener(type, stopAuto, { passive: true });

const soundBtn = document.querySelector('.sound');
soundBtn.addEventListener('click', () => soundBtn.setAttribute('aria-pressed', sound.toggle()));

// ---------- Loading: the screen lifts once fonts are in and the first frames are drawn ----------
let readyAt = -1;
const loader = document.querySelector('.loader');
renderer.compile(scene, camera);
document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
  readyAt = gsap.ticker.time;
  loader?.classList.add('done');
  setTimeout(() => loader?.remove(), 1200);
  gsap.fromTo('.hero-copy > *', { opacity: 0, y: 26, filter: 'blur(10px)' },
    { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.4, stagger: .14, ease: 'expo.out', delay: .5 });
})));

// ---------- Quality: start from the device's likely power, step down if frames run slow ----------
const weak = (small && (navigator.deviceMemory ?? 4) <= 4) || (navigator.hardwareConcurrency ?? 8) <= 4;
const quality = { density: weak ? .6 : 1, steps: 0, frames: 0, slow: 0, last: 0 };
function watchFrames(time) {
  const dt = time - quality.last;
  quality.last = time;
  if (readyAt < 0 || quality.steps >= 2 || time - readyAt < 1.5 || location.search.includes('quality=fixed')) return;   // fixed: for measuring
  quality.frames++;
  if (dt > 1 / 40) quality.slow++;
  if (quality.frames < 90) return;
  if (quality.slow > 40) {   // under ~40 fps for most of 1.5 s: fewer particles, fewer pixels
    quality.steps++;
    quality.density *= .6;
    renderer.setPixelRatio(Math.max(.75, renderer.getPixelRatio() * .75));
    composer.setPixelRatio(renderer.getPixelRatio());
    resize();
  }
  quality.frames = quality.slow = 0;
}

// ---------- Loop ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const heroCopy = document.querySelector('.hero-copy');
const turns = [-.5, .4, -.3, .6];
const ray = new THREE.Raycaster(), plane = new THREE.Plane(), view = new THREE.Vector3();
let first = true;
gsap.ticker.add(time => {
  const t = still ? 0 : time;
  watchFrames(time);
  const dt = Math.min(.1, time - softAt);
  softY = still ? scrollY : softY + (scrollY - softY) * (1 - Math.exp(-dt * 3.5));
  softAt = time;
  lean.x += (pointer.x - lean.x) * .04;
  lean.y += (pointer.y - lean.y) * .04;
  lean.on += (pointer.on - lean.on) * .05;
  const w = where();
  handing = false;
  carry = 0;
  let flash = 0, thin = 1, target, explode = 1, reveal = 1, offset = small ? 0 : -7, overlayKey = null, overlayAmt = 0;

  if (w.phase === 'hero') {
    target = heroPose(w.p, t); explode = target.explode; offset = 0;
    heroCopy.style.opacity = 1 - smooth(.3, .5, w.p);
    // The glass shatters into dust: particles take over the cloud's shape as the blocks fly apart.
    reveal = smooth(.1, .7, explode);
    settle('cloud');
  } else if (w.phase === 'descend') {
    // The order leaves the program: the cloud's dust is drawn into the cube, which flies to the factory.
    const k = handover('cloud', 'production', w.p, t);
    target = mixPose(heroPose(1, t), orbitPose(0, turns[0], PLACE.production), k);
    offset *= k;
  } else if (w.phase === 'chapter') {
    // The first half of a chapter is the hand-over from the previous business; then the camera circles this one.
    const idx = SHAPES.indexOf(w.key), place = PLACE[w.key];
    if (idx && w.p < .5) {
      const prev = SHAPES[idx - 1];
      target = mixPose(orbitPose(1, turns[idx - 1], PLACE[prev]), orbitPose(0, turns[idx], place), handover(prev, w.key, w.p / .5, t));
    } else {
      settle(w.key);
      target = orbitPose(idx ? (w.p - .5) / .5 : w.p, turns[idx], place);
    }
    overlayKey = w.key;
    overlayAmt = (idx ? w.p > .42 : w.p > .06) && w.p < .94 ? 1 : 0;   // on as the cube bursts, off as the next hand-over starts
  } else if (w.phase === 'configure') {
    // The sale goes back to the program: the shop hands the cube to the core of the visitor's company.
    if (w.p < .4) target = mixPose(orbitPose(1, turns[3], PLACE.retail), companyPose(0), handover('retail', 'company', w.p / .4, t));
    else { settle('company'); target = companyPose((w.p - .4) / .6); }
    overlayKey = 'configure';
    overlayAmt = w.p > .36 && w.p < .96 ? 1 : 0;
  } else {
    // Finale: the company is drawn into the cube at its core, which flares and opens into the Cloudplus mark.
    const q = smooth(0, .7, w.p), c = PLACE.outro;
    target = mixPose(companyPose(1), { pos: v(0, 3, small ? 40 : 30).add(c), look: v(0, small ? -2 : -.5, 0).add(c) }, handover('company', 'outro', q, t));   // the mark rides high, above the closing copy
    offset *= 1 - smooth(.2, .7, q);
    flash = Math.exp(-(((q - .5) / .07) ** 2)) * 2.5;
    thin = 1 - .5 * smooth(.4, .55, q);   // the mark is small: half the dust, a little brighter, drawn far faster; the flash hides the switch
    overlayKey = 'outro';
    overlayAmt = w.p > .74 ? 1 : 0;
  }

  if (auto.on) {
    // Slower while copy is on screen, so it can be read; quicker through the flights between.
    const rate = w.phase === 'hero' || w.phase === 'descend' ? .4 : overlayAmt && w.phase === 'chapter' ? .16 : .26;   // screens per second
    auto.y = Math.min(maxY(), auto.y + innerHeight * rate * dt);
    if (auto.y >= maxY()) setAuto(false);
    lenis.scrollTo(auto.y, { immediate: true });
  }
  // In flight the camera's gaze leans towards the cube, so it glides along with the order.
  if (handing) target.look.lerp(cube, .35 * carry);
  // Ease the camera towards its target: the scroll is already smoothed, this removes jitter.
  if (first) { camPos.copy(target.pos); camLook.copy(target.look); first = false; }
  const ease = still ? 1 : 1 - Math.exp(-dt * 4.5);
  camPos.lerp(target.pos, ease);
  camLook.lerp(target.look, ease);
  camera.position.copy(camPos);
  camera.up.copy(Y);
  camera.lookAt(camLook);
  // On wide screens the shape sits right of centre, clear of the chapter copy on the left.
  camera.filmOffset += (offset - camera.filmOffset) * (still ? 1 : .08);
  camera.updateProjectionMatrix();

  cloud.group.visible = w.phase === 'hero' && explode < .999;   // by then every block has shrunk to nothing
  cloud.group.rotation.y = Math.sin(t * .11) * .12;
  // The cloud builds itself only once the loading screen has lifted.
  for (let i = 0; i < 6; i++) picked[i] += ((chosen.has(i) ? 1 : 0) - picked[i]) * (still ? 1 : .08);
  cloud.update(explode, readyAt < 0 ? 0 : still ? t : t - readyAt, still ? undefined : lean);
  river.uniforms.uFlash.value = flash;
  if (!handing) parcel.update(cube, 0, t);
  sound.update(carry);
  const u = river.uniforms;
  u.uTime.value = t;
  u.uDensity.value = quality.density * thin;
  ambience.uniforms.uDensity.value = quality.density;
  u.uReveal.value = reveal;
  river.points.visible = reveal > .001;   // before the glass breaks the dust is transparent: skip drawing it
  u.uFocus.value = camPos.distanceTo(camLook);
  u.uSize.value = (small ? 70 : 60) * renderer.getPixelRatio() * innerHeight / 900;
  // The pointer's place in the scene, on the plane through the shape facing the camera.
  camera.getWorldDirection(view);
  plane.setFromNormalAndCoplanarPoint(view, camLook);
  ray.setFromCamera({ x: lean.x * 2, y: -lean.y * 2 }, camera);
  ray.ray.intersectPlane(plane, u.uMouse.value);
  u.uView.value.copy(view);
  u.uMouseOn.value = still ? 0 : lean.on;
  // Streams and dust travel with the camera, so every place along the way has them.
  ambience.points.position.set(camLook.x, 0, camLook.z);
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
