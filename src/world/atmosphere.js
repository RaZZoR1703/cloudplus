import * as THREE from 'three';

// Shared GLSL value noise + fbm.
const NOISE = `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
  float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 6; i++){ v += a * noise(p); p = p * 2.02 + 17.; a *= .5; } return v; }`;

export const PALETTE = {
  zenith: new THREE.Color('#03060d'),
  horizon: new THREE.Color('#1a2a40'),
  glow: new THREE.Color('#5d86b8'),
  // Below the clouds: an early-morning sky, cool above, peach at the horizon.
  dayZenith: new THREE.Color('#6fa3d6'),
  dayHorizon: new THREE.Color('#d6e7f5'),
  dayGlow: new THREE.Color('#ffd7b0'),
};

/** Night sky with a soft glow behind the cloud and sparse stars. */
export function createSky() {
  return new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uZenith: { value: PALETTE.zenith }, uHorizon: { value: PALETTE.horizon }, uGlow: { value: PALETTE.glow },
      uDZenith: { value: PALETTE.dayZenith }, uDHorizon: { value: PALETTE.dayHorizon }, uDGlow: { value: PALETTE.dayGlow }, uDay: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 uZenith, uHorizon, uGlow, uDZenith, uDHorizon, uDGlow; uniform float uDay; varying vec3 vDir; ${NOISE}
      void main(){
        // By day the camera circles a planet and looks down as often as up, so the blue wraps both ways.
        float h = clamp(mix(vDir.y, abs(vDir.y), uDay) * 2.2 + .15, 0., 1.);
        vec3 zen = mix(uZenith, uDZenith, uDay), hor = mix(uHorizon, uDHorizon, uDay), glo = mix(uGlow, uDGlow, uDay);
        vec3 c = mix(hor, zen, pow(h, .7));
        // A wide glow low in the sky behind the cloud (the sunrise, below the clouds).
        float g = exp(-pow(atan(vDir.x, -vDir.z) * 1.4, 2.)) * exp(-pow((vDir.y - .02) * 5., 2.));
        c += glo * g * mix(.35, .6, uDay);
        // Stars: tiny, sparse, only high up.
        vec2 sp = vDir.xz / (vDir.y + 1.2) * 320.;
        // Round, sub-cell stars instead of whole grid cells.
        float st = step(.9975, hash(floor(sp))) * smoothstep(.12, .0, length(fract(sp) - .5)) * smoothstep(.15, .5, vDir.y) * (1. - uDay);
        c += st * .55;
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
}

/** An endless sea of clouds below, drifting slowly, lit from above by the block cloud. */
export function createCloudSea() {
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uHorizon: { value: PALETTE.horizon }, uLight: { value: new THREE.Color('#9cc8f2') }, uLift: { value: 1 } },
    vertexShader: 'varying vec3 vPos; void main(){ vPos = (modelMatrix * vec4(position,1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vPos,1.); }',
    fragmentShader: `uniform float uTime, uLift; uniform vec3 uHorizon, uLight; varying vec3 vPos; ${NOISE}
      void main(){
        vec2 p = vPos.xz * .045 + vec2(uTime * .006, uTime * .003);
        float n = fbm(p) * .65 + fbm(p * 2.7 - uTime * .01) * .35;
        float tops = smoothstep(.42, .72, n);
        // Light pooled under the block cloud, falling off with distance.
        float d = length(vPos.xz - vec2(0., -1.));
        float pool = exp(-d * d * .0025) * uLift;
        vec3 base = mix(vec3(.025, .04, .07), uHorizon * 1.25, tops);
        vec3 c = base + uLight * tops * pool * .7;
        // Fade into the horizon haze far away.
        float far = smoothstep(40., 220., length(vPos.xz));
        c = mix(c, uHorizon, far);
        gl_FragColor = vec4(c, mix(.98, 0., smoothstep(230., 330., length(vPos.xz))));
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 1, 1).rotateX(-Math.PI / 2), material);
  sea.position.y = -7;
  return { mesh: sea, update(time, lift) { material.uniforms.uTime.value = time; material.uniforms.uLift.value = lift; } };
}

/** Slow dust motes in the air around the cloud, catching the light. */
export function createMotes(count = 700) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  let s = 5;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    pos.set([(r() - .5) * 26, (r() - .5) * 12, (r() - .5) * 18 - 2], i * 3);
    seed[i] = r();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: `uniform float uTime, uPixel; attribute float aSeed; varying float vA;
      void main(){ vec3 p = position; p.y += sin(uTime * .2 + aSeed * 30.) * .4; p.x += cos(uTime * .15 + aSeed * 20.) * .3;
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.2 + aSeed * 2.4) * uPixel * (14. / -mv.z);
        vA = (.25 + .75 * aSeed) * smoothstep(40., 6., -mv.z); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(vec3(.75,.88,1.), vA * smoothstep(.5, 0., d) * .5); }`,
  });
  const points = new THREE.Points(geo, material);
  return { mesh: points, update(time, pixel) { material.uniforms.uTime.value = time; material.uniforms.uPixel.value = pixel; } };
}
