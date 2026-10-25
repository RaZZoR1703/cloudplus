import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createLighting } from './scene/lighting.js';
import { createCity } from './scene/city.js';
import { createQuality, TIERS } from './quality.js';

const DAY_SECONDS = 70;   // one full day-night loop

const $ = id => document.getElementById(id);
const canvas = $('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 5, 5000);
camera.position.set(175, 140, 195);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 6, 0);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = .35;
controls.minDistance = 60;
controls.maxDistance = 520;
controls.maxPolarAngle = 1.38;
controls.addEventListener('start', () => { controls.autoRotate = false; });

const city = createCity(scene);
const lighting = createLighting(renderer, scene, { radius: city.radius + 6 });

// Post-processing is only used for night-time bloom; by day we render directly.
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, .4, 1);   // threshold 1: only emissive glows
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

// UI: play/pause, time of day, quality.
let t = Number($('timeOfDay').value), playing = true;
$('play').onclick = () => {
  playing = !playing;
  $('play').textContent = playing ? 'Пауза' : 'Пуск';
  $('play').setAttribute('aria-pressed', playing);
};
$('timeOfDay').oninput = e => { t = Number(e.target.value); };
$('quality').onchange = e => quality.set(e.target.value);

const hud = $('hud');
let hudFrames = 0, hudTime = 0;
function updateHud(dt) {
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

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .1);
  if (playing) {
    t = (t + dt / DAY_SECONDS) % 1;
    $('timeOfDay').value = t;
  }
  const minutes = Math.floor(t * 24 * 60);
  $('clock').textContent = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

  const light = lighting.update(t);
  city.update(dt, light);
  controls.update(dt);

  bloom.strength = .55 * light.night;
  if (tierSettings.bloom && light.night > .05) composer.render(dt);
  else renderer.render(scene, camera);

  quality.sample(dt);
  updateHud(dt);
});

$('loading').classList.add('done');
if (import.meta.env.DEV) window.__cp = { THREE, scene, renderer, camera, lighting, city };
