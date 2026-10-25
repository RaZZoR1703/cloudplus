import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The city page lives at /city/, its assets at the site root.
const BASE = "../assets/";

export const manager = new THREE.LoadingManager();
const gltfLoader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
const textureLoader = new THREE.TextureLoader(manager);
const hdrLoader = new HDRLoader(manager);

export const loadHdr = name => hdrLoader.loadAsync(`${BASE}hdri/${name}.hdr`);

/**
 * Copy of a geometry with plain float attributes. Meshopt files store quantized,
 * normalized ints (-1..1); baking a transform into those would clamp it.
 */
export function bakedGeometry(geometry, matrix, keep = ['position', 'normal', 'uv']) {
  const geo = new THREE.BufferGeometry();
  for (const key of keep) {
    const a = geometry.attributes[key];
    if (!a) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++)
      for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    geo.setAttribute(key, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (geometry.index) geo.setIndex(geometry.index.clone());
  return geo.applyMatrix4(matrix);
}

/**
 * A model flattened into one entry per material: { geometry (in model space), material }.
 * Lets us draw every copy of a model with one InstancedMesh per material.
 */
export async function loadModelParts(name) {
  const gltf = await gltfLoader.loadAsync(`${BASE}models/${name}.glb`);
  gltf.scene.updateMatrixWorld(true);
  const byMaterial = new Map();
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    const geo = bakedGeometry(o.geometry, o.matrixWorld);
    const list = byMaterial.get(o.material) ?? [];
    list.push(geo);
    byMaterial.set(o.material, list);
  });
  return [...byMaterial].map(([material, geos]) => ({
    material,
    geometry: geos.length === 1 ? geos[0] : mergeGeometries(geos),
  }));
}

const textureCache = new Map();
function texture(file, srgb) {
  if (!textureCache.has(file)) {
    const t = textureLoader.load(`${BASE}tex/${file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(file, t);
  }
  return textureCache.get(file);
}

/** PBR material from a Poly Haven set: colour, normal and packed AO/roughness/metal map. */
export function pbrMaterial(name, params = {}) {
  const orm = texture(`${name}_orm.webp`);
  return new THREE.MeshStandardMaterial({
    map: texture(`${name}_color.webp`, true),
    normalMap: texture(`${name}_normal.webp`),
    roughnessMap: orm,
    aoMap: orm,
    aoMapIntensity: .8,
    metalness: 0,
    ...params,
  });
}

/** Places copies of model parts: one InstancedMesh per material. */
export function instances(parts, matrices, { cast = true, receive = true } = {}) {
  const group = new THREE.Group();
  if (!matrices.length) return group;
  for (const { geometry, material } of parts) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/** Matrix from position, rotation around Y and uniform (or xyz) scale. */
export function place(x, y, z, ry = 0, s = 1) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromAxisAngle(_up, ry),
    typeof s === 'number' ? _s.setScalar(s) : _s.set(...s));
}
