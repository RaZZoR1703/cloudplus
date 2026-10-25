// Quality tiers. Auto mode starts at "balanced" and steps down while FPS stays low.
export const TIERS = [
  { name: 'экономное', dpr: 1, shadow: 1024, bloom: false },
  { name: 'сбалансированное', dpr: 1.5, shadow: 2048, bloom: true },
  { name: 'высокое', dpr: 2, shadow: 4096, bloom: true },
];

export function createQuality(apply) {
  let tier = 1, auto = true;
  let frames = 0, elapsed = 0, slowWindows = 0, cooldown = 0;
  apply(TIERS[tier]);

  return {
    get tier() { return tier; },
    get auto() { return auto; },
    set(value) {
      auto = value === 'auto';
      if (!auto) tier = Number(value);
      apply(TIERS[tier]);
    },
    // Called every frame; looks at 2-second windows to decide on a downgrade.
    sample(dt) {
      frames++;
      elapsed += dt;
      if (elapsed < 2) return;
      const fps = frames / elapsed;
      frames = elapsed = 0;
      if (cooldown > 0) { cooldown--; return; }
      slowWindows = fps < 50 ? slowWindows + 1 : 0;
      if (auto && slowWindows >= 2 && tier > 0) {
        tier--;
        slowWindows = 0;
        cooldown = 2;   // let the new tier settle before judging again
        apply(TIERS[tier]);
      }
    },
  };
}
