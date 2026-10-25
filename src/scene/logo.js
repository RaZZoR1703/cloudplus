import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import outlines from '../data/logo-outlines.json';

// Same typeface the v8 presentation used, served by jsDelivr.
const FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json';
const BRAND = new THREE.Color('#3fa9f5');

function smoothPath(points, Cls) {
  const pts = points.map(p => new THREE.Vector3(p[0], p[1], 0));
  if (pts[0].distanceTo(pts.at(-1)) < 1e-4) pts.pop();
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const s = curve.getPoints(Math.max(200, pts.length * 5));
  const path = new Cls();
  path.moveTo(s[0].x, s[0].y);
  for (let i = 1; i < s.length; i++) path.lineTo(s[i].x, s[i].y);
  path.closePath();
  return path;
}

/** The Cloudplus cloud emblem (vector outline from the v8 presentation), centred, ~6.8 m wide. */
function emblemGeometry(depth) {
  const shapes = outlines.map(o => {
    const shape = smoothPath(o.outer, THREE.Shape);
    for (const h of o.holes) shape.holes.push(smoothPath(h, THREE.Path));
    return shape;
  });
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth, steps: 1, bevelEnabled: true, bevelSize: .02, bevelThickness: .03, bevelSegments: 4, curveSegments: 24,
  });
  geo.center();
  return geo;
}

/**
 * The hero sign: emblem above "CLOUD PLUS" in polished metal. The letter sides
 * are halo-lit in brand blue at night. Returns { group, update(night) }.
 */
export async function createLogo() {
  const group = new THREE.Group();
  const face = new THREE.MeshPhysicalMaterial({
    color: '#eef3f7', metalness: .9, roughness: .26, clearcoat: .8, clearcoatRoughness: .1,
  });
  const side = new THREE.MeshStandardMaterial({
    color: '#26323e', metalness: .7, roughness: .35, emissive: BRAND, emissiveIntensity: 0,
  });

  const emblem = new THREE.Mesh(emblemGeometry(.9), [face, side]);
  emblem.position.y = 9.4;
  emblem.scale.setScalar(1.25);
  emblem.castShadow = true;
  group.add(emblem);

  let title;
  try {
    const font = await new FontLoader().loadAsync(FONT_URL);
    const geo = new TextGeometry('CLOUD PLUS', {
      font, size: 3.4, depth: 1.1, curveSegments: 6,
      bevelEnabled: true, bevelSize: .04, bevelThickness: .06, bevelSegments: 2,
    });
    geo.center();
    title = new THREE.Mesh(geo, [face, side]);
  } catch {
    // Offline or blocked CDN: a flat plate keeps the composition intact.
    title = new THREE.Mesh(new THREE.BoxGeometry(27, 3.4, .6), face);
  }
  title.position.y = 3.6;
  title.castShadow = true;
  group.add(title);

  // Soft blue glow behind the letters, visible only at night.
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(256, 128, 10, 256, 128, 256);
    g.addColorStop(0, 'rgba(63,169,245,0.9)');
    g.addColorStop(.5, 'rgba(11,58,140,0.35)');
    g.addColorStop(1, 'rgba(11,58,140,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 512, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(44, 22), new THREE.MeshBasicMaterial({
    map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  glow.position.set(0, 6.5, -2.2);
  group.add(glow);

  function update(night) {
    side.emissiveIntensity = 1.4 * night;
    glow.material.opacity = .35 * night;
  }
  return { group, update };
}

export { emblemGeometry };
