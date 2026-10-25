import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const smooth = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;

const WARM = new THREE.Color('#ffb070');
const NOON = new THREE.Color('#fff4e6');
const MOON = new THREE.Color('#9db6ff');
const FOG_DAY = new THREE.Color('#c9d6e3');
const FOG_DUSK = new THREE.Color('#d9a98a');
const FOG_NIGHT = new THREE.Color('#0a1626');

/**
 * Sky, sun/moon and image-based light, driven by one time-of-day value t in [0, 1):
 * 0 midnight, .25 sunrise, .5 noon, .75 sunset.
 * Reflections and ambient light come from two real HDR panoramas (day street, night
 * city) blended by time of day; the visible sky is the procedural Sky shader.
 */
export function createLighting(renderer, scene, { day: dayHdr, night: nightHdr }) {
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = 4;
  u.rayleigh.value = 1.2;
  u.mieCoefficient.value = .004;
  u.mieDirectionalG.value = .86;
  u.cloudCoverage.value = .3;
  scene.add(sky);

  // Environment: a sphere painted with both panoramas, rendered into a PMREM now and then.
  const envUniforms = {
    uDay: { value: dayHdr }, uNight: { value: nightHdr },
    uMix: { value: 0 }, uDayGain: { value: 1 }, uNightGain: { value: .5 },
  };
  const envSphere = new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: envUniforms,
    vertexShader: `varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D uDay, uNight; uniform float uMix, uDayGain, uNightGain; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
        vec3 c = mix(texture2D(uDay, uv).rgb * uDayGain, texture2D(uNight, uv).rgb * uNightGain, uMix);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  const envScene = new THREE.Scene();
  envScene.add(envSphere);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null, lastEnvT = -1;

  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.castShadow = true;   // never toggled: that would recompile every material
  const cam = light.shadow.camera;
  cam.left = cam.bottom = -70;
  cam.right = cam.top = 70;
  cam.near = 1;
  cam.far = 500;
  light.shadow.bias = -.0004;
  light.shadow.normalBias = .05;
  scene.add(light, light.target);

  const hemi = new THREE.HemisphereLight('#cfe0ff', '#5b554c', .3);
  scene.add(hemi);

  scene.fog = new THREE.Fog(FOG_DAY.clone(), 120, 620);
  const stars = makeStars();
  scene.add(stars);

  const sunDir = new THREE.Vector3(), lightDir = new THREE.Vector3();
  const state = { day: 1, night: 0 };

  /** focus: point the shadow map is centred on (in front of the camera). */
  function update(t, focus) {
    const a = (t - .25) * Math.PI * 2;
    // Sun arcs over the south (+z) side so the logo and north-side shopfronts are front-lit.
    sunDir.set(Math.cos(a) * .9, Math.sin(a) * .8, Math.sin(a) * .35 + .45).normalize();
    u.sunPosition.value.copy(sunDir);

    const elev = sunDir.y;
    const day = smooth(elev, -.1, .2);
    state.day = day;
    state.night = 1 - day;

    // One directional light: sun by day, moon (mirrored arc) by night; both are ~0 at the horizon.
    if (elev >= 0) {
      lightDir.copy(sunDir);
      light.intensity = 3.2 * smooth(elev, 0, .2);
      light.color.copy(WARM).lerp(NOON, smooth(elev, .05, .45));
    } else {
      lightDir.set(-sunDir.x, -sunDir.y, sunDir.z).normalize();
      light.intensity = .35 * smooth(-elev, 0, .2);
      light.color.copy(MOON);
    }
    light.target.position.copy(focus);
    light.position.copy(focus).addScaledVector(lightDir, 250);

    hemi.intensity = lerp(.25, .2, day);
    const dusk = smooth(elev, -.08, .02) * (1 - smooth(elev, .05, .25));
    scene.fog.color.copy(FOG_NIGHT).lerp(FOG_DAY, day).lerp(FOG_DUSK, dusk * .6);
    // Clearer air at night so lit windows don't turn into haze; still thick enough by 700 m to hide street ends.
    scene.fog.near = lerp(220, 120, day);
    scene.fog.far = lerp(700, 620, day);
    renderer.toneMappingExposure = lerp(.9, 1, day);
    stars.material.opacity = smooth(state.night, .55, 1);

    envUniforms.uMix.value = smooth(state.night, .2, .8);
    envUniforms.uDayGain.value = lerp(.08, 1, day);
    // Rebuilding the env map costs a few ms, so only do it every ~1% of a day.
    if (Math.abs(t - lastEnvT) > .01) {
      lastEnvT = t;
      envTarget?.dispose();
      envTarget = pmrem.fromScene(envScene, 0, .1, 300);
      scene.environment = envTarget.texture;
    }
    return state;
  }

  function setShadowSize(size) {
    if (light.shadow.mapSize.x === size) return;
    light.shadow.mapSize.set(size, size);
    light.shadow.map?.dispose();
    light.shadow.map = null;
  }

  return { update, setShadowSize };
}

function makeStars(count = 1600) {
  const pos = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection();
    v.y = Math.abs(v.y) * .9 + .1;
    v.normalize().multiplyScalar(1800);
    v.toArray(pos, i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xdfe9ff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false,
  }));
  points.frustumCulled = false;
  return points;
}
