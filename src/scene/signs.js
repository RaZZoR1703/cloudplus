import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ROW = 96, SIZE = 2048;   // 21 sign rows

/**
 * All shop signs share one canvas atlas and one merged mesh: one draw call in total.
 * Usage: const signs = createSigns(); signs.add(text, style, matrix, height); scene.add(signs.build());
 */
export async function createSigns() {
  await document.fonts.load('600 80px Onest').catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const rows = new Map();
  const geos = [];

  function row(text, { bg = '#0f1b2b', fg = '#ffffff', font = '600 58px Onest, system-ui, sans-serif' } = {}) {
    const key = `${text}|${bg}|${fg}`;
    if (rows.has(key)) return rows.get(key);
    const i = rows.size;
    if (i >= SIZE / ROW) throw new Error('sign atlas is full');
    ctx.font = font;
    const width = Math.min(SIZE, Math.ceil(ctx.measureText(text).width) + 72);
    const y = i * ROW;
    ctx.fillStyle = bg;
    ctx.fillRect(0, y, width, ROW);
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, y + ROW / 2 + 3);
    const r = { u0: 0, u1: width / SIZE, v0: 1 - (y + ROW) / SIZE, v1: 1 - y / SIZE, aspect: width / ROW };
    rows.set(key, r);
    return r;
  }

  return {
    /** Adds a sign of the given height (m); its width follows the text. Returns the width. */
    add(text, style, matrix, height = 1) {
      const r = row(text, style);
      const w = height * r.aspect;
      const geo = new THREE.PlaneGeometry(w, height);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++)
        uv.setXY(k, uv.getX(k) ? r.u1 : r.u0, uv.getY(k) ? r.v1 : r.v0);
      geos.push(geo.applyMatrix4(matrix));
      return w;
    },
    build() {
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const material = new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: .1, roughness: .45,
      });
      const mesh = new THREE.Mesh(mergeGeometries(geos), material);
      mesh.receiveShadow = true;
      return mesh;
    },
  };
}
