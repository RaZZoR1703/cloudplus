import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { emblemGeometry } from '../scene/logo.js';

/**
 * The Cloudplus mark in polished blue metal, on one fixed transparent canvas.
 * place(x, y, scale, opacity) positions it in viewport fractions; it hovers and leans
 * towards the pointer on its own.
 */
export function createLogo3D(canvas, { still = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  camera.position.set(0, 0, 14);

  const face = new THREE.MeshPhysicalMaterial({ color: '#56B7FA', metalness: .85, roughness: .22, clearcoat: 1, clearcoatRoughness: .08 });
  const side = new THREE.MeshPhysicalMaterial({ color: '#0B3A8C', metalness: .9, roughness: .3, emissive: '#1d6fd1', emissiveIntensity: .35 });
  const mark = new THREE.Mesh(emblemGeometry(.9), [face, side]);
  const pivot = new THREE.Group();
  pivot.add(mark);
  scene.add(pivot);
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(-4, 6, 8);
  const rim = new THREE.DirectionalLight('#9fd3ff', 3);
  rim.position.set(5, -2, -6);
  scene.add(key, rim);

  const pointer = { x: 0, y: 0 }, lean = { x: 0, y: 0 };
  addEventListener('pointermove', e => {
    pointer.x = e.clientX / innerWidth - .5;
    pointer.y = e.clientY / innerHeight - .5;
  });

  const state = { x: .5, y: .3, scale: 1, opacity: 1 };
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // World units visible at the mark's depth, to map viewport fractions to positions.
  const visible = () => {
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    return { w: h * camera.aspect, h };
  };

  function render(time) {
    canvas.style.opacity = state.opacity;
    if (state.opacity <= .01) return;
    const { w, h } = visible();
    const t = still ? 0 : time / 1000;
    lean.x += (pointer.x - lean.x) * .05;
    lean.y += (pointer.y - lean.y) * .05;
    pivot.position.set((state.x - .5) * w, (.5 - state.y) * h + Math.sin(t * .9) * .12, 0);
    // Smaller than the frame's short side; bigger screens get a bigger mark.
    pivot.scale.setScalar(state.scale * Math.min(1, w / 10));
    pivot.rotation.set(lean.y * .35, Math.sin(t * .5) * .12 + lean.x * .5, 0);
    renderer.render(scene, camera);
  }

  return {
    render,
    place(x, y, scale, opacity) { Object.assign(state, { x, y, scale, opacity }); },
  };
}
