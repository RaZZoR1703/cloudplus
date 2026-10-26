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
import { createProcessLine, CHAPTERS } from './process.js';

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

// ---------- The process line: one order through four businesses ----------
const line = createProcessLine();
line.group.position.set(8, -2.6, -2);
scene.add(line.group);
const at = new THREE.Vector3();
/** Where the parcel is in the world, s in steps. */
const parcelAt = s => line.curve.getPoint(Math.min(1, Math.max(0, s / line.last)), at).add(line.group.position);

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
/** Following the parcel: on wide screens it sits right of centre, clear of the copy on the left. */
function followPose(s) {
  const p = parcelAt(s).clone();
  return small
    ? { pos: p.clone().add(new THREE.Vector3(0, 3.4, 14)), look: p.clone().add(new THREE.Vector3(1.5, -1.6, 0)) }
    : { pos: p.clone().add(new THREE.Vector3(-1.5, 3.2, 13)), look: p.clone().add(new THREE.Vector3(-3.2, .6, 0)) };
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
const order = CHAPTERS.map(c => c.key);
let first = true;
gsap.ticker.add(time => {
  const t = still ? 0 : time;
  lean.x += (pointer.x - lean.x) * .04;
  lean.y += (pointer.y - lean.y) * .04;
  lean.on += (pointer.on - lean.on) * .05;
  const w = where();
  let target, explode = 1, s = 0, reveal = 1, overlayKey = null, overlayAmt = 0;

  if (w.phase === 'hero') {
    target = heroPose(w.p, t); explode = target.explode; reveal = 0;
    heroCopy.style.opacity = 1 - smooth(.3, .5, w.p);
  } else if (w.phase === 'descend') {
    // From the scattered cloud to the start of the line, which assembles on the way.
    const h = heroPose(1, t), f = followPose(0), k = smooth(.1, 1, w.p);
    target = { pos: h.pos.lerp(f.pos, k), look: h.look.lerp(f.look, k) };
    reveal = smooth(0, .85, w.p);
  } else if (w.phase === 'chapter') {
    // Each chapter carries the parcel from the previous business's last step through its own five.
    const idx = order.indexOf(w.key);
    s = idx * 5 - 1 + smooth(0, .9, w.p) * 5;
    target = followPose(s);
    overlayKey = w.key;
    overlayAmt = smooth(.08, .2, w.p) * (1 - smooth(.9, .98, w.p));
  } else {
    // Pull back until the whole line, all four businesses, is in view.
    s = line.last;
    const f = followPose(s), mid = parcelAt(line.last / 2).clone(), k = smooth(0, .7, w.p);
    // Looking above the line keeps it low in the frame, under the closing copy.
    target = { pos: f.pos.lerp(mid.clone().add(new THREE.Vector3(0, 22, small ? 120 : 82)), k), look: f.look.lerp(mid.clone().add(new THREE.Vector3(0, small ? 14 : 9, 0)), k) };
    overlayKey = 'outro';
    overlayAmt = smooth(.45, .7, w.p);
  }

  // Ease the camera towards its target: the scroll is already smoothed, this removes jitter.
  if (first) { camPos.copy(target.pos); camLook.copy(target.look); first = false; }
  camPos.lerp(target.pos, still ? 1 : .12);
  camLook.lerp(target.look, still ? 1 : .12);
  camera.position.copy(camPos);
  camera.up.copy(Y);
  camera.lookAt(camLook);

  cloud.group.visible = w.phase === 'hero' || w.phase === 'descend';
  cloud.group.rotation.y = Math.sin(t * .11) * .12;
  cloud.update(explode, t, still ? undefined : lean);
  line.update(s, t, reveal);
  sea.update(t, 1 - explode * .7);
  motes.update(t, renderer.getPixelRatio());
  showOverlay(overlayKey, overlayAmt);
  grade.uniforms.uTime.value = t % 10;
  composer.render();
});
