import * as THREE from 'three';

// Shared by every facade so they all react to nightfall at once.
export const nightUniform = { value: 0 };

/**
 * Adds procedural windows to a PBR wall material. Windows are laid out in world
 * space on vertical faces: a reflective glass pane with a dark reveal by day,
 * and a warm (sometimes cool) lit interior by night.
 *
 * opts.floor   floor height, m            opts.bay    window spacing, m
 * opts.win     [x0, x1, y0, y1] window rectangle within a bay/floor cell (0..1)
 * opts.ground  height of a ground-floor shopfront band (0 = none)
 * opts.curtain true for full-height glass with thin mullions (office towers)
 * opts.lit     share of windows lit at night
 */
export function withWindows(material, opts = {}) {
  const o = { floor: 3.4, bay: 3, win: [.22, .78, .3, .82], ground: 0, curtain: false, lit: .32, ...opts };
  const uniforms = {
    uNight: nightUniform,
    uFloor: { value: o.floor },
    uBay: { value: o.bay },
    uWin: { value: new THREE.Vector4(...(o.curtain ? [.03, .97, .06, .97] : o.win)) },
    uGround: { value: o.ground },
    uLit: { value: o.lit },
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
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
        uniform float uNight, uFloor, uBay, uGround, uLit;
        uniform vec4 uWin;
        varying vec3 vFPos;
        varying vec3 vFNorm;
        float fWin = 0.0, fRev = 0.0, fLit = 0.0, fShop = 0.0, fHue = 0.0;
        float fHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float fRect(vec2 f, vec4 r, vec2 aa) {
          return smoothstep(r.x, r.x + aa.x, f.x) * (1.0 - smoothstep(r.y - aa.x, r.y, f.x))
               * smoothstep(r.z, r.z + aa.y, f.y) * (1.0 - smoothstep(r.w - aa.y, r.w, f.y));
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 n = normalize(vFNorm);
          float wall = 1.0 - step(0.5, abs(n.y));
          float u = abs(n.z) > 0.5 ? vFPos.x : vFPos.z;
          if (uGround > 0.0 && vFPos.y < uGround) {
            // Shopfront: tall glazing split by mullions every 4.2 m, above a low stone base.
            vec2 g = vec2(u / 4.2, vFPos.y / uGround);
            vec2 aa = fwidth(g) * 1.5;
            fWin = wall * fRect(fract(g), vec4(.04, .96, .1, .86), aa);
            fRev = wall * fRect(fract(g), vec4(.02, .98, .08, .88), aa) - fWin;
            fShop = 1.0;
            fLit = 1.0;
            fHue = fHash(floor(vec2(u / 12.0, 3.0)));
          } else {
            vec2 g = vec2(u / uBay, (vFPos.y - uGround) / uFloor);
            vec2 aa = fwidth(g) * 1.5;
            vec2 f = fract(g);
            fWin = wall * fRect(f, uWin, aa);
            fRev = wall * fRect(f, uWin + vec4(-.05, .05, -.05, .04), aa) - fWin;
            vec2 id = floor(g) + floor(vFPos.xz / 7.0) * 13.0;
            fLit = step(1.0 - uLit, fHash(id));
            fHue = fHash(id + 7.0);
          }
          // Light window frames, and glass whose tint varies a little per pane (blinds, interiors).
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.78, 0.76), fRev * 0.75);
          vec3 glass = mix(vec3(0.09, 0.13, 0.17), vec3(0.24, 0.27, 0.29), fHue * fHue);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, fWin);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.08, fWin);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.6, fWin);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(mix(normal, nonPerturbedNormal, fWin + fRev));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 warm = vec3(1.0, 0.7, 0.42), cool = vec3(0.72, 0.84, 1.0);
          vec3 tint = mix(warm, cool, step(0.78, fHue));
          float strength = mix(0.35 + fHue * 0.35, 1.0, fShop);
          // Shops keep a little interior light by day too.
          totalEmissiveRadiance += tint * strength * fWin * fLit * max(uNight, fShop * 0.04);
        }`);
  };
  material.customProgramCacheKey = () => 'facade';
  return material;
}
