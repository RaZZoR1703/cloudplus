import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const smooth = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;

const WARM = new THREE.Color('#ffb070');
const NOON = new THREE.Color('#fff4e6');
const MOON = new THREE.Color('#9db6ff');
const FOG_DAY = new THREE.Color('#cfdcea');
const FOG_NIGHT = new THREE.Color('#0a1b33');
const SKY_DAY = new THREE.Color('#cfe4ff');
const SKY_NIGHT = new THREE.Color('#1a3a6e');
const GROUND_DAY = new THREE.Color('#6b6458');
const GROUND_NIGHT = new THREE.Color('#0b1424');

/**
 * Sky, sun/moon and ambient light driven by one time-of-day value t in [0, 1):
 * 0 midnight, .25 sunrise, .5 noon, .75 sunset.
 */
export function createLighting(renderer, scene, { radius = 100 } = {}) {
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = 3.5;
  u.rayleigh.value = 1.1;
  u.mieCoefficient.value = .004;
  u.mieDirectionalG.value = .86;
  u.cloudCoverage.value = .32;
  scene.add(sky);

  // Second sky (same uniforms) rendered into the environment map.
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.material.uniforms = u;
  envSky.scale.setScalar(1000);
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;

  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.castShadow = true;
  const cam = light.shadow.camera;
  cam.left = cam.bottom = -radius;
  cam.right = cam.top = radius;
  cam.near = 1;
  cam.far = radius * 4;
  light.shadow.bias = -.0003;
  light.shadow.normalBias = .04;
  scene.add(light, light.target);

  const hemi = new THREE.HemisphereLight(SKY_DAY, GROUND_DAY, .6);
  scene.add(hemi);

  // Fog only softens the world beyond the diorama, never the city itself.
  scene.fog = new THREE.Fog(FOG_DAY.clone(), 650, 2400);

  const stars = makeStars();
  scene.add(stars);

  // Static shadows: re-render the shadow map only when the light has moved enough.
  renderer.shadowMap.autoUpdate = false;
  const lastShadowDir = new THREE.Vector3();
  let lastEnvT = -1;

  const sunDir = new THREE.Vector3();
  const lightDir = new THREE.Vector3();
  const state = { day: 1, night: 0, elevation: 0 };

  function update(t) {
    const a = (t - .25) * Math.PI * 2;
    // The arc runs behind the city as seen from the default camera, so shadows fall towards the viewer.
    sunDir.set(Math.cos(a), Math.sin(a) * .85, -(Math.sin(a) * .25 + .5)).normalize();
    u.sunPosition.value.copy(sunDir);

    const elev = sunDir.y;
    const day = smooth(elev, -.12, .22);
    state.day = day;
    state.night = 1 - day;
    state.elevation = elev;

    // One directional light: the sun by day, the moon (mirrored arc) by night.
    // Intensities cross zero at the horizon, so the swap is invisible.
    if (elev >= 0) {
      lightDir.copy(sunDir);
      light.intensity = 3.4 * smooth(elev, 0, .18);
      light.color.copy(WARM).lerp(NOON, smooth(elev, .05, .45));
    } else {
      lightDir.set(-sunDir.x, -sunDir.y, sunDir.z).normalize();
      light.intensity = .45 * smooth(-elev, 0, .2);
      light.color.copy(MOON);
    }
    light.position.copy(lightDir).multiplyScalar(radius * 2);
    light.castShadow = light.intensity > .02;

    hemi.intensity = lerp(.45, .25, day);
    hemi.color.copy(SKY_NIGHT).lerp(SKY_DAY, day);
    hemi.groundColor.copy(GROUND_NIGHT).lerp(GROUND_DAY, day);

    scene.fog.color.copy(FOG_NIGHT).lerp(FOG_DAY, day);
    // The Sky shader outputs physically bright radiance, so its env map needs a small multiplier.
    scene.environmentIntensity = lerp(.04, .12, day);
    renderer.toneMappingExposure = lerp(.75, 1, day);
    stars.material.opacity = smooth(state.night, .55, 1);
    stars.visible = stars.material.opacity > 0;

    if (lightDir.angleTo(lastShadowDir) > .004 && light.castShadow) {
      renderer.shadowMap.needsUpdate = true;
      lastShadowDir.copy(lightDir);
    }

    // Rebuilding the env map costs a few ms, so only do it every ~1.5% of a day.
    if (Math.abs(t - lastEnvT) > .015) {
      lastEnvT = t;
      envTarget?.dispose();
      u.showSunDisc.value = 0;   // the disc would dominate reflections; the directional light covers it
      envTarget = pmrem.fromScene(envScene, 0, .1, 2000);
      u.showSunDisc.value = 1;
      scene.environment = envTarget.texture;
    }
    return state;
  }

  function setShadowSize(size) {
    if (light.shadow.mapSize.x === size) return;
    light.shadow.mapSize.set(size, size);
    light.shadow.map?.dispose();
    light.shadow.map = null;
    renderer.shadowMap.needsUpdate = true;
  }

  return { update, setShadowSize, state, sky };
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
  const mat = new THREE.PointsMaterial({
    color: 0xdfe9ff, size: 1.6, sizeAttenuation: false,
    transparent: true, depthWrite: false, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}
