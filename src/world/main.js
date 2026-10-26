import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createBlockCloud, createModuleTile } from './blockCloud.js';
import { createSky, createCloudSea, createMotes, PALETTE } from './atmosphere.js';
import { createPlanet, CENTER, R, SCALE, BUSINESSES } from './planet.js';

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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

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

// Night light for the cloud above; morning light for the world below.
const moon = new THREE.DirectionalLight('#c7dcff', 1.6);
moon.position.set(-6, 9, 6);
const nightFill = new THREE.HemisphereLight('#4a6a96', '#0b1220', .6);
const sun = new THREE.DirectionalLight('#ffe2c4', 0);
sun.position.copy(CENTER).add(new THREE.Vector3(28, 34, 22));
sun.target.position.copy(CENTER);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 10, far: 95 });
sun.shadow.radius = 3;
sun.shadow.blurSamples = 10;
sun.shadow.bias = -.0006;
const dayFill = new THREE.HemisphereLight('#cfe3f7', '#7d936b', 0);
scene.add(moon, nightFill, sun, sun.target, dayFill);

// ---------- The planet and its module tiles ----------
let planet = null;
const tiles = [];
const TILE_NAMES = { production: 'Производство', warehouse: 'Склад', cafe: 'Касса', store: 'Продажи' };
createPlanet().then(p => {
  planet = p;
  scene.add(p.group);
  for (const [key, anchor] of Object.entries(p.anchors)) {
    const tile = createModuleTile(TILE_NAMES[key]);
    const up = anchor.clone().sub(CENTER).normalize();
    tile.scale.setScalar(1.25);
    tile.userData = { key, rest: anchor.clone().addScaledVector(up, 1.7), up };
    scene.add(tile);
    tiles.push(tile);
  }
});

// ---------- Post ----------
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
// Contact shadows for the world below (off above the clouds, where nothing touches).
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.blendIntensity = .9;
gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 1.5, scale: 1.2, samples: 12 });
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .5, .45, .8);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVeil: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVeil; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float v = smoothstep(1.15, .35, length((vUv - .5) * vec2(1.25, 1.)));
      c.rgb *= mix(.6, 1., v);
      // Passing through the clouds: a soft white-blue veil.
      c.rgb = mix(c.rgb, vec3(.86, .9, .95), uVeil);
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
const planetR = R * SCALE;
const deg = THREE.MathUtils.degToRad;
/** A camera position around the planet: latitude/longitude (deg) and distance from its centre. */
function orbitPos(lat, lon, dist) {
  return new THREE.Vector3(dist * Math.cos(deg(lat)) * Math.sin(deg(lon)), dist * Math.sin(deg(lat)), dist * Math.cos(deg(lat)) * Math.cos(deg(lon))).add(CENTER);
}
function businessOrbit(key, p) {
  const b = BUSINESSES[key], s = Math.sign(b.lat);
  // In front of the business, over the road, easing a little closer while the chapter plays.
  // Camera up follows the ground there, so buildings stand upright and the horizon curves behind them.
  const anchor = planet ? planet.anchors[key] : CENTER, up = anchor.clone().sub(CENTER).normalize();
  // Looking a little below the business keeps it (and its tile) in the upper, uncovered half of the frame.
  return { lat: b.lat - s * 21, lon: b.lon + 14 - p * 6, dist: planetR + 8.5 - p * 1.5, look: anchor.clone().addScaledVector(up, -.3), up };
}
const Y = new THREE.Vector3(0, 1, 0);
const overview = { lat: 32, lon: -40, dist: planetR + 34, look: CENTER.clone(), up: Y };
const order = ['production', 'warehouse', 'cafe', 'store'];
/** Blends two orbits, rising between them so the camera never cuts through the planet. */
function orbitBlend(a, b, k) {
  const dlon = ((b.lon - a.lon + 540) % 360) - 180;
  const lift = Math.sin(Math.PI * k) * Math.min(14, Math.abs(dlon) * .12);
  return { pos: orbitPos(lerp(a.lat, b.lat, k), a.lon + dlon * k, lerp(a.dist, b.dist, k) + lift), look: new THREE.Vector3().lerpVectors(a.look, b.look, k), up: new THREE.Vector3().lerpVectors(a.up, b.up, k).normalize() };
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
    const video = o.querySelector('video');
    if (video) {
      if (on > .3 && video.paused) video.play().catch(() => {});
      else if (on <= .3 && !video.paused) video.pause();
    }
  }
}

gsap.fromTo('.hero-copy > *', { opacity: 0, y: 26, filter: 'blur(10px)' },
  { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.4, stagger: .14, ease: 'expo.out', delay: .4 });

// ---------- Loop ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camUp = new THREE.Vector3(0, 1, 0), sunDir = new THREE.Vector3(), camRight = new THREE.Vector3();
const heroCopy = document.querySelector('.hero-copy');
let first = true;
gsap.ticker.add(time => {
  const t = still ? 0 : time;
  lean.x += (pointer.x - lean.x) * .04;
  lean.y += (pointer.y - lean.y) * .04;
  lean.on += (pointer.on - lean.on) * .05;
  const w = where();
  let target, explode = 1, day = 1, overlayKey = null, overlayAmt = 0;

  if (w.phase === 'hero') {
    const h = heroPose(w.p, t);
    target = h; explode = h.explode; day = 0;
    heroCopy.style.opacity = 1 - smooth(.3, .5, w.p);
  } else if (w.phase === 'descend') {
    // From above the clouds, down through them, to a first view of the planet.
    const h = heroPose(1, t);
    const end = orbitPos(overview.lat, overview.lon, overview.dist);
    const k = smooth(0, 1, w.p);
    const mid = new THREE.Vector3(h.pos.x * .4, -10, h.pos.z * .6 + 10);
    const a = new THREE.Vector3().lerpVectors(h.pos, mid, k), b = new THREE.Vector3().lerpVectors(mid, end, k);
    target = { pos: a.lerp(b, k), look: new THREE.Vector3().lerpVectors(h.look, overview.look, smooth(.15, .7, w.p)) };
    day = smooth(.35, .6, w.p);
  } else if (w.phase === 'chapter') {
    const idx = order.indexOf(w.key);
    const prev = idx === 0 ? overview : businessOrbit(order[idx - 1], 1);
    target = orbitBlend(prev, businessOrbit(w.key, smooth(.25, 1, w.p)), smooth(0, .25, w.p));
    overlayKey = w.key;
    overlayAmt = smooth(.22, .32, w.p) * (1 - smooth(.9, .98, w.p));
  } else {
    target = orbitBlend(businessOrbit('store', 1), { ...overview, dist: overview.dist + 8, lon: overview.lon + 300 }, smooth(0, .7, w.p));
    overlayKey = 'outro';
    overlayAmt = smooth(.45, .7, w.p);
  }

  // Ease the camera towards its target: the scroll is already smoothed, this removes jitter.
  if (first) { camPos.copy(target.pos); camLook.copy(target.look); first = false; }
  camPos.lerp(target.pos, still ? 1 : .12);
  camLook.lerp(target.look, still ? 1 : .12);
  camUp.lerp(target.up ?? Y, still ? 1 : .12).normalize();
  camera.position.copy(camPos);
  camera.up.copy(camUp);
  camera.lookAt(camLook);

  // Light, sky and fog follow the descent from night into morning.
  moon.intensity = 1.6 * (1 - day);
  nightFill.intensity = .6 * (1 - day);
  sun.intensity = 4.2 * day;
  // The sun keeps over the camera's right shoulder, so whichever side of the planet we visit is in daylight.
  sunDir.copy(camPos).sub(CENTER).normalize().addScaledVector(camRight.setFromMatrixColumn(camera.matrixWorld, 0), 1.5).addScaledVector(camUp, 1.1).normalize();
  sun.position.copy(CENTER).addScaledVector(sunDir, 50);
  dayFill.intensity = .45 * day;
  sky.material.uniforms.uDay.value = day;
  fog.color.copy(PALETTE.horizon).lerp(PALETTE.dayHorizon, day);
  fog.density = lerp(.0075, .0022, day);
  renderer.toneMappingExposure = lerp(.95, 1, day);
  gtao.enabled = day > .5;
  // By day bright walls would all bloom into a milky haze; keep bloom for the glowing cloud at night.
  bloom.strength = lerp(.3, .06, day);
  bloom.threshold = lerp(1.0, 1.6, day);
  // The cloud, its sea and the dust belong above the clouds; below they only add haze.
  cloud.group.visible = sea.mesh.visible = motes.mesh.visible = day < .99;
  // The veil peaks as the camera passes through the cloud layer.
  grade.uniforms.uVeil.value = Math.exp(-Math.pow((camera.position.y + 7) / 3.2, 2)) * .9;

  cloud.group.rotation.y = Math.sin(t * .11) * .12;
  cloud.update(explode, t, still ? undefined : lean);
  sea.update(t, 1 - explode * .7);
  motes.update(t, renderer.getPixelRatio());
  if (planet) {
    planet.update(t);
    for (const tile of tiles) {
      // Module tiles drop in from the sky once morning comes, then hover over their business, facing the camera.
      const u = tile.userData, land = smooth(.55, 1, day);
      // Off to the left of the building, in the open sky above the chapter heading.
      tile.position.copy(u.rest).addScaledVector(camRight, -3.4 * Math.min(1, camera.aspect)).addScaledVector(u.up, (1 - land) * 30 + Math.sin(t * 1.1 + tile.id) * .15);
      tile.quaternion.copy(camera.quaternion);
      tile.visible = land > .01;
    }
  }
  showOverlay(overlayKey, overlayAmt);
  grade.uniforms.uTime.value = t % 10;
  composer.render();
});
