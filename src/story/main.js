import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { Film } from './frames.js';
import { createLogo3D } from './logo3d.js';

gsap.registerPlugin(ScrollTrigger);

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = innerWidth < 820 || navigator.connection?.saveData;
const clamp01 = v => Math.min(1, Math.max(0, v));

// Smooth scrolling drives ScrollTrigger; skipped when the visitor asks for less motion.
if (!still) {
  const lenis = new Lenis({ lerp: .09 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

// ---------- The mark: hovers over the city in the hero and again in the finale ----------
const logo = createLogo3D(document.querySelector('#logo3d'), { still });
const marks = { hero: 0, finale: 0 };
ScrollTrigger.create({ trigger: '.hero', start: 'top top', end: 'bottom top', onUpdate: s => { marks.hero = s.progress; } });
ScrollTrigger.create({ trigger: '.finale', start: 'top bottom', end: 'bottom bottom', onUpdate: s => { marks.finale = s.progress; } });
gsap.ticker.add(time => {
  if (marks.hero < 1) logo.place(.5, .3 - marks.hero * .3, small ? .32 : .48, clamp01(1 - marks.hero * 1.6));
  else logo.place(.5, small ? .24 : .26, small ? .3 : .42, clamp01((marks.finale - .35) / .3));
  logo.render(time * 1000);
});
gsap.fromTo('.hero-copy > *', { opacity: 0, y: 24, filter: 'blur(8px)' },
  { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.2, stagger: .12, ease: 'expo.out', delay: .2 });

// ---------- The thread: words light up as you read down ----------
const line = document.querySelector('[data-words]');
line.innerHTML = line.innerHTML.split(/(\s+)/).map(p => /\s/.test(p) || !p ? p : `<span class="w">${p}</span>`).join('');
const words = [...line.querySelectorAll('.w')];
ScrollTrigger.create({
  trigger: '.thread', start: 'top 60%', end: 'bottom 70%',
  onUpdate: s => words.forEach((w, i) => w.classList.toggle('on', i < s.progress * words.length * 1.15)),
});

// ---------- Chapters ----------
const CLIPS = {
  production: { clips: [{ name: 'roast', count: 135 }, { name: 'pack', count: 120 }] },
  warehouse: { clips: [{ name: 'forklift', count: 135 }, { name: 'van', count: 90 }], focus: .45 },
  cafe: { clips: [{ name: 'espresso', count: 80 }, { name: 'pay', count: 135 }], focus: .6 },
  store: { clips: [{ name: 'store', count: 108 }] },
};
const films = [];

for (const section of document.querySelectorAll('.chapter')) {
  const cfg = CLIPS[section.dataset.chapter];
  const film = new Film(section.querySelector('.film'), cfg.clips, { step: small ? 2 : 1, focus: cfg.focus ?? .5 });
  films.push(film);
  // Start loading a chapter's frames a couple of screens before it arrives.
  ScrollTrigger.create({ trigger: section, start: 'top 300%', onEnter: () => film.load() });

  const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: still ? true : .6 } });
  const clock = { p: 0 };
  tl.to(clock, { p: 1, duration: 1, onUpdate: () => film.seek(clock.p) }, 0);

  const name = section.querySelector('.chapter-name');
  tl.fromTo(name, { opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(10px)', duration: .05 }, .1);

  for (const beat of section.querySelectorAll('.beat')) {
    const [a, b] = beat.dataset.at.split('-').map(Number);
    const say = beat.querySelector('.say'), ui = beat.querySelector('.ui');
    tl.set(beat, { opacity: 1 }, 0);
    tl.fromTo(say, { opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0px)', duration: .035, ease: 'power3.out' }, a);
    tl.fromTo(ui, { opacity: 0, xPercent: small ? 0 : 6, yPercent: small ? 6 : -50 }, { opacity: 1, xPercent: 0, yPercent: small ? 0 : -50, duration: .05, ease: 'expo.out' }, a + .015);
    tl.to([say, ui], { opacity: 0, filter: 'blur(10px)', duration: .03, ease: 'power2.in' }, b);

    // The UI acts while its beat plays: bars fill, numbers count, routes draw, orders arrive.
    const span = b - a - .1;
    beat.querySelectorAll('[data-fill]').forEach(el => tl.fromTo(el, { scaleX: 0 }, { scaleX: 1, duration: span }, a + .05));
    beat.querySelectorAll('[data-drain]').forEach(el => tl.fromTo(el, { scaleX: 1, backgroundColor: '#4ADE80' }, { scaleX: 2 / 12, backgroundColor: '#F0A03C', duration: span * .5 }, a + .04));
    beat.querySelectorAll('[data-count]').forEach(el => {
      const [from, to] = el.dataset.count.split('-').map(Number);
      const suffix = el.textContent;
      const n = { v: from };
      const show = () => { el.textContent = Math.round(n.v).toLocaleString('ru-RU') + suffix; };
      show();
      tl.fromTo(n, { v: from }, { v: to, duration: span * .6, onUpdate: show }, a + .06);
    });
    beat.querySelectorAll('[data-draw]').forEach(el => {
      const len = el.getTotalLength();
      tl.fromTo(el, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: span }, a + .04);
    });
    beat.querySelectorAll('[data-late]').forEach(el => tl.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .03, ease: 'expo.out' }, a + span * .6));
    beat.querySelectorAll('[data-swap]').forEach(el => {
      const [first, second] = el.dataset.swap.split('|');
      const flip = { v: 0 };
      tl.fromTo(flip, { v: 0 }, { v: 1, duration: .001, onUpdate: () => {
        const done = flip.v >= 1;
        el.textContent = done ? second : first;
        el.classList.toggle('ok', done);
        el.classList.toggle('info', !done);
      } }, a + span * .85);
    });
  }
}
// The first chapter's frames start right away, behind the hero.
films[0]?.load();
addEventListener('resize', () => films.forEach(f => f.resize()));

// ---------- One program: the four businesses fold into one window ----------
const one = gsap.timeline({ defaults: { ease: 'power2.inOut' }, scrollTrigger: { trigger: '.one', start: 'top top', end: 'bottom bottom', scrub: still ? true : .6 } });
one.fromTo('.one-title, .one-copy', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .12, ease: 'expo.out' }, 0);
one.fromTo('.app', { opacity: 0, scale: .92 }, { opacity: 1, scale: 1, duration: .15 }, .05);
['production', 'warehouse', 'cafe', 'store'].forEach((key, i) => {
  const at = .22 + i * .15;
  one.fromTo(`[data-tile="${key}"]`, { opacity: 1, scale: 1, x: 0, y: 0 },
    { opacity: 0, scale: .3, x: () => tileShift(key).x, y: () => tileShift(key).y, duration: .14 }, at);
  one.fromTo(`.app-side [data-mod="${key}"]`, { backgroundColor: 'rgba(63,169,245,0)', color: '#C9D2DC' },
    { backgroundColor: 'rgba(63,169,245,.18)', color: '#FFFFFF', duration: .04 }, at + .12);
});
/** How far a tile must travel to land on the app window's centre. */
function tileShift(key) {
  const t = document.querySelector(`[data-tile="${key}"]`).getBoundingClientRect();
  const a = document.querySelector('.app').getBoundingClientRect();
  return { x: a.left + a.width / 2 - (t.left + t.width / 2), y: a.top + a.height / 2 - (t.top + t.height / 2) };
}

// ---------- Terms and finale ----------
gsap.utils.toArray('.terms li').forEach(li => gsap.fromTo(li, { opacity: 0, y: 40 },
  { opacity: 1, y: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: li, start: 'top 85%' } }));
gsap.fromTo('.finale-copy > *', { opacity: 0, y: 30, filter: 'blur(8px)' },
  { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, stagger: .15, ease: 'expo.out', scrollTrigger: { trigger: '.finale', start: 'top 20%' } });
