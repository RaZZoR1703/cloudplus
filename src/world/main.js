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

gsap.registerPlugin(ScrollTrigger);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = innerWidth < 820;

// ---------- Renderer, scene, camera ----------
const canvas = document.querySelector('#world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.6));
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = .95;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(PALETTE.horizon, .0075);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
scene.environmentIntensity = .5;
const camera = new THREE.PerspectiveCamera(small ? 46 : 34, 1, .1, 900);

const sky = createSky();
const sea = createCloudSea();
const motes = createMotes(small ? 350 : 700);
const cloud = createBlockCloud();
scene.add(sky, sea.mesh, motes.mesh, cloud.group);
const moon = new THREE.DirectionalLight('#c7dcff', 1.6);
moon.position.set(-6, 9, 6);
scene.add(moon, new THREE.HemisphereLight('#4a6a96', '#0b1220', .6));

// ---------- Post: bloom, then a film grade (vignette + grain), then tone mapping ----------
const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .5, .45, .8);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float v = smoothstep(1.15, .35, length((vUv - .5) * vec2(1.25, 1.)));
      c.rgb *= mix(.55, 1., v);
      c.rgb += (h(vUv * 1000.) - .5) * .016;
      gl_FragColor = c;
    }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  // Keep the whole cloud in frame on narrow screens.
  camera.fov = w / h < 1 ? 58 : small ? 46 : 34;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- Scroll and pointer ----------
if (!still) {
  const lenis = new Lenis({ lerp: .085 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
const state = { explode: 0, pull: 0 };
gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom bottom', scrub: still ? true : .8 } })
  .to(state, { pull: 1, duration: .45, ease: 'power1.inOut' }, 0)
  .to(state, { explode: 1, duration: .55, ease: 'power2.in' }, .45)
  .to('.hero-copy', { opacity: 0, filter: 'blur(10px)', duration: .2 }, .35);

const pointer = { x: 0, y: 0 }, lean = { x: 0, y: 0 };
addEventListener('pointermove', e => { pointer.x = e.clientX / innerWidth - .5; pointer.y = e.clientY / innerHeight - .5; });

// Intro: the copy settles in once the first frame is up.
gsap.fromTo('.hero-copy > *', { opacity: 0, y: 26, filter: 'blur(10px)' },
  { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.4, stagger: .14, ease: 'expo.out', delay: .4 });

// ---------- Loop ----------
const look = new THREE.Vector3();
gsap.ticker.add(time => {
  const t = still ? 0 : time;
  lean.x += (pointer.x - lean.x) * .04;
  lean.y += (pointer.y - lean.y) * .04;
  // A slow orbit, a gentle push in, then a pull back as the blocks fly apart.
  const orbit = Math.sin(t * .07) * .22 + lean.x * .35;
  const dist = (small ? 14 : 13) + state.pull * 4 + state.explode * 6;
  camera.position.set(Math.sin(orbit) * dist, .9 + lean.y * -.8 + state.pull * 1.2, Math.cos(orbit) * dist);
  look.set(small ? 0 : -2.3, .15 - state.explode * 1.2, 0);
  camera.lookAt(look);
  cloud.group.rotation.y = Math.sin(t * .11) * .12;
  cloud.update(state.explode, t);
  sea.update(t, 1 - state.explode * .7);
  motes.update(t, renderer.getPixelRatio());
  grade.uniforms.uTime.value = t % 10;
  composer.render();
});
