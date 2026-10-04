// The rubble at a wall's foot, as it builds up: a height field over (x, depth) in small cells,
// each knowing what lies on it and since when. A block coming to rest lies on the highest of
// what is under its footprint, then rolls on down the heap while the slope there is steeper
// than rubble stands (about 40 degrees). In time each piece sinks into the ground (it is
// mossing over, being buried), and whatever lies on it rides down with it: nothing is left
// floating over a piece that has sunk.

import { smooth } from "$lib/scene/pixel";

const CELL = 2;
/** Shifts tried, px, and the directions: out from the wall, and either way along it. */
const SHIFTS = [2, 4, 8, 12];
const DIRS: [number, number][] = [
  [0, 1],
  [1, 0],
  [-1, 0],
];

/** A piece at rest: its footprint, its base and top above the ground, when it came to rest,
 *  and what it rests on (with how far each had sunk then). */
export type Lying = {
  id: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  base: number;
  top: number;
  rest: number;
  under: { id: number; at: number }[];
};

export type Pile = {
  w: number;
  depth: number;
  /** Sinking starts this long after a piece comes to rest, s, and takes this long. */
  sink: [number, number];
  repose: number;
  cells: number[][];
  lying: Lying[];
  byId: Map<number, Lying>;
  /** The highest any piece has ever stood, for a quick "nowhere near the heap". */
  top: number;
  /** Sinking worked out at one moment, kept while that moment is asked about; and a stamp
   *  per piece, for counting each once over a footprint. */
  memo: { t: number; sink: Map<number, number> };
  stamp: Int32Array;
  stamps: number;
};

export const pileOf = (w: number, depth: number, sink: [number, number], repose: number): Pile => ({
  w,
  depth,
  sink,
  repose,
  cells: Array.from({ length: Math.ceil(w / CELL) * Math.ceil((depth + 1) / CELL) }, () => []),
  lying: [],
  byId: new Map(),
  top: 0,
  memo: { t: NaN, sink: new Map() },
  stamp: new Int32Array(64),
  stamps: 0,
});

const nzOf = (p: Pile) => Math.ceil((p.depth + 1) / CELL);

/** How far piece `l` has sunk by `t`: on its own schedule, or as far as what it lies on has
 *  sunk since it came to rest on it, whichever is more. */
export const sinkOf = (p: Pile, l: Lying, t: number): number => {
  if (t <= l.rest) return 0;
  if (p.memo.t !== t) p.memo = { t, sink: new Map() };
  const known = p.memo.sink.get(l.id);
  if (known !== undefined) return known;
  const [from, over] = p.sink;
  let s = smooth((t - l.rest - from) / over) * l.top;
  for (const u of l.under) {
    const below = p.byId.get(u.id);
    if (below) s = Math.max(s, sinkOf(p, below, t) - u.at);
  }
  s = Math.min(s, l.top);
  p.memo.sink.set(l.id, s);
  return s;
};

/** Whether piece `l` has gone into the ground by `t`. */
export const sunkBy = (p: Pile, l: Lying, t: number) => sinkOf(p, l, t) >= l.top - 1e-6;

/** The height of the heap over a footprint at `t`: the highest top among the pieces there that
 *  had come to rest, less how far each has sunk. The ground is 0. */
export const heightOver = (p: Pile, x0: number, x1: number, z0: number, z1: number, t: number) => {
  const nz = nzOf(p);
  const nx = Math.ceil(p.w / CELL);
  let h = 0;
  const stamp = ++p.stamps;
  for (
    let ix = Math.max(0, Math.floor(x0 / CELL));
    ix <= Math.min(nx - 1, Math.floor(x1 / CELL));
    ix++
  ) {
    for (
      let iz = Math.max(0, Math.floor(z0 / CELL));
      iz <= Math.min(nz - 1, Math.floor(z1 / CELL));
      iz++
    ) {
      for (const id of p.cells[ix * nz + iz]) {
        if (p.stamp[id] === stamp) continue;
        p.stamp[id] = stamp;
        const l = p.byId.get(id) as Lying;
        if (l.rest <= t) h = Math.max(h, l.top - sinkOf(p, l, t));
      }
    }
  }
  return h;
};

/** Where a piece `w` by `d` landing centred at `x`, `z` comes to rest at `t`: rolled downhill
 *  while the heap is steeper than repose, never in toward the wall or past the heap's edges. */
export const restingPlace = (p: Pile, x: number, z: number, w: number, d: number, t: number) => {
  const clampX = (v: number) => Math.min(p.w - w / 2, Math.max(w / 2, v));
  const clampZ = (v: number) => Math.min(p.depth - d / 2, Math.max(d / 2, v));
  let [cx, cz] = [clampX(x), clampZ(z)];
  const at = (px: number, pz: number) =>
    heightOver(p, px - w / 2, px + w / 2 - 1, pz - d / 2, pz + d / 2 - 1, t);
  for (let step = 0; step < 40; step++) {
    const here = at(cx, cz);
    let best: [number, number] | null = null;
    let steepest = p.repose;
    for (const s of SHIFTS) {
      for (const [dx, dz] of DIRS) {
        const [nx, nz] = [clampX(cx + dx * s), clampZ(cz + dz * s)];
        if (nx === cx && nz === cz) continue;
        const slope = (here - at(nx, nz)) / s;
        if (slope > steepest + 1e-9) [best, steepest] = [[nx, nz], slope];
      }
    }
    if (!best) break;
    [cx, cz] = best;
  }
  return { x: cx, z: cz, base: at(cx, cz) };
};

/** Lay piece `id` at rest at `t`, `w` by `d` centred at `x`, `z`, on `base`, `T` thick. */
export const lay = (
  p: Pile,
  id: number,
  x: number,
  z: number,
  w: number,
  d: number,
  base: number,
  T: number,
  t: number,
) => {
  const nz = nzOf(p);
  const nx = Math.ceil(p.w / CELL);
  const l: Lying = {
    id,
    x0: x - w / 2,
    x1: x + w / 2 - 1,
    z0: z - d / 2,
    z1: z + d / 2 - 1,
    base,
    top: base + T,
    rest: t,
    under: [],
  };
  const under = new Set<number>();
  for (
    let ix = Math.max(0, Math.floor(l.x0 / CELL));
    ix <= Math.min(nx - 1, Math.floor(l.x1 / CELL));
    ix++
  ) {
    for (
      let iz = Math.max(0, Math.floor(l.z0 / CELL));
      iz <= Math.min(nz - 1, Math.floor(l.z1 / CELL));
      iz++
    ) {
      const cell = p.cells[ix * nz + iz];
      for (const o of cell) {
        const other = p.byId.get(o) as Lying;
        if (other.rest <= t && other.top - sinkOf(p, other, t) >= base - 0.5) under.add(o);
      }
      cell.push(id);
    }
  }
  l.under = [...under].map((o) => ({ id: o, at: sinkOf(p, p.byId.get(o) as Lying, t) }));
  p.lying.push(l);
  p.byId.set(id, l);
  p.top = Math.max(p.top, l.top);
  if (id >= p.stamp.length) {
    const grown = new Int32Array(Math.max(id + 1, p.stamp.length * 2));
    grown.set(p.stamp);
    p.stamp = grown;
  }
  p.memo = { t: NaN, sink: new Map() };
  return l;
};
