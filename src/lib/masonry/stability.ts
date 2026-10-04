// What stands. A block stands while its centre of mass is over what it rests on: blocks still
// standing, the base, an insert still in. Past the edge of that, it holds on by its mortar for
// a pixel or three (glued: it will not last), or because the wall over a gap leans on it
// (pinned: the arch), or it goes. Over a gap in running bond that leaves a stepped triangle
// to fall, closing about 47 degrees up each side, while the wall above arches over it; at the
// free top there is nothing to arch, and the gap opens upward into a V. Neither shape is drawn:
// both come of these rules, applied wave by wave until nothing more fails.

import { type Bond, insertOf } from "./types";

/** How a standing block stands, or how it fails. */
export type Class = "bedded" | "glued" | "pinned" | "drop" | "topple";

/** What still stands, by block, and which inserts are still in, by insert (1 = yes). */
export type State = { standing: Uint8Array; inserts: Uint8Array };

/** Mortar holds a block this far past the edge of its bed, px; and its centre must be this
 *  far inside the edge to count as bedded. */
export const GLUE = 3;
const EPS = 1;

/** A run of empty cells, course by column: its top course and its extent there, and whether
 *  the wall arches over it. */
export type Gap = { cells: number[]; top: number; a: number; b: number; arched: boolean };

type Cells = { nc: number; owner: Int16Array; insert: Int8Array };
const cellsCache = new WeakMap<Bond, Cells>();

/** Each course's middle row, column by column: which block or insert is there. */
const cellsOf = (bond: Bond): Cells => {
  const known = cellsCache.get(bond);
  if (known) return known;
  const { spec, owner: px, edges } = bond;
  const W = spec.w;
  const nc = edges.length - 1;
  const owner = new Int16Array(nc * W).fill(-1);
  const insert = new Int8Array(nc * W).fill(-1);
  for (let c = 0; c < nc; c++) {
    const y = Math.floor((edges[c] + edges[c + 1]) / 2);
    for (let x = 0; x < W; x++) {
      owner[c * W + x] = px[y * W + x];
      if (px[y * W + x] < 0) {
        insert[c * W + x] = spec.inserts.findIndex(
          ({ rect: r }) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h,
        );
      }
    }
  }
  const cells = { nc, owner, insert };
  cellsCache.set(bond, cells);
  return cells;
};

/** The gaps in the wall, and which gap each cell is in (-1 for none). */
export const gapsOf = (bond: Bond, state: State) => {
  const { nc, owner, insert } = cellsOf(bond);
  const { w: W, unit } = bond.spec;
  const empty = (k: number) =>
    owner[k] >= 0 ? !state.standing[owner[k]] : insert[k] >= 0 ? !state.inserts[insert[k]] : false;
  const gapOf = new Int32Array(nc * W).fill(-1);
  const gaps: Gap[] = [];
  for (let start = 0; start < nc * W; start++) {
    if (gapOf[start] >= 0 || !empty(start)) continue;
    const g: Gap = { cells: [], top: nc, a: W, b: -1, arched: false };
    const id = gaps.length;
    gapOf[start] = id;
    const queue = [start];
    while (queue.length) {
      const k = queue.pop() as number;
      g.cells.push(k);
      const x = k % W;
      const c = (k - x) / W;
      for (const [nc2, nx] of [
        [c, x - 1],
        [c, x + 1],
        [c - 1, x],
        [c + 1, x],
      ]) {
        if (nx < 0 || nx >= W || nc2 < 0 || nc2 >= nc) continue;
        const n = nc2 * W + nx;
        if (gapOf[n] < 0 && empty(n)) {
          gapOf[n] = id;
          queue.push(n);
        }
      }
    }
    for (const k of g.cells) g.top = Math.min(g.top, Math.floor(k / W));
    for (const k of g.cells) {
      if (Math.floor(k / W) !== g.top) continue;
      g.a = Math.min(g.a, k % W);
      g.b = Math.max(g.b, k % W);
    }
    gaps.push(g);
  }
  // Solid: no empty cell in that stretch of the course; past the wall's ends, the abutments.
  const solid = (c: number, x0: number, x1: number) => {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) if (empty(c * W + x)) return false;
    return true;
  };
  for (const g of gaps) {
    // The triangle over the gap closes after this many courses; the wall arches over it if
    // there is a course above where it closes, and masonry a block's length either side.
    const closes = Math.ceil((g.b - g.a + 1) / unit);
    const apex = g.top - closes;
    g.arched =
      g.top >= 1 &&
      apex >= 1 &&
      solid(apex - 1, g.a, g.b) &&
      solid(g.top, g.a - unit, g.a - 1) &&
      solid(g.top, g.b + 1, g.b + unit);
  }
  return { gaps, gapOf };
};

/** How each block stands or fails in `state` (undefined for those already down). `glue` is
 *  how far past its bed mortar holds a block. */
export const classify = (bond: Bond, state: State, glue = GLUE): (Class | undefined)[] => {
  const { blocks, spec } = bond;
  const W = spec.w;
  const { gaps, gapOf } = gapsOf(bond, state);
  const nc = bond.edges.length - 1;
  return blocks.map((b) => {
    if (!state.standing[b.i]) return undefined;
    let L = Infinity;
    let R = -Infinity;
    for (const c of b.bed) {
      // A block, an insert, or the base (always there).
      const k = insertOf(c.j);
      if (c.j >= 0 ? !state.standing[c.j] : k >= 0 && !state.inserts[k]) continue;
      L = Math.min(L, c.a);
      R = Math.max(R, c.b);
    }
    if (L > R) return "drop";
    if (b.cx >= L + EPS && b.cx <= R + 1 - EPS) return "bedded";
    const left = b.cx < L + EPS;
    const over = left ? L + EPS - b.cx : b.cx - (R + 1 - EPS);
    // Over an arched gap and carrying the wall above: the arch leans on it.
    const below = b.course + 1;
    const edge = left ? L - 1 : R + 1;
    if (below < nc && edge >= 0 && edge < W) {
      const g = gapOf[below * W + edge];
      const carries = b.top.some((c) => state.standing[c.j]);
      if (g >= 0 && gaps[g].arched && carries) return "pinned";
    }
    return over <= glue ? "glued" : "topple";
  });
};

/** One wave of a cascade: the blocks that fail together, and how. */
export type Wave = { i: number; kind: "drop" | "topple" }[];

/** Bring down whatever fails in `state`, wave after wave, until all that is left stands. */
export const settle = (bond: Bond, state: State, glue = GLUE) => {
  const standing = state.standing.slice();
  const waves: Wave[] = [];
  for (;;) {
    const classes = classify(bond, { standing, inserts: state.inserts }, glue);
    const wave: Wave = [];
    classes.forEach((c, i) => {
      if (c === "drop" || c === "topple") wave.push({ i, kind: c });
    });
    if (!wave.length) break;
    for (const { i } of wave) standing[i] = 0;
    waves.push(wave);
  }
  return { waves, standing };
};
