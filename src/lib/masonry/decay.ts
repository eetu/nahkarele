// How a ruin weathers. Each block has a threshold, drawn from the seed, and goes when the
// hazard it has gathered reaches it. The hazard is wear that grows with age (Weibull), plus
// the shock of each roof collapse near it (a few loose blocks before, more after, dying away),
// times how exposed the block is: its top free, a neighbour gone, hanging over an edge,
// sheltered low in the wall. Exposure changes only when something falls, so between events a
// block's hazard is a known function of time, and when it goes can be found exactly.

import { hash } from "$lib/scene/pixel";

import { stream } from "./rand";
import type { Class, State } from "./stability";
import { type Bond, insertOf, type Knock, type Spec } from "./types";

export type Pace = {
  /** Wear: Weibull scale, s, and shape (above 1, a wall wears faster the older it gets). */
  eta: number;
  beta: number;
  /** How hard the wall is to loosen, from its top course to its foot, spread over however
   *  many courses it has. */
  resist: number[];
  /** Exposure, as multipliers on the hazard: top free, a neighbour gone, bed under 60% of it,
   *  glued over an edge, pinned under an arch, and (instead of all those) fully confined. */
  free: number;
  open: number;
  undercut: number;
  glued: number;
  pinned: number;
  confined: number;
  cap: number;
  /** The share of the wall's foot (its lowest seventh), and of the seventh above, that
   *  stands for good. */
  sound: [number, number];
  /** Collapses at the blast (from, to), then how many more and how far apart at first, s. */
  first: [number, number];
  collapses: number;
  gap: number;
  /** How far down from the wall's top a collapse can knock pieces off, px. */
  bite: number;
  /** A collapse's shock, after (strength, s to fade) and before it (strength, s, lead time),
   *  and how far it reaches, px. */
  after: [number, number];
  before: [number, number, number];
  reach: number;
  /** How much of a block's way to going the blast takes it, at the collapses. */
  blast: number;
  /** How far past its bed mortar holds a block, px. */
  glue: number;
  /** The heap: how far into the room it reaches, px; the steepest it stands (rise over run);
   *  how much of a landing's speed is kept, up and along; when and how long a piece takes to
   *  sink into the ground, s. */
  runout: number;
  repose: number;
  bounce: [number, number];
  sink: [number, number];
};

export const PACE: Pace = {
  eta: 48000,
  beta: 1.6,
  resist: [1, 0.55, 0.35, 0.22, 0.14, 0.09, 0.06],
  free: 3,
  open: 2,
  undercut: 2,
  glued: 4,
  pinned: 3,
  confined: 0.05,
  cap: 12,
  sound: [0.5, 0.25],
  first: [2, 3],
  collapses: 10,
  gap: 600,
  bite: 42,
  after: [0.01, 20],
  before: [0.05, 5, 120],
  reach: 40,
  blast: 0.15,
  glue: 3,
  runout: 28,
  repose: 0.84,
  bounce: [0.3, 0.4],
  sink: [600, 3000],
};

/** More roof coming down: when, where along the wall, how wide and how deep (px) a bite it
 *  takes, and which way it pushes the wall's top (1 into the room). */
export type Collapse = { t: number; x: number; w: number; depth: number; dir: 1 | -1 };

/** The collapses, fixed from the seed before anything else happens: some at the blast, then
 *  ever further apart, one in five a big one; and any given as input. */
export const scheduleOf = (spec: Spec, seed: number, pace: Pace, knocks: Knock[] = []) => {
  const rand = stream(seed ^ 0x5c0ff);
  const W = spec.w;
  const out: Collapse[] = [];
  const [lo, hi] = pace.first;
  const first = lo + Math.floor(rand() * (hi - lo + 1));
  for (let n = 0; n < first; n++) {
    out.push({
      t: 0.4 + rand() * 2.6,
      x: 20 + rand() * (W - 40),
      w: 26 + rand() * 26,
      depth: 10,
      dir: rand() < 0.7 ? 1 : -1,
    });
  }
  // A roof comes down in its first years: ever further apart, until there is none left.
  let t = 0;
  for (let n = 0; n < pace.collapses; n++) {
    t += pace.gap * (1 + n / 2) * (0.5 + rand());
    const big = rand() < 0.2;
    out.push({
      t,
      x: 20 + rand() * (W - 40),
      w: big ? 60 + rand() * 30 : 20 + rand() * 30,
      depth: big ? 24 : 10,
      dir: rand() < 0.7 ? 1 : -1,
    });
  }
  for (const k of knocks) {
    if (k.kind === "roof") out.push({ t: k.t, x: k.x, w: 52, depth: 28, dir: 1 });
  }
  return out.sort((a, b) => a.t - b.t || a.x - b.x);
};

/** Wear gathered from 0 to `t`. */
export const wearOf = (t: number, pace: Pace) => (t <= 0 ? 0 : (t / pace.eta) ** pace.beta);

/** A collapse's shock gathered from long before it to `t`: rising toward it (but not at the
 *  blast, which comes without warning), then dying away. */
export const shockOf = (c: Collapse, t: number, pace: Pace) => {
  const [ka, ca] = pace.after;
  const [kb0, cb, lead] = pace.before;
  const kb = c.t > lead ? kb0 : 0;
  if (t < c.t - lead) return 0;
  if (t < c.t) return kb * Math.log((lead + cb) / (c.t - t + cb));
  return kb * Math.log((lead + cb) / cb) + ka * Math.log(1 + (t - c.t) / ca);
};

/** How strongly a collapse shakes a block: falling off with distance from where it hit, along
 *  the wall and down from the top. */
export const reachOf = (c: Collapse, cx: number, cy: number, pace: Pace) =>
  Math.exp(-Math.hypot(Math.max(0, Math.abs(cx - c.x) - c.w / 2), cy * 0.5) / pace.reach);

/** Which pieces stand for good: the sound part of the wall's foot. */
export const soundOf = (bond: Bond, seed: number, pace: Pace) => {
  const h = bond.spec.h;
  return Uint8Array.from(bond.blocks, (b) => {
    const low = b.cy > h - h / 7;
    const share = low ? pace.sound[0] : b.cy > h - (2 * h) / 7 ? pace.sound[1] : 0;
    return hash(seed, b.i, 32) < share ? 1 : 0;
  });
};

/** How hard a piece in `course` of `nc` is to loosen: `resist` spread over the courses. */
const resistOf = (resist: number[], course: number, nc: number) => {
  const at = (nc > 1 ? course / (nc - 1) : 0) * (resist.length - 1);
  const k = Math.min(resist.length - 2, Math.floor(at));
  return resist[k] + (resist[k + 1] - resist[k]) * (at - k);
};

/** How exposed block `i` is in `state`: the multiplier on its hazard. */
export const exposureOf = (
  bond: Bond,
  i: number,
  state: State,
  classes: (Class | undefined)[],
  pace: Pace,
) => {
  const b = bond.blocks[i];
  const cls = classes[i];
  let m = resistOf(pace.resist, b.course, bond.edges.length - 1);
  const isIn = (j: number) => {
    const k = insertOf(j);
    return j >= 0 ? state.standing[j] === 1 : k >= 0 ? state.inserts[k] === 1 : true;
  };
  let covered = 0;
  for (const c of b.top) if (state.standing[c.j]) covered += c.n;
  for (const c of b.caps) if (isIn(c.j)) covered += c.n;
  let bedded = 0;
  for (const c of b.bed) if (isIn(c.j)) bedded += c.n;
  const free = b.course === 0 || covered < 0.5 * b.w;
  const open = b.heads.some((c) => !isIn(c.j));
  const undercut = cls === "bedded" && bedded < 0.6 * b.w;
  if (free) m *= pace.free;
  if (open) m *= pace.open;
  if (undercut) m *= pace.undercut;
  if (cls === "glued") m *= pace.glued;
  if (cls === "pinned") m *= pace.pinned;
  if (!free && !open && !undercut && cls === "bedded") m *= pace.confined;
  return Math.min(m, pace.cap);
};
