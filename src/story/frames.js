// A chapter's film: still frames (webp) drawn to a canvas, picked by scroll progress.
// Frames load on demand, chapter by chapter; until a frame arrives the nearest loaded one is shown.

const BASE = './frames/';

export class Film {
  /**
   * clips: [{ name, count }] played back to back. step: load every n-th frame (2 on phones).
   * focus: horizontal focus (0..1) used when the frame is cropped to cover the canvas.
   */
  constructor(canvas, clips, { step = 1, focus = .5 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.focus = focus;
    this.urls = [];
    for (const { name, count } of clips)
      for (let i = 1; i <= count; i += step) this.urls.push(`${BASE}${name}/${String(i).padStart(4, '0')}.webp`);
    this.images = new Array(this.urls.length);
    this.current = -1;
    this.wanted = 0;
    this.loading = null;
    this.resize();
  }

  get length() { return this.urls.length; }

  /** Starts loading every frame (first frame first, then in order), 6 at a time. */
  load() {
    if (this.loading) return this.loading;
    let next = 0;
    const one = () => {
      if (next >= this.urls.length) return Promise.resolve();
      const i = next++;
      const img = new Image();
      img.decoding = 'async';
      img.src = this.urls[i];
      return img.decode().catch(() => {}).then(() => {
        this.images[i] = img;
        if (Math.abs(i - this.wanted) < 2 || this.current < 0) this.draw(this.wanted, true);
        return one();
      });
    };
    this.loading = Promise.all(Array.from({ length: 6 }, one));
    return this.loading;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.current = -1;
      this.draw(this.wanted, true);
    }
  }

  /** Shows the frame at progress p in [0, 1]. */
  seek(p) {
    this.draw(Math.round(Math.min(1, Math.max(0, p)) * (this.urls.length - 1)));
  }

  draw(index, force = false) {
    this.wanted = index;
    // Nearest frame that has arrived, searching outwards.
    let img = null, k = index;
    for (let d = 0; d < this.images.length && !img; d++) {
      if (this.images[index - d]) { img = this.images[index - d]; k = index - d; }
      else if (this.images[index + d]) { img = this.images[index + d]; k = index + d; }
    }
    if (!img || (k === this.current && !force)) return;
    this.current = k;
    const { width: cw, height: ch } = this.canvas;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    this.ctx.drawImage(img, (cw - w) * this.focus, (ch - h) / 2, w, h);
  }
}
