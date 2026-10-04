// Reading a baked ruin at any moment, forwards or backwards: what has gone by then, what still
// stands, how what stands stands, what is about to go. One ruin is kept, for the last spec and
// seed asked for.

import { PACE, type Pace } from "./decay";
import { classify, type State } from "./stability";
import { bake, type Ruin } from "./timeline";
import { BASE, insertOf, type Spec } from "./types";

let slot: { spec: Spec; seed: number; pace: Pace; ruin: Ruin } | null = null;

/** The ruin of `spec` for `seed`, baked once and kept. */
export const ruinOf = (spec: Spec, seed: number, pace: Pace = PACE) => {
  if (slot?.spec === spec && slot.seed === seed && slot.pace === pace) return slot.ruin;
  const ruin = bake(spec, seed, pace);
  slot = { spec, seed, pace, ruin };
  return ruin;
};

/** Drop the kept ruin (for tests). */
export const forget = () => {
  slot = null;
};

/** How many releases have happened by `t`. */
export const releasedBy = (r: Ruin, t: number) => {
  let lo = 0;
  let hi = r.releases.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r.releases[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

export const stands = (r: Ruin, i: number, t: number) => r.releaseAt[i] > t;
export const insertIn = (r: Ruin, k: number, t: number) => r.insertAt[k] > t;
export const hangOn = (r: Ruin, name: string, t: number) => (r.hangAt[name] ?? Infinity) > t;

/** What stands at `t`, and which inserts are in. */
export const stateAt = (r: Ruin, t: number): State => ({
  standing: Uint8Array.from(r.releaseAt, (a) => (a > t ? 1 : 0)),
  inserts: Uint8Array.from(r.insertAt, (a) => (a > t ? 1 : 0)),
});

/** How each block stands at `t`, or how it is failing. */
export const classesAt = (r: Ruin, t: number) => classify(r.bond, stateAt(r, t), r.pace.glue);

/**
 * The highest row something climbing column `x` from the wall's foot can reach on its way up
 * to `y`, at `t`: up for as long as the wall stands there, stopped by a gap or an opening.
 */
export const climb = (r: Ruin, x: number, y: number, t: number) => {
  const { owner, spec } = r.bond;
  for (let row = spec.h - 1; row >= Math.max(0, y); row--) {
    const o = owner[row * spec.w + x];
    if (o < 0 || r.releaseAt[o] <= t) return row + 1;
  }
  return y;
};

/** Blocks standing at `t` on nothing at all, and not about to go within the second: none, if
 *  the bake is right. */
export const hanging = (r: Ruin, t: number) =>
  r.bond.blocks.filter((b) => {
    if (r.releaseAt[b.i] <= t + 1) return false;
    return !b.bed.some((c) => {
      if (c.j === BASE) return true;
      const k = insertOf(c.j);
      return k >= 0 ? r.insertAt[k] > t : r.releaseAt[c.j] > t;
    });
  }).length;

/** How long before working loose a block shows a crack, and for how long it shakes, s. */
export const CRACK_S = 3;
export const SHAKE_S = 0.3;

/** Blocks about to work loose at `t`: cracked, and in their last moment shaking. */
export const warningAt = (r: Ruin, t: number) => {
  const out: { i: number; shake: boolean }[] = [];
  for (let k = releasedBy(r, t); k < r.releases.length; k++) {
    const rel = r.releases[k];
    if (rel.t > t + CRACK_S) break;
    if (rel.kind === "knock" || rel.kind === "drop") continue;
    out.push({ i: rel.i, shake: rel.t - t < SHAKE_S });
  }
  return out;
};
