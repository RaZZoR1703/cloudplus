import * as THREE from 'three';

// Shared by every facade material so they compile to a single program.
export const nightUniform = { value: 0 };

/**
 * MeshStandardMaterial with procedural windows on vertical faces, laid out in
 * world space so window size stays constant across instanced boxes of any scale.
 * By night a random subset of windows glows warm.
 */
export function facadeMaterial(params = {}) {
  const mat = new THREE.MeshStandardMaterial({ roughness: .78, metalness: .05, ...params });
  mat.onBeforeCompile = shader => {
    shader.uniforms.uNight = nightUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFPos;\nvarying vec3 vFNorm;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        mat4 fModel = modelMatrix;
        #ifdef USE_INSTANCING
          fModel = modelMatrix * instanceMatrix;
        #endif
        vFPos = (fModel * vec4(transformed, 1.0)).xyz;
        vFNorm = normalize(mat3(fModel) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight;
        varying vec3 vFPos;
        varying vec3 vFNorm;
        float fWin = 0.0;
        float fLit = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 n = normalize(vFNorm);
          float wall = 1.0 - step(0.5, abs(n.y));
          float u = abs(n.z) > 0.5 ? vFPos.x : vFPos.z;
          // Ribbon windows: a glass band per floor, split by thin mullions every 3.6 m.
          vec2 g = vec2(u / 3.6, (vFPos.y - 0.6) / 3.4);
          vec2 f = fract(g);
          vec2 aa = fwidth(g) * 1.5;
          float wx = smoothstep(0.04, 0.04 + aa.x, f.x) * (1.0 - smoothstep(0.96 - aa.x, 0.96, f.x));
          float wy = smoothstep(0.34, 0.34 + aa.y, f.y) * (1.0 - smoothstep(0.86 - aa.y, 0.86, f.y));
          fWin = wall * wx * wy * step(2.2, vFPos.y);
          vec2 id = floor(g) + floor(vFPos.xz / 9.0) * 17.0;
          fLit = step(0.62, fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.24, 0.33), fWin * 0.85);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, fWin);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * 1.3 * fWin * fLit * uNight;`);
  };
  mat.customProgramCacheKey = () => 'facade';
  return mat;
}
