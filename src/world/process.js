import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeGlass, createScreen, screenBase, tileGeometry, UI, BLUE, SOFT } from './blockCloud.js';

// One line of goods through four businesses: the factory makes a batch, the warehouse stores it,
// the distributor delivers it, the shop sells it, and the shop's sale orders the next batch.
// Figures are illustrative.
export const CHAPTERS = [
  { key: 'production', name: 'Производство', steps: [['Заказ', 'от сети · 1 200 шт'], ['План цеха', 'линия 2 · смена 1'], ['Партия №148', '1 200 шт'], ['Контроль', 'брак 0,4%'], ['Готово', 'передано на склад']] },
  { key: 'warehouse', name: 'Склад', steps: [['Приёмка', '24 паллеты'], ['Размещение', 'ряд B · ячейка 14'], ['Хранение', '1 236 шт'], ['Отбор', 'задание №5214'], ['Отгрузка', 'машина 01 A 777']] },
  { key: 'distribution', name: 'Дистрибуция', steps: [['Заявки', '12 точек'], ['Маршрут', '3 машины · 86 км'], ['В пути', 'прибытие 14:20'], ['Доставлено', 'накладная подписана'], ['Оплата', 'поступила']] },
  { key: 'retail', name: 'Розничная сеть', steps: [['Поступление', 'магазин №7'], ['На полке', '48 шт'], ['Касса', '312 чеков'], ['Остаток', 'списан сам'], ['Автозаказ', 'ушёл в цех']] },
];
export const STEPS = CHAPTERS.length * 5;
const STATUS = { wait: ['ожидает', 'rgba(150,190,240,.18)', SOFT], work: ['в работе', BLUE, '#fff'], done: ['готово', 'rgba(63,169,245,.22)', BLUE] };

function drawNode(x, chapter, [title, detail], state) {
  screenBase(x, chapter);
  x.fillStyle = '#fff'; x.font = '600 62px Onest, Geist, sans-serif';
  x.fillText(title, 52, 220);
  x.fillStyle = SOFT; x.font = UI;
  x.fillText(detail, 52, 290);
  const [label, bg, ink] = STATUS[state];
  x.font = '600 34px Onest, Geist, sans-serif';
  const w = x.measureText(label).width + 56;
  x.fillStyle = bg;
  x.beginPath(); x.roundRect(52, 380, w, 66, 33); x.fill();
  x.fillStyle = ink;
  x.fillText(label, 80, 425);
  return state;
}

const clamp01 = v => Math.min(1, Math.max(0, v));

/**
 * The process line: twenty glass screens, one per step, joined by a track of small glass blocks.
 * A glowing parcel travels along it. update(s, time, reveal): s = the parcel's place in steps
 * (0 … STEPS-1), reveal = how much of the line has assembled (0 … 1).
 */
export function createProcessLine() {
  const group = new THREE.Group();
  const points = [];
  for (let i = 0; i < STEPS; i++)
    points.push(new THREE.Vector3(i * 4.2 + Math.floor(i / 5) * 2.6, Math.sin(i * .3) * .4, Math.sin(i * .55) * 1.6));
  const curve = new THREE.CatmullRomCurve3(points);

  // Track: small blocks every ~0.42 units; t is each block's place on the curve.
  const track = [];
  const length = curve.getLength();
  for (let d = 0; d < length; d += .42) {
    const u = d / length, t = curve.getUtoTmapping(u);
    track.push({ t, at: curve.getPoint(t), turn: (Math.sin(d * 7.1) * .5) * .2 });
  }
  const glass = makeGlass();
  const geometry = new RoundedBoxGeometry(1, 1, 1, 3, .16);
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(track.length), 1);
  geometry.setAttribute('aGlow', glow);
  const mesh = new THREE.InstancedMesh(geometry, glass, track.length);
  group.add(mesh);

  // Steps: a glass slab with a live screen, standing over the track.
  const tileGlass = makeGlass();
  tileGlass.onBeforeCompile = () => {};
  tileGlass.color.set('#f2f8ff');
  const nodes = points.map((p, i) => {
    const chapter = CHAPTERS[Math.floor(i / 5)], step = chapter.steps[i % 5];
    let state = 'wait';
    const screen = createScreen(x => drawNode(x, chapter.name, step, state));
    const tile = new THREE.Mesh(tileGeometry, tileGlass);
    tile.add(screen.mesh);
    tile.position.copy(p).add(new THREE.Vector3(0, 1.25, 0));
    tile.scale.setScalar(1.45);
    group.add(tile);
    screen.draw(0);
    return { tile, screen, setState(s) { if (s !== state) { state = s; screen.draw(0); } }, base: tile.position.clone() };
  });

  // The parcel: a small block of lit glass that carries the order down the line.
  const parcel = new THREE.Mesh(new RoundedBoxGeometry(.5, .5, .5, 4, .12), new THREE.MeshPhysicalMaterial({
    color: '#bfe3ff', emissive: BLUE, emissiveIntensity: 1.6, roughness: .3, clearcoat: 1,
  }));
  const lamp = new THREE.PointLight(BLUE, 6, 5, 1.6);
  parcel.add(lamp);
  group.add(parcel);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), pos = new THREE.Vector3();
  const last = STEPS - 1;

  function update(s, time, reveal = 1) {
    s = Math.min(last, Math.max(0, s));
    track.forEach((b, i) => {
      // The line assembles from its start; each block drops into place.
      const a = clamp01((reveal * 1.25 - b.t) * 6), ease = 1 - (1 - a) ** 3;
      const behind = s - b.t * last;
      glow.setX(i, behind >= 0 ? .1 + Math.exp(-behind * 1.4) * .9 : 0);
      pos.copy(b.at);
      pos.y += (1 - ease) * 3;
      e.set(0, b.turn + (1 - ease) * 2, 0);
      mesh.setMatrixAt(i, m4.compose(pos, q.setFromEuler(e), s3.setScalar(.3 * ease)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    glow.needsUpdate = true;

    nodes.forEach((n, i) => {
      n.setState(s >= i + .05 ? 'done' : s > i - .7 ? 'work' : 'wait');
      const a = clamp01((reveal * 1.25 - i / last) * 6);
      // The active step lifts a little towards the viewer.
      const lift = Math.exp(-((s - i) ** 2) * 2);
      n.tile.position.copy(n.base);
      n.tile.position.y += (1 - a) * 4 + lift * .25 + Math.sin(time * .8 + i) * .04;
      n.tile.position.z += lift * .5;
      n.tile.scale.setScalar(1.45 * a * (1 + lift * .08));
      n.screen.mesh.material.opacity = a * (.55 + .45 * Math.max(lift, s >= i ? .7 : 0));
    });

    curve.getPoint(s / last, parcel.position);
    parcel.position.y += .45 + Math.sin(time * 2) * .05;
    parcel.rotation.set(time * .4, time * .6, 0);
    parcel.visible = reveal > .2;
  }

  return { group, update, curve, last };
}
