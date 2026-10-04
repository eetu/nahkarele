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
export type Gap = { top: number; a: number; b: number; arched: boolean };

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

/** Buffers for finding gaps, kept between calls: asked thousands of times a bake. */
let scratch: { gapOf: Int32Array; empty: Uint8Array; stack: Int32Array } | null = null;

/**
 * The gaps in the wall, and which gap each cell is in (-1 for none). The cell map is shared
 * between calls: it holds until the next.
 */
export const gapsOf = (bond: Bond, state: State) => {
  const { nc, owner, insert } = cellsOf(bond);
  const { w: W, unit } = bond.spec;
  const N = nc * W;
  if (!scratch || scratch.gapOf.length < N) {
    scratch = { gapOf: new Int32Array(N), empty: new Uint8Array(N), stack: new Int32Array(N) };
  }
  const { empty, stack } = scratch;
  const gapOf = scratch.gapOf.subarray(0, N);
  for (let k = 0; k < N; k++) {
    const o = owner[k];
    const i = insert[k];
    empty[k] = o >= 0 ? (state.standing[o] ? 0 : 1) : i >= 0 ? (state.inserts[i] ? 0 : 1) : 0;
  }
  gapOf.fill(-1);
  const gaps: Gap[] = [];
  for (let start = 0; start < N; start++) {
    if (!empty[start] || gapOf[start] >= 0) continue;
    const id = gaps.length;
    const g: Gap = { top: nc, a: W, b: -1, arched: false };
    let sp = 0;
    stack[sp++] = start;
    gapOf[start] = id;
    while (sp) {
      const k = stack[--sp];
      const x = k % W;
      const c = (k - x) / W;
      // Its top course, and its extent there, as it fills.
      if (c < g.top) [g.top, g.a, g.b] = [c, x, x];
      else if (c === g.top) [g.a, g.b] = [Math.min(g.a, x), Math.max(g.b, x)];
      const push = (n: number) => {
        if (empty[n] && gapOf[n] < 0) {
          gapOf[n] = id;
          stack[sp++] = n;
        }
      };
      if (x > 0) push(k - 1);
      if (x < W - 1) push(k + 1);
      if (c > 0) push(k - W);
      if (c < nc - 1) push(k + W);
    }
    gaps.push(g);
  }
  // Solid: no empty cell in that stretch of the course; past the wall's ends, the abutments.
  const solid = (c: number, x0: number, x1: number) => {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) if (empty[c * W + x]) return false;
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

/** Marks for `archesOf`, kept between calls, and a stamp that makes old marks stale. */
let lazy: { mark: Int32Array; stack: Int32Array; seen: Int32Array; stamp: number } | null = null;

/**
 * Whether the gap at cell `k` is arched, found only for the gaps asked about and only as far
 * as needed: filling upward first, a gap that reaches the top course has its answer (no arch)
 * at once, and so does one that runs into a gap already found open. What is found is kept for
 * the rest of the call. The answer for a gap is the same as `gapsOf` gives.
 */
const archesOf = (bond: Bond, state: State) => {
  const { nc, owner, insert } = cellsOf(bond);
  const { w: W, unit } = bond.spec;
  const N = nc * W;
  if (!lazy || lazy.mark.length < N || lazy.stamp > 2 ** 30) {
    lazy = { mark: new Int32Array(N), stack: new Int32Array(N), seen: new Int32Array(N), stamp: 0 };
  }
  const L = lazy;
  L.stamp += 4;
  const base = L.stamp;
  const [VISITED, OPEN, ARCHED] = [base + 1, base + 2, base + 3];
  const empty = (k: number) => {
    const o = owner[k];
    const i = insert[k];
    return o >= 0 ? !state.standing[o] : i >= 0 ? !state.inserts[i] : false;
  };
  const solid = (c: number, x0: number, x1: number) => {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) if (empty(c * W + x)) return false;
    return true;
  };
  return (start: number) => {
    if (!empty(start)) return false;
    if (L.mark[start] === OPEN) return false;
    if (L.mark[start] === ARCHED) return true;
    let sp = 0;
    let seen = 0;
    let open = false;
    let [top, a, b] = [nc, W, -1];
    L.stack[sp++] = start;
    L.mark[start] = VISITED;
    while (sp && !open) {
      const k = L.stack[--sp];
      L.seen[seen++] = k;
      const x = k % W;
      const c = (k - x) / W;
      if (c === 0) open = true;
      if (c < top) [top, a, b] = [c, x, x];
      else if (c === top) [a, b] = [Math.min(a, x), Math.max(b, x)];
      // Down and along first on the stack, so up is tried first.
      for (const n of [
        c < nc - 1 ? k + W : -1,
        x > 0 ? k - 1 : -1,
        x < W - 1 ? k + 1 : -1,
        c > 0 ? k - W : -1,
      ]) {
        if (n < 0 || !empty(n)) continue;
        const m = L.mark[n];
        if (m === OPEN) {
          open = true;
          break;
        }
        if (m === VISITED) continue;
        L.mark[n] = VISITED;
        L.stack[sp++] = n;
      }
    }
    let arched = false;
    if (!open) {
      const closes = Math.ceil((b - a + 1) / unit);
      const apex = top - closes;
      arched =
        top >= 1 &&
        apex >= 1 &&
        solid(apex - 1, a, b) &&
        solid(top, a - unit, a - 1) &&
        solid(top, b + 1, b + unit);
    }
    // What was reached is settled; what was pushed but not reached is left to be asked again.
    for (let s = 0; s < seen; s++) L.mark[L.seen[s]] = arched ? ARCHED : OPEN;
    while (sp) L.mark[L.stack[--sp]] = 0;
    return arched;
  };
};

/** How each block stands or fails in `state` (undefined for those already down). `glue` is
 *  how far past its bed mortar holds a block. */
export const classify = (bond: Bond, state: State, glue = GLUE): (Class | undefined)[] => {
  const { blocks, spec } = bond;
  const W = spec.w;
  const arched = archesOf(bond, state);
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
      const carries = b.top.some((c) => state.standing[c.j]);
      if (carries && arched(below * W + edge)) return "pinned";
    }
    return over <= glue ? "glued" : "topple";
  });
};

/** One wave of a cascade: the blocks that fail together, and how. */
export type Wave = { i: number; kind: "drop" | "topple" }[];

/** Bring down whatever fails in `state`, wave after wave, until all that is left stands; with
 *  how that last stands. */
export const settle = (bond: Bond, state: State, glue = GLUE) => {
  const standing = state.standing.slice();
  const waves: Wave[] = [];
  for (;;) {
    const classes = classify(bond, { standing, inserts: state.inserts }, glue);
    const wave: Wave = [];
    classes.forEach((c, i) => {
      if (c === "drop" || c === "topple") wave.push({ i, kind: c });
    });
    if (!wave.length) return { waves, standing, classes };
    for (const { i } of wave) standing[i] = 0;
    waves.push(wave);
  }
};
