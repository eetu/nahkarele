// Pixel helpers for every scene: one rect, a stable hash, easing.

/**
 * A unit hash of a few integers: the same every frame, so nothing reshuffles on redraw. FNV to
 * combine, then murmur3's finaliser to mix: without it, consecutive inputs (flake 0, 1, 2…)
 * land in near-even steps, and whatever they place lines up in streaks.
 */
export const hash = (...n: number[]): number => {
  let h = 2166136261;
  for (const v of n) h = Math.imul(h ^ (v | 0), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** A filled rect on whole scene pixels: a pixel by default. */
export const rect = (
  ctx: CanvasRenderingContext2D,
  c: string,
  x: number,
  y: number,
  w = 1,
  h = 1,
) => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/** 0 before `a`, 1 after `b`, linear between. */
export const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
