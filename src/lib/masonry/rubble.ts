// What comes off the wall, once it is off: every released block becomes a body with its whole
// motion worked out in phases, from leaving the wall to lying still on the heap (or to hitting
// the ground outside, out of sight). Bodies are baked in the order they leave the wall, each
// landing on the heap as it stands when it lands; every landing is an impact, and impacts
// close together are one thud.

import { hash } from "$lib/scene/pixel";

import type { Pace } from "./decay";
import {
  halfDepth,
  halfHeight,
  type Phase,
  phasePose,
  pivotOf,
  type Pose,
  turnPoint,
  velocityAt,
} from "./fall";
import { breakOdds, fracture } from "./fracture";
import { heightOver, lay, type Lying, pileOf, restingPlace } from "./pile";
import type { Release } from "./timeline";
import type { Block, Bond } from "./types";

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

/** A body hitting the ground: when, where, how big a piece, from how high, outside or in. */
export type Impact = { t: number; x: number; n: number; fall: number; out: boolean };
/** What is heard: one or more impacts at once. */
export type Cue = { t: number; x: number; big: boolean };

/** Impacts closer than this, s and px, are one thud. */
const TOGETHER: [number, number] = [0.06, 32];
/** Time steps for finding a landing, s, and the longest flight looked for. */
const STEP = 1 / 120;
const LONGEST = 6;

/** A block's own pixels as a mask over its box. */
export const maskOf = (bond: Bond, b: Block) => {
  const W = bond.spec.w;
  const mask = new Uint8Array(b.w * b.h);
  for (const q of b.px) {
    const x = q % W;
    const y = (q - x) / W;
    mask[(y - b.y) * b.w + (x - b.x)] = 1;
  }
  return mask;
};

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
  const impacts: Impact[] = [];
  const whole = spec.unit * spec.course;

  /** The top of what still stands under columns `x0`..`x1` from row `y` down at `t`: the
   *  wall's sill, or the base. */
  const sillOf = (x0: number, x1: number, y: number, self: number, t: number) => {
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
        const there = o >= 0 ? o !== self && releaseAt[o] > t : k >= 0 && insertAt[k] > t;
        if (there) {
          sill = row;
          break;
        }
      }
    }
    return sill;
  };

  /** Where the ground is under pose `p` of a body `w` by `h` at `t`: the heap in the room,
   *  the ground outside, or the sill while it is still within the wall. */
  const groundUnder = (p: Pose, w: number, h: number, t: number, self: number, bottom: number) => {
    if (p.z > 0) {
      // Well above anything the heap has reached: the heap need not be asked.
      if (bottom < ground - pile.top - 1) return ground - pile.top;
      const d = halfDepth(h, T, p.phi);
      return (
        ground - heightOver(pile, p.x - w / 2, p.x + w / 2 - 1, Math.max(0, p.z - d), p.z + d, t)
      );
    }
    if (p.z < -T) return ground;
    return sillOf(p.x - w / 2, p.x + w / 2 - 1, p.y, self, t);
  };

  /** How much further out than where it lands a piece of `n` px fallen `fell` px comes to
   *  rest: a whole block that fell far, up to 10 px; small stuff hardly at all. */
  const push = (n: number, fell: number) =>
    Math.min(10, (8 * Math.sqrt(n / whole) * Math.max(0, fell)) / 100);

  /** From pose `from` at `t`, moving `v` (down positive), a hop and a settle to where the heap
   *  lets `body` lie flat, `out` px further out; then laid on the heap. */
  const comeToRest = (
    body: Body,
    from: Pose,
    v: { x: number; y: number; z: number },
    t: number,
    out: number,
    dir: 1 | -1,
  ) => {
    const up = pace.bounce[0] * Math.max(0, v.y);
    const th = (2 * up) / g;
    const hops = th >= 0.06;
    const vx = v.x * pace.bounce[1];
    const vz = v.z * pace.bounce[1];
    const lands = hops ? { x: from.x + vx * th, z: from.z + vz * th } : from;
    const rest = restingPlace(pile, lands.x, lands.z + out, body.w, body.h, t);
    const phi = (Math.abs(from.phi) < 0.05 ? dir : Math.sign(from.phi)) * (Math.PI / 2);
    const half = (x0: number, x1: number) =>
      heightOver(pile, x0, x1, rest.z - body.h / 2, rest.z + body.h / 2 - 1, t);
    const tilt =
      (half(rest.x, rest.x + body.w / 2 - 1) - half(rest.x - body.w / 2, rest.x - 1)) /
      (body.w / 2);
    const theta =
      Math.max(-0.35, Math.min(0.35, -Math.atan(tilt))) + (hash(seed, body.id, 46) - 0.5) * 0.08;
    const still: Pose = { x: rest.x, y: ground - rest.base - body.T / 2, z: rest.z, phi, theta };
    let at = from;
    let when = t;
    if (hops) {
      const hop: Phase = {
        k: "fly",
        t0: t,
        t1: t + th,
        c: from,
        v: { x: vx, y: -up, z: vz },
        omega: (phi - from.phi) / th,
        spin: (theta - from.theta) / th + (body.chip ? (hash(seed, body.id, 53) - 0.5) * 12 : 0),
        g,
      };
      body.phases.push(hop);
      at = phasePose(hop, hop.t1);
      when = hop.t1;
    }
    body.phases.push({ k: "ease", t0: when, t1: when + 0.25, a: at, b: still, p: 0.5 });
    body.settled = when + 0.25;
    body.lying = lay(
      pile,
      body.id,
      rest.x,
      rest.z,
      body.w,
      body.h,
      rest.base,
      body.T,
      body.settled,
    );
  };

  /** Fly from the end of `phases` until the body touches the ground; returns the flight. */
  const fly = (
    phases: Phase[],
    b: { w: number; h: number; block: number },
    drift: number,
    spin: number,
  ) => {
    const last = phases[phases.length - 1];
    const c = phasePose(last, last.t1);
    const v = velocityAt(last);
    const flight: Phase = {
      k: "fly",
      t0: last.t1,
      t1: last.t1 + LONGEST,
      c,
      v: { x: v.x + drift, y: v.y, z: v.z },
      omega: last.k === "ease" ? 0.3 * Math.sign(v.z || 1) : v.phi,
      spin,
      g,
    };
    const touches = (t: number) => {
      const p = phasePose(flight, t);
      const bottom = p.y + halfHeight(b.w, b.h, T, p.phi, p.theta);
      return bottom >= groundUnder(p, b.w, b.h, t, b.block, bottom);
    };
    let lo = flight.t0;
    let hi = flight.t1;
    for (let t = flight.t0 + STEP; t <= flight.t1; t += STEP) {
      if (touches(t)) {
        hi = t;
        lo = t - STEP;
        break;
      }
    }
    for (let k = 0; k < 20; k++) {
      const mid = (lo + hi) / 2;
      if (touches(mid)) hi = mid;
      else lo = mid;
    }
    flight.t1 = hi;
    return flight;
  };

  for (const rel of releases) {
    const blk = blocks[rel.i];
    const { i } = rel;
    const dir = rel.dir;
    const cx = blk.x + blk.w / 2;
    const cy = blk.y + blk.h / 2;
    const upright: Pose = { x: cx, y: cy, z: -T / 2, phi: 0, theta: 0 };
    const land = 1.75 + 0.85 * hash(seed, i, 41);
    const drift = (hash(seed, i, 42) - 0.5) * 6;
    const spin = (hash(seed, i, 43) - 0.5) * 1.2;
    const edge = dir > 0 ? 0 : -T;
    const phases: Phase[] = [];
    const pivotFrom = (t0: number, from: Pose, bottom: number, kick: number) =>
      pivotOf(
        t0,
        from.x,
        bottom,
        edge,
        from.y - bottom,
        from.z - edge,
        dir,
        blk.h,
        T,
        ground - bottom,
        land,
        g,
        kick,
      );
    if (rel.kind === "knock" || rel.kind === "weather") {
      phases.push(pivotFrom(rel.t, upright, blk.y + blk.h, rel.kind === "knock" ? 1.4 : 1));
    } else if (rel.kind === "slip") {
      // Slid out from under its load, then off.
      const out = dir > 0 ? T / 2 + 0.5 : -T - T / 2 - 0.5;
      const t1 = rel.t + 0.3 + 0.3 * hash(seed, i, 44);
      phases.push({ k: "ease", t0: rel.t, t1, a: upright, b: { ...upright, z: out }, p: 1 });
    } else {
      // Over the edge of its bed first, if it topples; then down onto what stands below.
      let from = upright;
      let t = rel.t;
      if (rel.kind === "topple") {
        const side = hash(seed, i, 45) < 0.5 ? -1 : 1;
        const to = { ...upright, x: cx + side * blk.w * 0.15, y: cy + 2, theta: side * 0.4 };
        phases.push({ k: "ease", t0: t, t1: t + 0.3, a: from, b: to, p: 2 });
        [from, t] = [to, t + 0.3];
      }
      const bottom = from.y + halfHeight(blk.w, blk.h, T, 0, from.theta);
      const sill = sillOf(from.x - blk.w / 2, from.x + blk.w / 2 - 1, bottom, i, t);
      const drop = Math.max(0, sill - bottom);
      const dt = Math.sqrt((2 * drop) / g);
      const on = { ...from, y: from.y + drop };
      phases.push({ k: "ease", t0: t, t1: t + dt, a: from, b: on, p: 2 });
      const off = pivotFrom(t + dt, on, sill, 1);
      if (off.k === "pivot") off.theta = from.theta;
      phases.push(off);
    }
    const flight = fly(phases, { w: blk.w, h: blk.h, block: i }, drift, spin);
    phases.push(flight);
    const hit = phasePose(flight, flight.t1);
    const out = hit.z < -T;
    const fell = hit.y - cy;
    impacts.push({ t: flight.t1, x: hit.x, n: blk.n, fall: fell, out });
    const body: Body = {
      id: bodies.length,
      block: i,
      mask: maskOf(bond, blk),
      w: blk.w,
      h: blk.h,
      T,
      n: blk.n,
      ox: blk.x,
      oy: blk.y,
      start: rel.t,
      phases,
      lands: flight.t1,
      out,
      settled: Infinity,
      lying: null,
      broken: false,
      parent: null,
      chip: false,
      fresh: null,
    };
    bodies.push(body);
    if (out) continue;

    // In the room: it may break where it lands; whole or in pieces, it hops, then settles
    // flat where the heap lets it lie. Big blocks run on further out than small stuff.
    const v = { x: flight.v.x, y: flight.v.y + g * (flight.t1 - flight.t0), z: flight.v.z };
    const edgeOn = Math.abs((Math.abs(hit.phi) % (Math.PI / 2)) - Math.PI / 4) < 0.35;
    const onRubble =
      heightOver(
        pile,
        hit.x - blk.w / 2,
        hit.x + blk.w / 2 - 1,
        Math.max(0, hit.z - 4),
        hit.z + 4,
        flight.t1,
      ) > 0;
    if (blk.n >= 60 && hash(seed, i, 47) < breakOdds(fell, edgeOn, onRubble)) {
      body.broken = true;
      for (const [k, pc] of fracture(
        body.mask,
        blk.w,
        blk.h,
        hash(seed, i, 48) * 2 ** 31,
        fell,
      ).entries()) {
        // The piece where it was in the block, as the block lay when it hit.
        const lx = pc.dx + pc.w / 2 - blk.w / 2;
        const ly = pc.dy + pc.h / 2 - blk.h / 2;
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
          id: bodies.length,
          mask: pc.mask,
          fresh: pc.fresh,
          w: pc.w,
          h: pc.h,
          T: pc.chip ? Math.min(T, Math.max(2, Math.round(Math.sqrt(pc.n)))) : T,
          n: pc.n,
          ox: blk.x + pc.dx,
          oy: blk.y + pc.dy,
          start: flight.t1,
          phases: [],
          parent: body.id,
          broken: false,
          chip: pc.chip,
        };
        bodies.push(piece);
        comeToRest(piece, from, apart, flight.t1, pc.chip ? 0 : push(pc.n, fell) / 2, dir);
      }
      continue;
    }
    comeToRest(body, hit, v, flight.t1, push(blk.n, fell), dir);
  }

  // One thud for impacts together: big if any of them is a whole block fallen far indoors.
  const cues: Cue[] = [];
  for (const im of [...impacts].sort((a, b) => a.t - b.t || a.x - b.x)) {
    const big = !im.out && im.n >= 0.6 * whole && im.fall >= 30;
    const last = cues[cues.length - 1];
    if (last && im.t - last.t < TOGETHER[0] && Math.abs(im.x - last.x) < TOGETHER[1]) {
      last.big ||= big;
    } else cues.push({ t: im.t, x: im.x, big });
  }
  return { bodies, impacts, cues, pile };
};
