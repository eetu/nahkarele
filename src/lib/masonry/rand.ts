// Randomness for the masonry module: a stream for what is decided in order, and a smooth
// wander for joints, both from the seed.

import { hash } from "$lib/scene/pixel";

/** mulberry32: a stream of floats in [0, 1) from a seed. */
export const stream = (seed: number) => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

/** Value noise in [-1, 1] along `t`, eased between whole steps: one line per `salt`. */
export const wander = (t: number, seed: number, salt: number) => {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(seed, salt, i);
  const b = hash(seed, salt, i + 1);
  return (a + (b - a) * u) * 2 - 1;
};
