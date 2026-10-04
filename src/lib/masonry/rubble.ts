// What comes off the wall, once it is off: every released block becomes a body with its whole
// motion worked out in phases, from leaving the wall to lying still on the heap (or to hitting
// the ground outside, out of sight). Two passes. Leaving the wall is worked out in the order
// pieces are let go: a piece waits on one still leaving from under it, lands on one still in
// the wall, and falls clear of the wall standing below. Coming down is worked out in the order
// things happen: each landing on the heap as it stands then, each piece laid on it when it
// comes to rest. Every landing is an impact; impacts close together are one thud.

import { hash } from "$lib/scene/pixel";

import type { Pace } from "./decay";
import {
  BOX_EDGES,
  cornersOf,
  DEPTH_SLOPE,
  halfDepth,
  halfHeight,
  intoWall,
  type Phase,
  phasePose,
  pivotOf,
  type Pose,
  poseAt,
  TURN_STEP,
  turnPoint,
  velocityAt,
} from "./fall";
import { breakOdds, fracture } from "./fracture";
import { heightOver, lay, type Lying, pileOf, restingPlace } from "./pile";
import type { Release } from "./timeline";
import { BASE, type Block, type Bond, insertOf } from "./types";

/** Something falling or fallen: a block, or (once broken) a piece of one. Its pixels are
 *  `mask`, `w` by `h`, whose centre the poses place; `T` is its thickness. */
export type Body = {
  id: number;
  block: number;
  mask: Uint8Array;
  w: number;
  h: number;
  T: number;
  n: number;
  /** Where its box was on the wall, and when it left. */
  ox: number;
  oy: number;
  start: number;
  phases: Phase[];
  /** When it first hit the ground; gone outside then, or at rest on the heap from `settled`. */
  lands: number;
  out: boolean;
  settled: number;
  lying: Lying | null;
  /** Broken where it landed (it goes then, its pieces carry on); for a piece, what it broke
   *  from, whether it is a chip, and which of its pixels are fresh break. */
  broken: boolean;
  parent: number | null;
  chip: boolean;
  fresh: Uint8Array | null;
};

/** A body hitting the ground: when, where (its lowest point, and its depth), how big a
 *  piece, from how high, outside or in. */
export type Impact = {
  t: number;
  x: number;
  y: number;
  z: number;
  n: number;
  fall: number;
  out: boolean;
};
/** What is heard: one or more impacts at once. */
export type Cue = { t: number; x: number; big: boolean };

type Fly = Extract<Phase, { k: "fly" }>;
type Ease = Extract<Phase, { k: "ease" }>;
type Box = { w: number; h: number; T: number };
type Vec = { x: number; y: number; z: number };

/** Impacts closer than this, s and px, are one thud. */
const TOGETHER: [number, number] = [0.06, 32];
/** Time steps for finding a landing, s, and the longest flight looked for. */
const STEP = 1 / 120;
const LONGEST = 6;
/** The first number a broken piece takes: past any wall's count of blocks. */
const PIECES = 1 << 20;
/** Pieces in the air overlapping by less than this, px, have not met. */
const SLACK = 0.5;
/** How many times a piece in the air is knocked by another, at most. */
const MEETS = 4;
/** A block let go after the one being worked out is taken to be in the wall this long, s: its
 *  own way out is not known yet. */
const SOON = 0.15;
/** Settling: a turn back waits this long after the landing, s (the blow stops it turning; then
 *  it falls flat); the last ease into place takes this long; rolling down the heap, px/s. */
const PAUSE = 0.12;
const SETTLE = 0.2;
const ROLL = 40;
/** The smallest piece that breaks landing, as a share of a whole block. */
const BREAKS = 60 / 364;

/** What of a block comes away: its own pixels less its mortar, which crumbles where it lay
 *  (all of them, if it is all mortar), as a mask over a box of its own. A brick carrying its
 *  joint falls with a strip of mortar down one side, which shows against the wall's bricks
 *  and is lost against its joints, by turns: the brick flickers all the way down. */
export const pieceOf = (bond: Bond, b: Block) => {
  const W = bond.spec.w;
  const solid = b.px.some((q) => !bond.joint[q]) ? b.px.filter((q) => !bond.joint[q]) : b.px;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const q of solid) {
    const x = q % W;
    const y = (q - x) / W;
    [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const mask = new Uint8Array(w * h);
  for (const q of solid) {
    const x = q % W;
    mask[((q - x) / W - y0) * w + (x - x0)] = 1;
  }
  return { x: x0, y: y0, w, h, n: solid.length, mask };
};

/** Where an angle `a`, turning the way `s` says (its sign), comes to rest among
 *  `base + k * PI`: on over the next one if it has turned more than `tip` past the last (its
 *  centre over the edge it came down on), else back to the last. Not turning, the nearest. */
const restAngle = (a: number, base: number, s: number, tip: number) => {
  const k = (a - base) / Math.PI;
  if (!s) return base + Math.PI * Math.round(k);
  const behind = base + Math.PI * (s > 0 ? Math.floor(k + 1e-9) : Math.ceil(k - 1e-9));
  return Math.abs(a - behind) > tip ? behind + s * Math.PI : behind;
};

/** The first of `base + k * PI` at or past `a`, turning the way `s` says. */
const aheadOf = (a: number, base: number, s: number) =>
  base +
  Math.PI *
    (s >= 0 ? Math.ceil((a - base) / Math.PI - 1e-9) : Math.floor((a - base) / Math.PI + 1e-9));

/** Whether going from angle `a` to `b`, turning the way `s` says, turns back across a step the
 *  drawing turns in. */
const turnsBack = (a: number, b: number, s: number, step: number) =>
  s !== 0 && (b - a) * s < 0 && Math.round(a / step) !== Math.round(b / step);

/** Bake every release into a body. */
export const bakeRubble = (
  bond: Bond,
  seed: number,
  pace: Pace,
  releases: Release[],
  releaseAt: Float64Array,
  insertAt: Float64Array,
) => {
  const { spec, owner, blocks } = bond;
  const W = spec.w;
  const T = spec.thickness;
  const g = spec.g ?? 392;
  const ground = spec.ground;
  const pile = pileOf(W, pace.runout, pace.sink, pace.repose);
  const bodies: Body[] = [];
  // Whole pieces are numbered as they are let go, broken ones from `PIECES` on as they break:
  // numbered after the whole ones, a piece's number (and what is hashed from it, the turn it
  // lands with) would change with every block let go after it, a tap included.
  let pieces = 0;
  const impacts: Impact[] = [];
  const whole = spec.unit * spec.course;

  // --- Leaving the wall, in the order pieces are let go ---------------------------------

  /** A piece let go and still within the wall's thickness: its columns, its top, the top of
   *  what it rests on; from when, until when it holds up what is on it, and until when it is in
   *  the way of what is under it. What rests on one waits for it to go; what falls onto one
   *  lands on it; what it rests on lets it go first. */
  type Stay = {
    x0: number;
    x1: number;
    top: number;
    rests: number;
    from: number;
    until: number;
    gone: number;
  };
  let stays: Stay[] = [];
  const baked = new Uint8Array(blocks.length);
  const inWall = (o: number, t: number) =>
    releaseAt[o] > t || (!baked[o] && releaseAt[o] + SOON > t);

  /** The top of what stands under columns `x0`..`x1` from row `y` down at `t`: the wall, an
   *  insert, or the base. */
  const standingUnder = (x0: number, x1: number, y: number, self: number, t: number) => {
    let sill = spec.h;
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.floor(x1)); x++) {
      for (let row = Math.max(0, Math.floor(y)); row < sill; row++) {
        const o = owner[row * W + x];
        const k =
          o < 0
            ? spec.inserts.findIndex(
                ({ rect: r }) => x >= r.x && x < r.x + r.w && row >= r.y && row < r.y + r.h,
              )
            : -1;
        if (o >= 0 ? o !== self && inWall(o, t) : k >= 0 && insertAt[k] > t) {
          sill = row;
          break;
        }
      }
    }
    return sill;
  };

  /** What a piece over columns `x0`..`x1` with its bottom at `y` rests on, or would land on,
   *  at `t`: the top of it, and the stay it is if that is a piece on its way out. */
  const supportAt = (x0: number, x1: number, y: number, self: number, t: number) => {
    let sill = standingUnder(x0, x1, y, self, t);
    let by: Stay | null = null;
    for (const s of stays) {
      if (t < s.from || t >= s.until || s.x1 < x0 || s.x0 > x1 || s.top < y - 0.5) continue;
      if (s.top < sill) [sill, by] = [s.top, s];
    }
    return { sill, by };
  };

  /** The columns of what still holds block `b` up at `t`, first and last. */
  const heldOver = (b: Block, t: number) => {
    let [L, R] = [Infinity, -Infinity];
    for (const c of b.bed) {
      const k = insertOf(c.j);
      const holds = c.j >= 0 ? inWall(c.j, t) : k >= 0 ? insertAt[k] > t : c.j === BASE;
      if (holds) [L, R] = [Math.min(L, c.a), Math.max(R, c.b)];
    }
    return [L, R];
  };

  /** How release `rel` (its piece `blk`) leaves the wall: its phases up to the flight; where
   *  it waited on the way (stays); and where it sat as it went, from when. */
  const leaveWall = (rel: Release, blk: ReturnType<typeof pieceOf>) => {
    const { i, dir } = rel;
    const laid = blocks[i];
    const cx = blk.x + blk.w / 2;
    const cy = blk.y + blk.h / 2;
    const upright: Pose = { x: cx, y: cy, z: -T / 2, phi: 0, theta: 0 };
    const edge = dir > 0 ? 0 : -T;
    const land = 1.75 + 0.85 * hash(seed, i, 41);
    const phases: Phase[] = [];
    const waits: Stay[] = [];
    const half = (p: Pose) => halfHeight(blk.w, blk.h, T, 0, p.theta);
    let t = rel.t;
    let from = upright;
    let kicked = rel.kind === "drop" || rel.kind === "topple";
    // The top of what it rests on: where it was laid, below its bed joint.
    let rests = laid.y + laid.h;
    const stay = (until: number) => {
      const [x0, x1] = [from.x - blk.w / 2, from.x + blk.w / 2 - 1];
      waits.push({ x0, x1, top: from.y - half(from), rests, from: t, until, gone: until });
    };
    const wait = (until: number) => {
      phases.push({ k: "ease", t0: t, t1: until, a: from, b: from, p: 1 });
      stay(until);
      t = until;
    };
    if (rel.kind === "topple") {
      // Over the edge of its bed on the side it overhangs, turning about that edge.
      const [L, R] = heldOver(laid, t);
      const side =
        (L <= R && Math.sign(laid.cx - (L + R) / 2)) || (hash(seed, i, 45) < 0.5 ? -1 : 1);
      const [px, py] = [L <= R ? (side > 0 ? R + 1 : L) : cx, blk.y + blk.h];
      const theta = side * 0.4;
      const [dx, dy] = [cx - px, cy - py];
      const to = {
        ...upright,
        x: px + dx * Math.cos(theta) - dy * Math.sin(theta),
        y: py + dx * Math.sin(theta) + dy * Math.cos(theta),
        theta,
      };
      phases.push({ k: "ease", t0: t, t1: t + 0.3, a: from, b: to, p: 2 });
      stay(t + 0.3);
      [from, t] = [to, t + 0.3];
    }
    // While it rests on a piece still leaving, it waits; with nothing under it, it falls onto
    // what is there when it gets there.
    for (let k = 0; k < 12; k++) {
      const moved = from !== upright;
      const bottom = from.y + half(from);
      // Where it lay, its own mortar was under it.
      const resting = moved ? bottom : laid.y + laid.h;
      const [x0, x1] = [from.x - blk.w / 2, from.x + blk.w / 2 - 1];
      const under = supportAt(x0, x1, resting, i, t);
      if (under.sill - resting <= 0.5) {
        if (under.by) {
          wait(under.by.until);
          kicked = true;
          continue;
        }
        // Held up where it was laid, it lets a piece leaving off its top go first: it would
        // sweep through it.
        const over =
          !moved &&
          rel.kind !== "topple" &&
          stays.find(
            (s) =>
              t >= s.from &&
              t < s.gone &&
              s.x1 >= blk.x &&
              s.x0 <= blk.x + blk.w - 1 &&
              Math.abs(s.rests - laid.y) <= 2,
          );
        if (!over) break;
        // No longer than what holds it up stays: a block let go after it is taken to be there
        // a moment only.
        let holds = t;
        const row = Math.round(under.sill);
        for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.floor(x1)); x++) {
          const o = row < spec.h ? owner[row * W + x] : -1;
          if (row >= spec.h || o < 0) holds = Infinity;
          else if (o !== i && inWall(o, t)) holds = Math.max(holds, releaseAt[o] + SOON);
        }
        if (holds <= t) break;
        wait(Math.min(over.gone, holds));
        continue;
      }
      let sill = under.sill;
      let dt = 0;
      for (let j = 0; j < 4; j++) {
        dt = Math.sqrt((2 * Math.max(0, sill - bottom)) / g);
        const then = supportAt(x0, x1, bottom, i, t + dt).sill;
        if (Math.abs(then - sill) < 1e-6) break;
        sill = then;
      }
      const on = { ...from, y: from.y + Math.max(0, sill - bottom) };
      phases.push({ k: "ease", t0: t, t1: t + dt, a: from, b: on, p: 2 });
      [from, t, rests] = [on, t + dt, Math.max(sill, bottom)];
      kicked = true;
    }
    const sits = from;
    const leaveT = t;
    const slide = (t0: number, a: Pose, z: number, speed: number): Ease => ({
      k: "ease",
      t0,
      t1: t0 + Math.abs(z - a.z) / speed,
      a,
      b: { ...a, z },
      p: 1,
    });
    // Pushed at 1 to 1.75 m/s, slid at a quarter to half a metre a second (40 px to the
    // metre); out until its middle is past the face, or all of it.
    const fast = 40 + 30 * hash(seed, i, 47);
    const slow = 10 + 10 * hash(seed, i, 44);
    const [mid, clear] = dir > 0 ? [1, T / 2 + 1] : [-T - 1, -T - T / 2 - 1];
    const pivot = (t0: number, p: Pose, bottom: number, kick: number) =>
      pivotOf(t0, p.x, bottom, edge, p.y - bottom, p.z - edge, dir, ground - bottom, land, g, kick);
    if (T >= blk.h * 0.9) {
      // Deeper than it is tall (a brick, a rubble stone), it cannot tip over its front edge
      // until most of it is out, and what is still in the wall would go down through the wall
      // below: it comes all the way out, then falls.
      if (rel.kind === "knock" || kicked) phases.push(slide(t, from, clear, fast));
      else {
        const out = slide(t, from, mid, slow);
        phases.push(out, slide(out.t1, out.b, clear, fast));
      }
    } else if (!kicked && rel.kind === "slip") {
      // A slab slid out from under its load until its middle is past the face, then over.
      const out = slide(t, from, mid, slow);
      phases.push(out, pivot(out.t1, out.b, from.y + half(from), 1));
    } else if (!kicked) {
      phases.push(pivot(t, from, blk.y + blk.h, rel.kind === "knock" ? 1.4 : 1));
    } else {
      const off = pivot(t, from, from.y + half(from), 1);
      if (off.k === "pivot") off.theta = from.theta;
      phases.push(off);
    }
    return { phases, waits, sits, leaveT, rests };
  };

  /** How much faster out of the wall's plane (toward `dir`) a flight must go so that nothing
   *  of it goes down through the wall standing below where it rested (row `rests`) as it sets
   *  off: -Infinity if it never comes level with it; negative, how much slower it could go. */
  const clearOfWall = (fl: Fly, b: Box, block: number, dir: number, rests: number) => {
    const reach = 0.5 * Math.hypot(b.w, b.h, b.T);
    const tops = new Map<number, number>();
    const topOf = (col: number) => {
      let top = tops.get(col);
      if (top === undefined) {
        top = col < 0 || col >= W ? spec.h : standingUnder(col, col, rests, block, fl.t0);
        tops.set(col, top);
      }
      return top;
    };
    // Within half a pixel of the next column, it is not in it: its own edge is on the line.
    const sill = (x: number) =>
      Math.max(topOf(Math.floor(x - 0.5)), topOf(Math.floor(x + 0.5))) + 0.5;
    // Above the lowest sill near it, it is level with nothing yet.
    let low = Infinity;
    for (let x = fl.c.x - reach - 8; x <= fl.c.x + reach + 8; x++) low = Math.min(low, sill(x));
    let more = -Infinity;
    for (let tau = 1 / 60; tau < 2; tau += 1 / 60) {
      const p = phasePose(fl, fl.t0 + tau);
      if (p.y - reach > ground) break;
      // Out past the face by all it could reach back, it stays clear.
      if (dir > 0 ? p.z - reach > 0.5 && fl.v.z >= 0 : p.z + reach < -T - 0.5 && fl.v.z <= 0) break;
      if (p.y + reach <= low) continue;
      const into = intoWall(cornersOf(b.w, b.h, b.T, p), sill, T, dir);
      if (into > -Infinity) more = Math.max(more, (into + 0.5) / tau);
    }
    return more;
  };

  /** The flight from the end of `phases`, out from the wall fast enough to clear what stands
   *  below where it rested (row `rests`) and slow enough to come down within the heap's
   *  reach. */
  const launch = (
    phases: Phase[],
    b: Box,
    block: number,
    dir: 1 | -1,
    rests: number,
    spin: Vec,
  ): Fly => {
    const last = phases[phases.length - 1];
    const c = phasePose(last, last.t1);
    const v = velocityAt(last);
    const fl: Fly = {
      k: "fly",
      t0: last.t1,
      t1: last.t1 + LONGEST,
      c,
      v: { x: v.x + spin.x, y: v.y, z: v.z },
      omega: last.k === "ease" ? spin.y * Math.sign(v.z || dir) : v.phi,
      spin: spin.z,
      g,
    };
    const more = clearOfWall(fl, b, block, dir, rests);
    if (more > 0) fl.v.z += dir * Math.min(200, more);
    if (dir < 0 || fl.v.z <= 0) return fl;
    // Not beyond the heap, to be pulled back to it; and still clear of the wall. Cut short,
    // somewhere in the heap's last stretch: all to its very edge, they stack up along it.
    const far = (pile.depth - Math.max(b.T, b.h) / 2) * (1 - 0.25 * hash(block, 62));
    for (let tau = 1 / 60; tau < LONGEST; tau += 1 / 60) {
      const p = phasePose(fl, fl.t0 + tau);
      if (p.y + halfHeight(b.w, b.h, b.T, p.phi, p.theta) < ground) continue;
      if (p.z > far) {
        fl.v.z = (far - c.z) / tau;
        const again = clearOfWall(fl, b, block, dir, rests);
        if (again > 0) fl.v.z += Math.min(200, again);
      }
      break;
    }
    return fl;
  };

  /** A piece leaving from `t0`, sitting with its top at `top`, bottom at `bottom`: when what
   *  of it is still within the wall's thickness no longer reaches up to where its top was (it
   *  holds nothing up), and when it is out of the thickness or down below where it sat. */
  const leavesAt = (phases: Phase[], t0: number, b: Box, top: number, bottom: number) => {
    let until = t0 + 3;
    for (let t = t0; t < t0 + 3; t += STEP) {
      const c = cornersOf(b.w, b.h, b.T, poseAt(phases, t));
      let high = Infinity;
      let yMin = Infinity;
      for (const q of c) {
        yMin = Math.min(yMin, q.y);
        if (q.z <= 0 && q.z >= -T) high = Math.min(high, q.y);
      }
      for (const [i, j] of BOX_EDGES) {
        for (const face of [0, -T]) {
          const [a, e] = [c[i], c[j]];
          if ((a.z - face) * (e.z - face) < 0)
            high = Math.min(high, a.y + ((e.y - a.y) * (face - a.z)) / (e.z - a.z));
        }
      }
      if (until > t && high > top + 1) until = t;
      if (high === Infinity || yMin >= bottom) return { until: Math.min(until, t), gone: t };
    }
    return { until, gone: t0 + 3 };
  };

  type Flight = {
    body: Body;
    fl: Fly;
    box: Box;
    cy: number;
    dir: 1 | -1;
    land: number;
    ver: number;
    /** How many times it has met another in the air. */
    hits: number;
  };
  const flights: Flight[] = [];
  for (const rel of releases) {
    stays = stays.filter((s) => s.gone > rel.t);
    const { i, dir } = rel;
    const blk = pieceOf(bond, blocks[i]);
    const box = { w: blk.w, h: blk.h, T };
    const { phases, waits, sits, leaveT, rests } = leaveWall(rel, blk);
    const tumble = rel.kind === "knock" ? 2 + 2 * hash(seed, i, 48) : 0.3 + 1.2 * hash(seed, i, 48);
    const spin = {
      x: (hash(seed, i, 42) - 0.5) * 6,
      y: tumble,
      z: (hash(seed, i, 43) - 0.5) * 1.2,
    };
    const fl = launch(phases, box, i, dir, rests, spin);
    phases.push(fl);
    const hh = halfHeight(blk.w, blk.h, T, 0, sits.theta);
    const [x0, x1] = [sits.x - blk.w / 2, sits.x + blk.w / 2 - 1];
    const { until, gone } = leavesAt(phases, leaveT, box, sits.y - hh, sits.y + hh);
    stays.push(...waits, { x0, x1, top: sits.y - hh, rests, from: leaveT, until, gone });
    baked[i] = 1;
    const body: Body = {
      id: bodies.length,
      block: i,
      mask: blk.mask,
      w: blk.w,
      h: blk.h,
      T,
      n: blk.n,
      ox: blk.x,
      oy: blk.y,
      start: rel.t,
      phases,
      lands: fl.t1,
      out: false,
      settled: Infinity,
      lying: null,
      broken: false,
      parent: null,
      chip: false,
      fresh: null,
    };
    bodies.push(body);
    flights.push({ body, fl, box, cy: blk.y + blk.h / 2, dir, land: 0, ver: 0, hits: 0 });
  }

  // --- Coming down, in the order things happen ------------------------------------------

  /** Where the ground is under pose `p` of a body `w` by `h` at `t`: the heap in the room (what
   *  has got there), the ground outside, or the sill while it is still within the wall. */
  const groundUnder = (p: Pose, w: number, h: number, t: number, self: number, bottom: number) => {
    if (p.z > 0) {
      // Well above anything the heap has reached: the heap need not be asked.
      if (bottom < ground - pile.top - 1) return ground - pile.top;
      const d = halfDepth(h, T, p.phi);
      const [x0, x1] = [p.x - w / 2, p.x + w / 2 - 1];
      return ground - heightOver(pile, x0, x1, Math.max(0, p.z - d), p.z + d, t);
    }
    if (p.z < -T) return ground;
    return standingUnder(p.x - w / 2, p.x + w / 2 - 1, p.y, self, t);
  };
  const touches = (f: Flight, t: number) => {
    const p = phasePose(f.fl, t);
    const bottom = p.y + halfHeight(f.box.w, f.box.h, T, p.phi, p.theta);
    return bottom >= groundUnder(p, f.box.w, f.box.h, t, f.body.block, bottom);
  };
  /** When flight `f` first touches down after `from`, if before `to`; else `to`. */
  const touchdown = (f: Flight, from: number, to: number) => {
    for (let t = from + STEP; t <= to; t += STEP) {
      if (!touches(f, t)) continue;
      let [lo, hi] = [t - STEP, t];
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if (touches(f, mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    }
    return to;
  };

  /** How much further out than where it lands a piece of `n` px fallen `fell` px comes to
   *  rest: a whole block that fell far, up to 10 px; small stuff hardly at all. */
  const runOn = (n: number, fell: number) =>
    Math.min(10, (8 * Math.sqrt(n / whole) * Math.max(0, fell)) / 100);

  // Comings to rest, launches and landings, soonest first (what comes to rest at a moment
  // before what lands then, which lands on it). A flight's landing is worked out as it sets
  // off, on the heap as it is then, and again for those in the air whenever something comes to
  // rest in their way.
  type Event = {
    t: number;
    kind: 0 | 1 | 2 | 3;
    k: number;
    ver: number;
    j?: number;
    jver?: number;
  };
  const queue: Event[] = [];
  const before = (a: Event, b: Event) =>
    a.t < b.t || (a.t === b.t && (a.kind < b.kind || (a.kind === b.kind && a.k < b.k)));
  const enqueue = (e: Event) => {
    queue.push(e);
    for (let i = queue.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (!before(queue[i], queue[p])) break;
      [queue[i], queue[p]] = [queue[p], queue[i]];
      i = p;
    }
  };
  const dequeue = () => {
    const top = queue[0];
    const last = queue.pop() as Event;
    if (queue.length) {
      queue[0] = last;
      for (let i = 0; ;) {
        const [l, r] = [2 * i + 1, 2 * i + 2];
        let m = i;
        if (l < queue.length && before(queue[l], queue[m])) m = l;
        if (r < queue.length && before(queue[r], queue[m])) m = r;
        if (m === i) break;
        [queue[i], queue[m]] = [queue[m], queue[i]];
        i = m;
      }
    }
    return top;
  };

  const airborne = new Set<number>();
  /** A way to rest, worked out at `at` on the heap as it stood then: where it was to end up,
   *  turned how, and the last ease, into where it does end up. */
  type Plan = {
    body: Body;
    end: { x: number; z: number; base: number };
    deep: number;
    rise: number;
    phi: number;
    theta: number;
    turn: number;
    chip: boolean;
    at: number;
    last: Ease;
  };
  const plans: Plan[] = [];
  /** When something last came to rest over each 8 px of the wall's length. */
  const laidAt = new Float64Array(Math.ceil(W / 8)).fill(-Infinity);

  /** The way `body`, hitting at pose `from` moving `v` at `t`, comes to rest: a hop that comes
   *  down on the heap, a roll down it while it is steeper than rubble stands (starting `out`
   *  px further out), and an ease into place, lying on its broadest face. `turnPhi` and
   *  `turnTheta` are how it was turning. It takes its place on the heap when it gets there,
   *  as the heap is then: what got there first, it lies on or beside. */
  const plan = (
    body: Body,
    hit: Pose,
    v: Vec,
    t: number,
    out: number,
    turnPhi: number,
    turnTheta: number,
  ) => {
    const onBed = body.T > body.h;
    const [deep, rise] = onBed ? [body.T, body.h] : [body.h, body.T];
    const clampX = (x: number) => Math.min(W - body.w / 2, Math.max(body.w / 2, x));
    const clampZ = (z: number) => Math.min(pile.depth - deep / 2, Math.max(deep / 2, z));
    const baseAt = (x: number, z: number, at: number) =>
      heightOver(pile, x - body.w / 2, x + body.w / 2 - 1, z - deep / 2, z + deep / 2 - 1, at);
    // Where it is centred, turned `p`, with its lowest point on the heap at height `base`.
    const yOn = (base: number, p: { phi: number; theta: number }) =>
      ground - base - halfHeight(body.w, body.h, body.T, p.phi, p.theta);
    // A piece of a broken block starts on the heap where it is, not in it.
    const there = baseAt(clampX(hit.x), clampZ(hit.z), t);
    const from = body.parent === null ? hit : { ...hit, y: Math.min(hit.y, yOn(there, hit)) };
    // On its broadest face (a slab on a face, a stone deeper than it is tall on a bed); over
    // onto the next if its turn has carried its centre past the edge it came down on.
    const sPhi = Math.sign(turnPhi);
    const phi = onBed
      ? restAngle(from.phi, 0, sPhi, Math.atan2(body.T, body.h))
      : restAngle(from.phi, Math.PI / 2, sPhi, Math.atan2(body.h, body.T));
    const chip = body.chip;
    const turn = chip ? (hash(seed, body.id, 53) - 0.5) * 6 : turnTheta;
    // Turning back to rest, it waits a moment first: turned back across a step the drawing
    // turns in just after crossing it, it would flicker.
    const backPhi = turnsBack(from.phi, phi, sPhi, TURN_STEP.phi);
    // The hop: up off the blow and down on the heap where it takes it (within the heap), or in
    // place if the heap there stands higher than it bounces; turned as it will be when it
    // comes down (in the plane, as it lands: it turns flat after).
    const up = pace.bounce[0] * Math.max(0, v.y);
    const th0 = (2 * up) / g;
    const hopEnd = { phi: backPhi ? from.phi : phi, theta: from.theta + (chip ? turn * th0 : 0) };
    const ballistic = (s: { x: number; z: number }) => {
      const d = up * up + 2 * g * (yOn(baseAt(s.x, s.z, t), hopEnd) - from.y);
      return d >= 0 ? (up + Math.sqrt(d)) / g : 0;
    };
    let spot = { x: clampX(from.x), z: clampZ(from.z) };
    let th = 0;
    if (th0 >= 0.06) {
      const far = {
        x: clampX(from.x + v.x * pace.bounce[1] * th0),
        z: clampZ(from.z + v.z * pace.bounce[1] * th0),
      };
      th = ballistic(far);
      if (th) spot = far;
      else th = ballistic(spot);
    }
    // Then on a little further out if that is not uphill, and down the heap while it is
    // steeper than rubble stands.
    const further = { x: spot.x, z: clampZ(spot.z + out) };
    const runFrom =
      baseAt(further.x, further.z, t) <= baseAt(spot.x, spot.z, t) + 1 ? further : spot;
    const rolled = restingPlace(pile, runFrom.x, runFrom.z, body.w, deep, t);
    const end = { x: rolled.x, z: rolled.z, base: rolled.base };
    const theta = thetaAt(
      body,
      end.x,
      end.z,
      deep,
      t,
      from.theta + (chip ? turn * th : 0),
      turn,
      chip,
    );
    const backTheta = !chip && turnsBack(from.theta, theta, Math.sign(turn), TURN_STEP.theta);
    let when = t;
    let at = from;
    const points = [runFrom, ...rolled.path];
    if (th > 0) {
      const hop: Fly = {
        k: "fly",
        t0: t,
        t1: t + th,
        c: from,
        v: { x: (spot.x - from.x) / th, y: -up, z: (spot.z - from.z) / th },
        omega: backPhi ? 0 : (phi - from.phi) / th,
        // A chip spins on to the face ahead of it; turning back waits.
        spin: backTheta ? 0 : (theta - from.theta) / th,
        g,
      };
      body.phases.push(hop);
      at = phasePose(hop, hop.t1);
      when = hop.t1;
    }
    // From place to place down the heap: rolled, or where it steps down steeper than it could
    // roll, dropped.
    const legs: { to: Pose; dt: number; drops: boolean }[] = [];
    let rolling = 0;
    for (const p of points) {
      const prev = legs[legs.length - 1]?.to ?? at;
      const to = { x: p.x, y: yOn(baseAt(p.x, p.z, t), at), z: p.z, phi: at.phi, theta: at.theta };
      const across = Math.hypot(to.x - prev.x, to.z - prev.z);
      const down = to.y - prev.y;
      if (Math.hypot(across, down) < 0.25) continue;
      // Off an edge (nothing under the middle of the way), or down a step steeper than a roll.
      const under = yOn(baseAt((prev.x + to.x) / 2, (prev.z + to.z) / 2, t), at);
      const drops = down > 2 && (down > across || under - (prev.y + to.y) / 2 > 2);
      const dt = drops ? Math.sqrt((2 * down) / g) : Math.hypot(across, down) / ROLL;
      legs.push({ to, dt, drops });
      rolling += dt;
    }
    if ((backPhi || backTheta) && when - t + rolling < PAUSE) {
      const t1 = t + PAUSE - rolling;
      body.phases.push({ k: "ease", t0: when, t1, a: at, b: at, p: 1 });
      when = t1;
    }
    for (const { to, dt, drops } of legs) {
      body.phases.push(
        drops
          ? {
              k: "fly",
              t0: when,
              t1: when + dt,
              c: at,
              v: { x: (to.x - at.x) / dt, y: 0, z: (to.z - at.z) / dt },
              omega: 0,
              spin: 0,
              g,
            }
          : { k: "ease", t0: when, t1: when + dt, a: at, b: to, p: 1 },
      );
      [at, when] = [to, when + dt];
    }
    // Into place.
    const last: Ease = {
      k: "ease",
      t0: when,
      t1: when + SETTLE,
      a: at,
      b: at,
      p: backPhi || backTheta ? 2 : 0.5,
    };
    body.phases.push(last);
    body.settled = last.t1;
    plans.push({ body, end, deep, rise, phi, theta, turn, chip, at: t, last });
    enqueue({ t: last.t1, kind: 0, k: plans.length - 1, ver: 0 });
  };

  /** Lay a body where it comes to rest, on whole pixels of the drawing: where it was to, or,
   *  if something has come to rest near there since, on that or beside it, the last ease
   *  taking as long as getting there would. What comes down over it from now lands on it. */
  const settle = (pl: Plan) => {
    const { body, last } = pl;
    const S = last.t1;
    const reach = body.w / 2 + 14;
    let since = false;
    const [c0, c1] = [Math.floor((pl.end.x - reach) / 8), Math.floor((pl.end.x + reach) / 8)];
    for (let c = Math.max(0, c0); c <= Math.min(laidAt.length - 1, c1); c++) {
      if (laidAt[c] > pl.at) since = true;
    }
    const fin = since ? restingPlace(pile, pl.end.x, pl.end.z, body.w, pl.deep, S) : pl.end;
    // Up onto a whole pixel, never down: a fraction of a pixel into what it lies on, its
    // bottom row would go under the floor.
    const y = ground - fin.base - pl.rise / 2;
    const b = { x: fin.x, y: Math.floor(y + DEPTH_SLOPE * fin.z) - DEPTH_SLOPE * fin.z, z: fin.z };
    last.b = { ...b, phi: pl.phi, theta: pl.theta };
    if (since) {
      const across = Math.hypot(b.x - last.a.x, b.z - last.a.z);
      const down = b.y - last.a.y;
      last.t1 = Math.max(
        S,
        last.t0 + Math.max(Math.sqrt((2 * Math.max(0, down)) / g), across / ROLL),
      );
      body.settled = last.t1;
      // Over what is under it, not through the air: along at its height while there is
      // something under it, then down off the edge into its place.
      const from = last.a.y + pl.rise / 2;
      const surface = (u: number) => {
        const [x, z] = [last.a.x + (b.x - last.a.x) * u, last.a.z + (b.z - last.a.z) * u];
        return (
          ground -
          heightOver(
            pile,
            x - body.w / 2,
            x + body.w / 2 - 1,
            z - pl.deep / 2,
            z + pl.deep / 2 - 1,
            S,
          )
        );
      };
      const steps = Math.ceil(across);
      let edge = -1;
      for (let k = 1; k <= steps && down > 1.5; k++) {
        if (surface(k / steps) > from + 1.5) {
          edge = (k - 1) / steps;
          break;
        }
      }
      if (edge > 0) {
        const at = (u: number, y: number): Pose => ({
          x: last.a.x + (b.x - last.a.x) * u,
          y,
          z: last.a.z + (b.z - last.a.z) * u,
          phi: last.a.phi + (pl.phi - last.a.phi) * u,
          theta: last.a.theta + (pl.theta - last.a.theta) * u,
        });
        const brink = at(edge, last.a.y);
        last.b = brink;
        last.p = 1;
        last.t1 = last.t0 + (across * edge) / ROLL;
        const fall = Math.sqrt((2 * Math.max(0, b.y - brink.y)) / g);
        const off: Ease = {
          k: "ease",
          t0: last.t1,
          t1: last.t1 + Math.max(fall, (across * (1 - edge)) / ROLL),
          a: brink,
          b: { ...b, phi: pl.phi, theta: pl.theta },
          p: 2,
        };
        body.phases.push(off);
        body.settled = off.t1;
      }
    }
    const l = lay(pile, body.id, fin.x, fin.z, body.w, pl.deep, fin.base, pl.rise, S);
    // Its top where it is drawn: put on a whole pixel, and lying tilted (propped on something
    // at one end) its high corner over a flat top. Sunk this far, it is all under.
    const [st, ct] = [Math.abs(Math.sin(pl.theta)), Math.abs(Math.cos(pl.theta))];
    l.top += y - b.y + Math.max(0, 0.5 * (body.w * st + pl.rise * ct) - pl.rise / 2);
    body.lying = l;
    const [x0, x1] = [
      Math.max(0, Math.floor(l.x0 / 8)),
      Math.min(laidAt.length - 1, Math.floor(l.x1 / 8)),
    ];
    for (let c = x0; c <= x1; c++) laidAt[c] = S;
    inTheWay(l);
  };

  /** Flights in the air that come down over piece `l`, now that it is there, land on it. */
  const inTheWay = (l: Lying) => {
    const t = l.rest;
    for (const k of airborne) {
      const f = flights[k];
      if (f.land <= t) continue;
      const [a, b] = [phasePose(f.fl, Math.max(f.fl.t0, t)), phasePose(f.fl, f.land)];
      const reach = f.box.w / 2 + 2;
      const d = 0.5 * Math.hypot(f.box.h, T) + 2;
      if (Math.max(a.x, b.x) + reach < l.x0 || Math.min(a.x, b.x) - reach > l.x1) continue;
      if (Math.max(a.z, b.z) + d < l.z0 || Math.min(a.z, b.z) - d > l.z1) continue;
      const again = touchdown(f, Math.max(f.fl.t0, t), f.land);
      if (again < f.land) {
        f.land = again;
        f.ver++;
        enqueue({ t: again, kind: 2, k, ver: f.ver });
      }
    }
  };

  // --- Meeting in the air ------------------------------------------------------------

  /** A piece in flight at `t` as a turned rectangle in the wall's plane (its centre, half its
   *  length and its height as turned out of the plane, its turn in it) and half its depth. */
  const shapeAt = (f: Flight, t: number) => {
    const p = phasePose(f.fl, t);
    const { w, h, T: d } = f.box;
    const hh = 0.5 * (Math.abs(h * Math.cos(p.phi)) + Math.abs(d * Math.sin(p.phi)));
    return { p, hw: w / 2, hh, hz: halfDepth(h, d, p.phi) };
  };
  type Shape = ReturnType<typeof shapeAt>;
  /** How deep two pieces overlap, px, and the way from `b` to `a` it is least: null if they are
   *  apart (by the sides of each rectangle, and in depth). */
  const overlapOf = (a: Shape, b: Shape) => {
    const dz = a.p.z - b.p.z;
    const oz = a.hz + b.hz - Math.abs(dz) - SLACK;
    if (oz <= 0) return null;
    let best = { d: oz, n: { x: 0, y: 0, z: Math.sign(dz) || 1 } };
    for (const turn of [a.p.theta, a.p.theta + Math.PI / 2, b.p.theta, b.p.theta + Math.PI / 2]) {
      const [ux, uy] = [Math.cos(turn), Math.sin(turn)];
      const half = (s: Shape) =>
        s.hw * Math.abs(Math.cos(s.p.theta - turn)) + s.hh * Math.abs(Math.sin(s.p.theta - turn));
      const dist = (a.p.x - b.p.x) * ux + (a.p.y - b.p.y) * uy;
      const o = half(a) + half(b) - Math.abs(dist) - SLACK;
      if (o <= 0) return null;
      if (o < best.d) {
        const sign = Math.sign(dist) || 1;
        best = { d: o, n: { x: ux * sign, y: uy * sign, z: 0 } };
      }
    }
    return best;
  };

  /** The velocity of flight `f` at `t`. */
  const speedOf = (f: Flight, t: number): Vec => ({
    x: f.fl.v.x,
    y: f.fl.v.y + g * (t - f.fl.t0),
    z: f.fl.v.z,
  });
  /** Whether two pieces overlapping by `n` are coming together. */
  const closing = (a: Flight, b: Flight, t: number, n: Vec) => {
    const [va, vb] = [speedOf(a, t), speedOf(b, t)];
    return (va.x - vb.x) * n.x + (va.y - vb.y) * n.y + (va.z - vb.z) * n.z < 0;
  };
  /** The box flight `f` sweeps from `t0` to `t1`: its path's bounds (straight across and in
   *  depth, an arc up and down), widened by its reach whichever way it turns. */
  const sweptOf = (f: Flight, t0: number, t1: number) => {
    const [a, b] = [phasePose(f.fl, t0), phasePose(f.fl, t1)];
    let y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    // The top of the arc, if it is in the window.
    const apex = f.fl.t0 - f.fl.v.y / g;
    if (apex > t0 && apex < t1) y0 = Math.min(y0, phasePose(f.fl, apex).y);
    const r = 0.5 * Math.hypot(f.box.w, f.box.h, f.box.T);
    return {
      x0: Math.min(a.x, b.x) - r,
      x1: Math.max(a.x, b.x) + r,
      y0: y0 - r,
      y1: y1 + r,
      z0: Math.min(a.z, b.z) - r,
      z1: Math.max(a.z, b.z) + r,
    };
  };

  /** Where flight `k`, in the air from `from`, first meets another in the air, each checked
   *  until either comes down. Setting off into one coming its way, at once; one it is leaving
   *  (pieces leaving side by side set off touching), only once they have been apart. */
  const meetings = (k: number, from: number) => {
    const f = flights[k];
    for (const j of airborne) {
      if (j === k) continue;
      const o = flights[j];
      const [t0, t1] = [Math.max(from, o.fl.t0), Math.min(f.land, o.land)];
      if (t1 <= t0) continue;
      const [sa, sb] = [sweptOf(f, t0, t1), sweptOf(o, t0, t1)];
      if (sa.x1 < sb.x0 || sb.x1 < sa.x0 || sa.y1 < sb.y0 || sb.y1 < sa.y0) continue;
      if (sa.z1 < sb.z0 || sb.z1 < sa.z0) continue;
      const [a, b] = k < j ? [k, j] : [j, k];
      const meet = (t: number) =>
        enqueue({ t, kind: 3, k: a, ver: flights[a].ver, j: b, jver: flights[b].ver });
      const start = overlapOf(shapeAt(f, t0), shapeAt(o, t0));
      if (start && closing(f, o, t0, start.n)) {
        meet(t0);
        continue;
      }
      let apart = start === null;
      for (let t = t0 + 2 * STEP; t < t1; t += 2 * STEP) {
        const met = overlapOf(shapeAt(f, t), shapeAt(o, t)) !== null;
        if (!apart) {
          apart = !met;
          continue;
        }
        if (!met) continue;
        let [lo, hi] = [t - 2 * STEP, t];
        for (let n = 0; n < 12; n++) {
          const mid = (lo + hi) / 2;
          if (overlapOf(shapeAt(f, mid), shapeAt(o, mid))) hi = mid;
          else lo = mid;
        }
        meet(hi);
        break;
      }
    }
  };

  /** Flight `f` sets off again at `t` from where it is with velocity `v`, as it was turning. */
  const setOff = (k: number, t: number, v: Vec) => {
    const f = flights[k];
    const c = phasePose(f.fl, t);
    f.fl.t1 = t;
    const fl: Fly = { ...f.fl, t0: t, t1: t + LONGEST, c, v };
    f.body.phases.push(fl);
    f.fl = fl;
    f.ver++;
    f.land = touchdown(f, t, t + LONGEST);
    enqueue({ t: f.land, kind: 2, k, ver: f.ver });
  };

  /** Two pieces meeting in the air at `t` knock each other apart along the way they overlap
   *  least, as hard as they were coming together, keeping a little of it (the heap's
   *  restitution), the lighter piece taking more; then each flies on from there. Neither is
   *  knocked back toward the wall it is still beside. */
  const meet = (ka: number, kb: number, t: number) => {
    const [a, b] = [flights[ka], flights[kb]];
    // A few knocks each: three or more in a huddle would knock each other on for ever.
    if (a.hits >= MEETS || b.hits >= MEETS) return;
    const touch = overlapOf(shapeAt(a, t), shapeAt(b, t));
    if (!touch) return;
    a.hits++;
    b.hits++;
    const [va, vb] = [speedOf(a, t), speedOf(b, t)];
    const { n } = touch;
    const together = (va.x - vb.x) * n.x + (va.y - vb.y) * n.y + (va.z - vb.z) * n.z;
    if (together >= 0) return;
    const [ma, mb] = [a.body.n, b.body.n];
    const J = (-(1 + pace.bounce[0]) * together) / (1 / ma + 1 / mb);
    const away = (f: Flight, v: Vec, k: number): Vec => {
      const out = { x: v.x + k * n.x, y: v.y + k * n.y, z: v.z + k * n.z };
      // By the wall, not back toward it.
      const z = phasePose(f.fl, t).z;
      if (z > -T && z < T && Math.sign(out.z) !== f.dir) out.z = Math.max(0, out.z * f.dir) * f.dir;
      return out;
    };
    setOff(ka, t, away(a, va, J / ma));
    setOff(kb, t, away(b, vb, -J / mb));
    meetings(ka, t);
    meetings(kb, t);
  };

  /** How a piece lying at `x`, `z` is turned in the plane: as the heap slopes under it, give
   *  or take a little; of that and the half turns from it, the nearest to `from` (a chip: the
   *  first it spins on to). */
  const thetaAt = (
    body: Body,
    x: number,
    z: number,
    deep: number,
    t: number,
    from: number,
    turn: number,
    chip: boolean,
  ) => {
    const half = (x0: number, x1: number) =>
      heightOver(pile, x0, x1, z - deep / 2, z + deep / 2 - 1, t);
    const tilt = (half(x, x + body.w / 2 - 1) - half(x - body.w / 2, x - 1)) / (body.w / 2);
    const slope =
      Math.max(-0.35, Math.min(0.35, -Math.atan(tilt))) + (hash(seed, body.id, 46) - 0.5) * 0.08;
    return chip ? aheadOf(from, slope, Math.sign(turn)) : restAngle(from, slope, 0, 0);
  };

  /** Flight `f` comes down: outside and gone, or into the room, whole or broken. */
  const comeDown = (f: Flight) => {
    const { body, fl, box } = f;
    const L = f.land;
    const i = body.block;
    fl.t1 = L;
    body.lands = L;
    const hit = phasePose(fl, L);
    body.out = hit.z < -T;
    const fell = hit.y - f.cy;
    impacts.push({
      t: L,
      x: hit.x,
      y: hit.y + halfHeight(box.w, box.h, T, hit.phi, hit.theta),
      z: hit.z,
      n: body.n,
      fall: fell,
      out: body.out,
    });
    if (body.out) return;
    // In the room: it may break where it lands; whole or in pieces, it comes to rest on the
    // heap. Big blocks run on further out than small stuff.
    const v = { x: fl.v.x, y: fl.v.y + g * (L - fl.t0), z: fl.v.z };
    const edgeOn = Math.abs((Math.abs(hit.phi) % (Math.PI / 2)) - Math.PI / 4) < 0.35;
    const onRubble =
      heightOver(
        pile,
        hit.x - box.w / 2,
        hit.x + box.w / 2 - 1,
        Math.max(0, hit.z - 4),
        hit.z + 4,
        L,
      ) > 0;
    const brittle = spec.brittle ?? 1;
    if (
      body.n >= BREAKS * whole &&
      hash(seed, i, 47) < breakOdds(fell, edgeOn, onRubble) * brittle
    ) {
      body.broken = true;
      for (const [k, pc] of fracture(
        body.mask,
        box.w,
        box.h,
        hash(seed, i, 48) * 2 ** 31,
        fell,
      ).entries()) {
        // The piece where it was in the block, as the block lay when it hit.
        const lx = pc.dx + pc.w / 2 - box.w / 2;
        const ly = pc.dy + pc.h / 2 - box.h / 2;
        const off = turnPoint(lx, ly, 0, hit.phi, hit.theta);
        const from: Pose = { ...hit, x: hit.x + off.x, y: hit.y + off.y, z: hit.z + off.z };
        const away = Math.sign(lx) || (k % 2 ? 1 : -1);
        const apart = {
          x: v.x + away * (10 + 15 * hash(seed, i, k, 49)),
          y: v.y * (0.8 + 0.4 * hash(seed, i, k, 50)),
          z: v.z + (hash(seed, i, k, 52) - 0.4) * 30,
        };
        const piece: Body = {
          ...body,
          id: PIECES + pieces++,
          mask: pc.mask,
          fresh: pc.fresh,
          w: pc.w,
          h: pc.h,
          T: pc.chip ? Math.min(T, Math.max(2, Math.round(Math.sqrt(pc.n)))) : T,
          n: pc.n,
          ox: body.ox + pc.dx,
          oy: body.oy + pc.dy,
          start: L,
          phases: [],
          parent: body.id,
          broken: false,
          chip: pc.chip,
        };
        bodies.push(piece);
        plan(piece, from, apart, L, pc.chip ? 0 : runOn(pc.n, fell) / 2, fl.omega, fl.spin);
      }
      return;
    }
    plan(body, hit, v, L, runOn(body.n, fell), fl.omega, fl.spin);
  };

  flights.forEach((f, k) => enqueue({ t: f.fl.t0, kind: 1, k, ver: 0 }));
  while (queue.length) {
    const e = dequeue();
    const f = flights[e.k];
    if (e.kind === 0) settle(plans[e.k]);
    else if (e.kind === 1) {
      f.land = touchdown(f, f.fl.t0, f.fl.t0 + LONGEST);
      airborne.add(e.k);
      enqueue({ t: f.land, kind: 2, k: e.k, ver: f.ver });
      meetings(e.k, f.fl.t0);
    } else if (e.kind === 3) {
      const j = e.j as number;
      const both = airborne.has(e.k) && airborne.has(j);
      if (both && e.ver === f.ver && e.jver === flights[j].ver) meet(e.k, j, e.t);
    } else if (e.ver === f.ver) {
      airborne.delete(e.k);
      comeDown(f);
    }
  }

  // One thud for impacts together: big if any of them is a whole block fallen far indoors.
  const cues: Cue[] = [];
  for (const im of [...impacts].sort((a, b) => a.t - b.t || a.x - b.x)) {
    const big = !im.out && im.n >= 0.6 * whole && im.fall >= 30;
    let into: Cue | undefined;
    for (let k = cues.length - 1; k >= 0 && im.t - cues[k].t < TOGETHER[0]; k--) {
      if (Math.abs(im.x - cues[k].x) < TOGETHER[1]) {
        into = cues[k];
        break;
      }
    }
    if (into) into.big ||= big;
    else cues.push({ t: im.t, x: im.x, big });
  }
  return { bodies, impacts, cues, pile };
};
