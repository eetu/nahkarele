// A ruin baked once from its spec and seed: every block's release, in time order, worked out
// by stepping from event to event. An event is a collapse knocking blocks off the wall's top,
// a blow given as input, or a block whose hazard reaches its threshold. After each, what no
// longer stands comes down: what lost its bed a moment after that bed went, the rest in waves
// a fraction of a second apart; inserts go when what holds them goes, and the exposure of what
// is left is brought up to date. Hung things go with the block above them, or once most of the
// wall behind them has gone.

import { hash } from "$lib/scene/pixel";

import { layBond } from "./bond";
import {
  type Collapse,
  exposureOf,
  PACE,
  type Pace,
  reachOf,
  scheduleOf,
  shockOf,
  soundOf,
  wearOf,
} from "./decay";
import type { Pile } from "./pile";
import { bakeRubble, type Body, type Cue, type Impact } from "./rubble";
import { bakeSkin, type Skin } from "./skin";
import { classify, settle } from "./stability";
import { type Bond, insertOf, insertRef, type Spec } from "./types";

/** How long the bake looks ahead, s: past this, nothing more is worked out. */
export const HORIZON = 1e6;
/** A piece whose bed has just gone goes this soon after it, s (from, plus up to): before what
 *  was under it has cleared the wall, so the fall can start the moment it has. */
const FOLLOW: [number, number] = [0.02, 0.03];
/** Waves of a cascade that nothing gave way under (an arch failing) follow each other this far
 *  apart, s (from, plus up to). */
const WAVE: [number, number] = [0.12, 0.23];
/** An insert goes this long after what held it, s. */
const LETGO = 0.15;

/**
 * How a block leaves the wall: knocked off by a collapse or a blow; worked loose with its top
 * free (it tips out); slipped out from under what rests on it; dropped with nothing under it;
 * toppled over the edge of its bed.
 */
export type Kind = "knock" | "weather" | "slip" | "drop" | "topple";

/** A block leaving the wall: when, how, which way (1 toward the viewer, -1 away), and
 *  whether it wore loose (it cracks and shakes first) rather than being brought down; if it
 *  did, since when it wore at the pace that took it (the last fall next to it), which its
 *  crack never shows before. */
export type Release = {
  i: number;
  t: number;
  kind: Kind;
  dir: 1 | -1;
  worn?: boolean;
  exposed?: number;
};

export type Ruin = {
  spec: Spec;
  seed: number;
  pace: Pace;
  bond: Bond;
  /** Blocks that stand for good. */
  sound: Uint8Array;
  collapses: Collapse[];
  /** Every release, in time order; and each block's, each insert's and each hung thing's time
   *  of going (Infinity for never). */
  releases: Release[];
  releaseAt: Float64Array;
  insertAt: Float64Array;
  hangAt: Record<string, number>;
  /** What came off, falling and fallen, in the order it left the wall; and in the order it
   *  came to rest. */
  bodies: Body[];
  settled: Body[];
  impacts: Impact[];
  cues: Cue[];
  pile: Pile;
  /** The plaster over its face, if it has any. */
  skin: Skin | null;
};

/** Which way a block goes when nothing pushes it: a little more often into the room. */
const dirOf = (seed: number, i: number, t: number): 1 | -1 =>
  hash(seed, i, Math.floor(t), 35) < 0.55 ? 1 : -1;

/** Bake `spec`'s ruin for `seed`. */
export const bake = (spec: Spec, seed: number, pace: Pace = PACE): Ruin => {
  const bond = layBond(spec, seed);
  const { blocks, owner } = bond;
  const W = spec.w;
  const n = blocks.length;
  const collapses = scheduleOf(spec, seed, pace, spec.knocks);
  const knocks = (spec.knocks ?? [])
    .filter((k) => k.kind === "block" && k.x >= 0 && k.x < W && k.y >= 0 && k.y < spec.h)
    .sort((a, b) => a.t - b.t);
  const sound = soundOf(bond, seed, pace);
  const standing = new Uint8Array(n).fill(1);
  const inserts = new Uint8Array(spec.inserts.length).fill(1);
  const releaseAt = new Float64Array(n).fill(Infinity);
  const insertAt = new Float64Array(spec.inserts.length).fill(Infinity);
  const releases: Release[] = [];

  // Each block's threshold, the collapses that shake it and how hard (one that reaches it at
  // under 5% of full strength adds a hundredth of a threshold at most: left out), and the
  // blast's start.
  const E = Float64Array.from(blocks, (b) => -Math.log(1 - hash(seed, b.i, 31)));
  const shakes = blocks.map((b) =>
    collapses.map((c, k) => [k, reachOf(c, b.cx, b.cy, pace)] as const).filter(([, a]) => a > 0.05),
  );
  const H = new Float64Array(n);
  const blast = collapses.filter((c) => c.t < 5 && !c.given);
  for (const b of blocks) {
    const near = Math.max(0, ...blast.map((c) => reachOf(c, b.cx, b.cy, pace)));
    H[b.i] = sound[b.i] ? 0 : pace.blast * E[b.i] * near;
  }
  const since = new Float64Array(n);
  const m = new Float64Array(n);
  const due = new Float64Array(n).fill(Infinity);
  const gathered = (i: number, from: number, to: number) => {
    let s = wearOf(to, pace) - wearOf(from, pace);
    for (const [k, a] of shakes[i]) {
      s += a * (shockOf(collapses[k], to, pace) - shockOf(collapses[k], from, pace));
    }
    return m[i] * s;
  };
  // When block i's hazard reaches its threshold, at its present exposure.
  const solve = (i: number) => {
    if (!m[i] || H[i] + gathered(i, since[i], HORIZON) < E[i]) return Infinity;
    const reached = (t: number) => H[i] + gathered(i, since[i], t) >= E[i];
    // Out in doubling steps until it is reached, then halve the step to a fiftieth of a second.
    let lo = since[i];
    let step = 1;
    while (lo + step < HORIZON && !reached(lo + step)) {
      lo += step;
      step *= 2;
    }
    let hi = Math.min(HORIZON, lo + step);
    while (hi - lo > 0.02) {
      const mid = (lo + hi) / 2;
      if (reached(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  let classes = classify(bond, { standing, inserts }, pace.glue);
  // Exposure changes only next to what went, or where a piece's class changed: only those are
  // looked at again. The neighbours of each piece, and of each insert, once.
  const near = blocks.map((b) => [
    ...new Set([...b.bed, ...b.top, ...b.heads].map((c) => c.j).filter((j) => j >= 0)),
  ]);
  const byInsert = spec.inserts.map((_, k) =>
    blocks
      .filter((b) => [...b.bed, ...b.heads, ...b.caps].some((c) => c.j === insertRef(k)))
      .map((b) => b.i),
  );
  const insertsBy = blocks.map((b) => byInsert.flatMap((on, k) => (on.includes(b.i) ? [k] : [])));
  // When block i's exposure changed, as of event `t`: when the last of what went next to it
  // went, which in this event's fall is a moment after the event.
  const changedAt = (i: number, t: number) => {
    let at = t;
    for (const j of near[i]) if (Number.isFinite(releaseAt[j])) at = Math.max(at, releaseAt[j]);
    for (const k of insertsBy[i]) if (Number.isFinite(insertAt[k])) at = Math.max(at, insertAt[k]);
    return at;
  };
  const dirty = new Set<number>(blocks.map((b) => b.i));
  const refresh = (t: number, settled?: typeof classes) => {
    const next = settled ?? classify(bond, { standing, inserts }, pace.glue);
    for (let i = 0; i < n; i++) if (next[i] !== classes[i]) dirty.add(i);
    classes = next;
    for (const i of dirty) {
      if (!standing[i] || sound[i]) continue;
      const exposed = exposureOf(bond, i, { standing, inserts }, classes, pace);
      if (exposed === m[i] && due[i] !== Infinity) continue;
      const from = Math.max(since[i], changedAt(i, t));
      H[i] += gathered(i, since[i], from);
      since[i] = from;
      m[i] = exposed;
      due[i] = Math.max(from + 1e-3, solve(i));
    }
    dirty.clear();
  };

  const release = (i: number, t: number, kind: Kind, dir: 1 | -1, worn = false) => {
    for (const j of near[i]) dirty.add(j);
    standing[i] = 0;
    releaseAt[i] = t;
    due[i] = Infinity;
    releases.push(worn ? { i, t, kind, dir, worn, exposed: since[i] } : { i, t, kind, dir });
  };
  // What holds an insert: the block over its middle, the blocks at its sides, and (all of
  // them together) what it sits on.
  const holders = spec.inserts.map(({ rect: r }, k) => {
    const at = (x: number, y: number) =>
      x >= 0 && x < W && y >= 0 && y < spec.h ? owner[Math.floor(y) * W + Math.floor(x)] : -1;
    const any = [
      at(r.x + r.w / 2, r.y - 3),
      at(r.x - 3, r.y + r.h / 2),
      at(r.x + r.w + 2, r.y + r.h / 2),
    ].filter((o) => o >= 0);
    const under = blocks.filter((b) => b.caps.some((c) => c.j === insertRef(k))).map((b) => b.i);
    return { any, under };
  });
  // Bring down whatever no longer stands, wave by wave; let go of inserts whose holders went.
  const cascade = (t: number) => {
    for (let round = 0; round < 8; round++) {
      const { waves, classes: after } = settle(bond, { standing, inserts }, pace.glue);
      let at = t;
      waves.forEach((wave, w) => {
        at += WAVE[0] + WAVE[1] * hash(seed, w, Math.floor(t * 8), 33);
        for (const { i, kind } of wave) {
          // Brought down by what it rested on going, now: just after it. Otherwise with its
          // wave, and never before what it rested on has gone.
          let lost = -Infinity;
          for (const c of blocks[i].bed) {
            const k = insertOf(c.j);
            const went = c.j >= 0 ? releaseAt[c.j] : k >= 0 ? insertAt[k] : -Infinity;
            if (Number.isFinite(went)) lost = Math.max(lost, went);
          }
          const follows = lost >= t;
          const from = follows ? lost + FOLLOW[0] : Math.max(at, lost + WAVE[0]);
          const when = from + (follows ? FOLLOW[1] : 0.1) * hash(seed, i, 34);
          release(i, when, kind, dirOf(seed, i, from));
        }
      });
      let loose = false;
      holders.forEach(({ any, under }, k) => {
        if (!inserts[k]) return;
        const sunk = under.length > 0 && under.every((i) => !standing[i]);
        const gone = [...any.filter((i) => !standing[i]), ...(sunk ? under : [])];
        if (!gone.length) return;
        inserts[k] = 0;
        insertAt[k] = Math.min(...gone.map((i) => releaseAt[i])) + LETGO;
        for (const i of byInsert[k]) dirty.add(i);
        loose = true;
      });
      if (!loose) return after;
      t = Math.max(t, ...insertAt.filter(Number.isFinite));
    }
    return undefined;
  };
  // What a collapse knocks off: in each column of its band, the standing wall from its top
  // down to `depth` px (whatever pieces that takes), the nearest first, each piece as far from
  // where it hit as its nearest column.
  const knockedBy = (c: Collapse) => {
    const hit = new Map<number, number>();
    for (let x = Math.max(0, Math.round(c.x - c.w / 2)); x < Math.min(W, c.x + c.w / 2); x++) {
      let top = -1;
      for (let y = 0; y < spec.h; y++) {
        const o = owner[y * W + x];
        // A bite from the top stops at an opening.
        if (o < 0) break;
        if (!standing[o]) continue;
        // The roof bears on the wall's top: below its reach there is nothing to bite.
        if (y >= pace.bite) break;
        if (top < 0) top = y;
        if (y - top >= c.depth) break;
        const off = Math.min(1, Math.abs(x - c.x) / (c.w / 2));
        if (!sound[o]) hit.set(o, Math.min(hit.get(o) ?? 1, off));
      }
    }
    return [...hit].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  };

  refresh(0);
  let ci = 0;
  let ki = 0;
  for (let guard = 0; guard < 10 * n + 100; guard++) {
    let di = -1;
    for (let i = 0; i < n; i++) if (standing[i] && (di < 0 || due[i] < due[di])) di = i;
    const tc = collapses[ci]?.t ?? Infinity;
    const tk = knocks[ki]?.t ?? Infinity;
    const td = di >= 0 ? due[di] : Infinity;
    const t = Math.min(tc, tk, td);
    if (!(t <= HORIZON)) break;
    if (t === tc) {
      const c = collapses[ci++];
      for (const [i, off] of knockedBy(c)) release(i, c.t + 0.3 * off, "knock", c.dir);
    } else if (t === tk) {
      const k = knocks[ki++];
      const o = owner[Math.floor(k.y) * W + Math.floor(k.x)];
      if (o >= 0 && standing[o]) release(o, k.t, "knock", 1);
    } else {
      // Worn loose: over an edge it topples, under a load it slips out, free it tips out.
      const held = blocks[di].top.some((c) => standing[c.j]);
      const how = classes[di] === "glued" ? "topple" : held ? "slip" : "weather";
      release(di, t, how, dirOf(seed, di, t), true);
    }
    refresh(t, cascade(t));
  }
  releases.sort((a, b) => a.t - b.t || a.i - b.i);

  // Hung things go with the block over them, or once half the wall behind them has gone.
  const hangAt: Record<string, number> = {};
  for (const { name, rect: r } of spec.hangs) {
    const cx = Math.round(r.x + r.w / 2);
    let above = -1;
    for (let y = r.y - 3; y >= 0 && above < 0; y--) above = owner[y * W + cx];
    if (above < 0 && r.y >= 0 && r.y < spec.h) above = owner[r.y * W + cx];
    const behind: number[] = [];
    for (let y = Math.max(0, r.y); y < Math.min(spec.h, r.y + r.h); y++) {
      for (let x = Math.max(0, r.x); x < Math.min(W, r.x + r.w); x++) {
        const o = owner[y * W + x];
        if (o >= 0) behind.push(releaseAt[o]);
      }
    }
    behind.sort((a, b) => a - b);
    const half = behind.length ? behind[Math.ceil(behind.length / 2) - 1] : Infinity;
    hangAt[name] = Math.min(above >= 0 ? releaseAt[above] : Infinity, half) + LETGO;
  }
  const rubble = bakeRubble(bond, seed, pace, releases, releaseAt, insertAt);
  // In the order they set off: a broken block's pieces set off when it lands, after blocks
  // released since; reading what moves relies on this order.
  rubble.bodies.sort((a, b) => a.start - b.start || a.id - b.id);
  const settled = rubble.bodies
    .filter((b) => Number.isFinite(b.settled))
    .sort((a, b) => a.settled - b.settled || a.id - b.id);
  return {
    spec,
    seed,
    pace,
    bond,
    sound,
    collapses,
    releases,
    releaseAt,
    insertAt,
    hangAt,
    ...rubble,
    settled,
    skin: spec.plaster ? bakeSkin(bond, seed, releaseAt) : null,
  };
};
