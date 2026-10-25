import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { manager, loadHdr } from './assets.js';
import { createLighting } from './scene/lighting.js';
import { createCity } from './scene/city.js';
import { createTraffic } from './scene/traffic.js';
import { createTour } from './tour.js';
import { createQuality, TIERS } from './quality.js';

const DAY_SECONDS = 180;   // one full day-night cycle, about two camera loops

const $ = id => document.getElementById(id);
const canvas = $('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, .3, 5000);

manager.onProgress = (url, loaded, total) => {
  $('loading').textContent = `Загрузка сцены… ${Math.round(loaded / total * 100)}%`;
};

const [dayHdr, nightHdr] = await Promise.all([loadHdr('wide_street_01'), loadHdr('shanghai_bund')]);
const lighting = createLighting(renderer, scene, { day: dayHdr, night: nightHdr });
const city = await createCity(scene);
const traffic = await createTraffic(scene);
const tour = createTour();

// Bloom is only used after dusk; by day we render straight to the screen.
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, .35, 1);   // threshold 1: only bright lights glow
composer.addPass(bloom);
composer.addPass(new OutputPass());

let tierSettings = TIERS[1];
const quality = createQuality(tier => {
  tierSettings = tier;
  renderer.setPixelRatio(Math.min(devicePixelRatio, tier.dpr));
  composer.setPixelRatio(renderer.getPixelRatio());
  lighting.setShadowSize(tier.shadow);
  resize();
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// Free camera: orbit around whatever the tour was looking at.
const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
controls.enableDamping = true;
controls.maxPolarAngle = 1.52;
controls.minDistance = 4;
controls.maxDistance = 400;

let mode = 'tour', tourTime = 0, blend = 1, playing = true;
let t = Number($('timeOfDay').value);
const tourPos = new THREE.Vector3(), tourLook = new THREE.Vector3();
const fromPos = new THREE.Vector3(), fromLook = new THREE.Vector3(), look = new THREE.Vector3();
const focus = new THREE.Vector3(), forward = new THREE.Vector3();

$('mode').onclick = () => {
  if (mode === 'tour') {
    mode = 'free';
    controls.target.copy(look);
    controls.enabled = true;
    $('mode').textContent = 'Пролёт';
  } else {
    mode = 'tour';
    controls.enabled = false;
    fromPos.copy(camera.position);
    fromLook.copy(controls.target);
    blend = 0;
    $('mode').textContent = 'Свободная камера';
  }
};
$('play').onclick = () => {
  playing = !playing;
  $('play').textContent = playing ? 'Пауза' : 'Пуск';
};
$('timeOfDay').oninput = e => { t = Number(e.target.value); };
$('quality').onchange = e => quality.set(e.target.value);

// UI clock changes every 5 scene minutes; skip DOM writes in between.
let shownStep = -1;
function updateClock() {
  const s = Math.floor(t * 288);
  if (s === shownStep) return;
  shownStep = s;
  const minutes = s * 5;
  $('clock').textContent = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  if (playing) $('timeOfDay').value = t;
}

// Performance overlay, only with ?debug in the URL.
const hud = $('hud');
const debug = new URLSearchParams(location.search).has('debug');
hud.hidden = !debug;
renderer.info.autoReset = !debug;
let hudFrames = 0, hudTime = 0;
function updateHud(dt) {
  if (!debug) return;
  hudFrames++;
  hudTime += dt;
  if (hudTime < .5) return;
  const info = renderer.info;
  hud.textContent =
    `${Math.round(hudFrames / hudTime)} FPS · ${(hudTime / hudFrames * 1000).toFixed(1)} мс\n` +
    `вызовов: ${Math.round(info.render.calls / hudFrames)}\n` +
    `треугольников: ${Math.round(info.render.triangles / hudFrames / 1000)}k\n` +
    `DPR ${renderer.getPixelRatio().toFixed(2)} · ${TIERS[quality.tier].name}${quality.auto ? ' (авто)' : ''}`;
  hudFrames = hudTime = 0;
  info.reset();
}

function step(dt) {
  if (playing) t = (t + dt / DAY_SECONDS) % 1;
  updateClock();

  if (mode === 'tour') {
    tourTime += dt;
    tour.sample(tourTime, tourPos, tourLook);
    if (blend < 1) {
      blend = Math.min(1, blend + dt / 2.5);
      const e = blend * blend * (3 - 2 * blend);
      camera.position.lerpVectors(fromPos, tourPos, e);
      look.lerpVectors(fromLook, tourLook, e);
    } else {
      camera.position.copy(tourPos);
      look.copy(tourLook);
    }
    camera.lookAt(look);
  } else {
    controls.update(dt);
    look.copy(controls.target);
  }

  // Shadows cover a 140 m square just ahead of the camera.
  camera.getWorldDirection(forward);
  focus.copy(camera.position).addScaledVector(forward.setY(0).normalize(), 40).setY(0);
  const light = lighting.update(t, focus);
  city.update(light);
  traffic.update(dt, light.night);
  bloom.strength = .35 * light.night;
}

// Compile the bloom path up front so the first dusk does not stall.
step(0);
composer.render();

function render(dt) {
  if (tierSettings.bloom && bloom.strength > .03) composer.render(dt);
  else renderer.render(scene, camera);
}

const timer = new THREE.Timer();
timer.connect(document);   // no huge delta after the tab was hidden
const loop = time => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), .1);
  step(dt);
  render(dt);
  quality.sample(dt);
  updateHud(dt);
};
renderer.setAnimationLoop(loop);

$('loading').classList.add('done');
// Dev only: freeze the loop and render one exact frame (time of day, tour time) for screenshots.
if (import.meta.env.DEV) window.__cp = {
  THREE, scene, renderer, camera,
  frame(timeOfDay, tourSeconds) {
    renderer.setAnimationLoop(null);
    t = timeOfDay;
    tourTime = tourSeconds;
    playing = false;
    step(0);
    render(0);
    return canvas.toDataURL('image/jpeg', .85);   // read back in the same task, before the buffer clears
  },
  resume() { playing = true; renderer.setAnimationLoop(loop); },
  tourDuration: tour.duration,
};
