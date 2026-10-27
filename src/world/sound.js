/**
 * Sound, made in the browser (no files to load): a soft pad, the cube's rush of air, a chime as each
 * business appears and a swell at the finale. Off until the visitor turns it on; browsers allow audio
 * only after a click anyway.
 */
export function createSound() {
  let ctx = null, master, rush, rushFilter, on = false;

  function start() {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Pad: an open chord of detuned triangles under a slowly breathing low-pass.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = .4;
    const pad = ctx.createGain();
    pad.gain.value = .035;
    lp.connect(pad).connect(master);
    for (const f of [110, 164.81, 246.94, 329.63]) for (const detune of [-5, 5]) {
      const o = ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = f; o.detune.value = detune;
      o.connect(lp); o.start();
    }
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = .05; depth.gain.value = 260;
    lfo.connect(depth).connect(lp.frequency); lfo.start();

    // Rush: looping noise through a band-pass; the cube's flight opens it.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    rushFilter = ctx.createBiquadFilter();
    rushFilter.type = 'bandpass'; rushFilter.Q.value = .9; rushFilter.frequency.value = 300;
    rush = ctx.createGain();
    rush.gain.value = 0;
    noise.connect(rushFilter).connect(rush).connect(master);
    noise.start();

    document.addEventListener('visibilitychange', () => { document.hidden ? ctx.suspend() : on && ctx.resume(); });
  }

  /** One soft sine note: quick attack, long fade. */
  function tone(freq, length, level, delay = 0) {
    const at = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + .02);
    g.gain.exponentialRampToValueAtTime(.0001, at + length);
    o.connect(g).connect(master);
    o.start(at); o.stop(at + length + .05);
  }
  const ready = () => on && ctx.state === 'running';

  return {
    get on() { return on; },
    toggle() {
      if (!ctx) start();
      on = !on;
      if (on) ctx.resume();
      master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, .25);
      return on;
    },
    /** Every frame: how visible the flying cube is (0 … 1). */
    update(carry) {
      if (!ready()) return;
      rush.gain.setTargetAtTime(carry * .22, ctx.currentTime, .12);
      rushFilter.frequency.setTargetAtTime(280 + carry * 900, ctx.currentTime, .12);
    },
    /** A business bursts out of the cube: note i of a pentatonic scale, with a quiet octave above. */
    chime(i) {
      if (!ready()) return;
      const f = [659.25, 739.99, 880, 987.77, 1108.73, 1318.51][i % 6];
      tone(f, 2.2, .06);
      tone(f * 2, 1.4, .018, .03);
    },
    /** The finale's flash: a slow open chord. */
    swell() {
      if (!ready()) return;
      [220, 329.63, 440, 554.37, 659.25].forEach((f, i) => tone(f, 4, .035, i * .06));
    },
    /** A module picked or dropped in the configurator. */
    tick(up) {
      if (ready()) tone(up ? 1318.51 : 987.77, .25, .04);
    },
  };
}
