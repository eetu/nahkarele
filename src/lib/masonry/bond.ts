// Laying a wall: courses of blocks in running bond, each course half a block along from the one
// below, joints wandering a little off straight, and here and there a half block (a bat) where
// it breaks no joint above or below. Then what touches what: what each block rests on (its
// bed), what rests on it, and its neighbours in the course.

import { hash } from "$lib/scene/pixel";

import { wander } from "./rand";
import { ABUT, BASE, type Block, type Bond, type Contact, insertRef, type Spec } from "./types";

/** A piece of a block smaller than this, px, or thinner than MIN_SIDE either way, is a scrap:
 *  it joins the neighbour it shares the most edge with. */
const MIN_PX = 12;
const MIN_SIDE = 5;
/** A head joint lands up to this far off true, px, and never nearer a wall's end than END. */
const JOG = 3;
const END = 6;
/** About this share of blocks are laid as two halves, where no joint above or below is within
 *  CLEAR px of the split. */
const BATS = 0.07;
const CLEAR = 4;
/** Blocks hold each other where they share at least this much edge, px; less is a crack. */
export const HOLD = 3;

const inside = (
  { x, y, w, h }: { x: number; y: number; w: number; h: number },
  px: number,
  py: number,
) => px >= x && px < x + w && py >= y && py < y + h;

/** The rows of each course, top to bottom: whole courses up from the base, and what is left
 *  over at the top (or folded into the course below, if that is too thin to lay). */
const coursesOf = (h: number, course: number) => {
  const edges = [h];
  while (edges[0] - course > 0) edges.unshift(edges[0] - course);
  if (edges[0] < course / 2 && edges.length > 1) edges.shift();
  edges.unshift(0);
  return edges;
};

/** Where each course's head joints fall, left to right. */
const jointsOf = (spec: Spec, seed: number, nc: number) => {
  const { w: W, unit } = spec;
  const joints: number[][] = [];
  for (let c = 0; c < nc; c++) {
    // Counted from the base, every other course starts half a block along.
    const off = (((nc - 1 - c) % 2) * unit) / 2;
    const xs: number[] = [];
    for (let j = 0; j * unit - off < W; j++) {
      const x = j * unit - off + (hash(seed, c, j, 1) - 0.5) * 2 * JOG;
      if (x > END && x < W - END) xs.push(x);
    }
    joints.push(xs);
  }
  // Bats, where the split lines up with no joint in the courses either side.
  for (let c = 0; c < nc; c++) {
    const all = [0, ...joints[c], W];
    const bats: number[] = [];
    for (let k = 0; k + 1 < all.length; k++) {
      const [l, r] = [all[k], all[k + 1]];
      if (r - l < unit * 0.8 || hash(seed, c, k, 2) >= BATS) continue;
      const m = (l + r) / 2 + (hash(seed, c, k, 3) - 0.5) * 4;
      const near = (row?: number[]) => row?.some((x) => Math.abs(x - m) < CLEAR) ?? false;
      if (!near(joints[c - 1]) && !near(joints[c + 1])) bats.push(m);
    }
    joints[c] = [...joints[c], ...bats].sort((a, b) => a - b);
  }
  return joints;
};

/** Lay `spec`'s wall for `seed`. */
export const layBond = (spec: Spec, seed: number): Bond => {
  const { w: W, h: H, rough } = spec;
  const edges = coursesOf(H, spec.course);
  const nc = edges.length - 1;
  const joints = jointsOf(spec, seed, nc);
  // The joints as laid: each bed joint's row along x, each head joint's column down y.
  const beds = edges.map((e, k) =>
    Float32Array.from({ length: W }, (_, x) =>
      k === 0 ? -Infinity : k === nc ? Infinity : e + rough * wander(x / 5, seed, 100 + k),
    ),
  );
  const heads = joints.map((xs, c) =>
    xs.map((x0, k) =>
      Float32Array.from(
        { length: H },
        (_, y) => x0 + rough * wander(y / 4, seed, 200 + c * 64 + k),
      ),
    ),
  );
  const first: number[] = [];
  let ids = 0;
  for (let c = 0; c < nc; c++) {
    first.push(ids);
    ids += joints[c].length + 1;
  }
  const courseOfId = new Int16Array(ids);
  for (let c = 0; c < nc; c++) courseOfId.fill(c, first[c], first[c] + joints[c].length + 1);
  // Each pixel to its course, then to its block in the course; openings to nobody.
  const raw = new Int32Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (spec.inserts.some(({ rect }) => inside(rect, x, y))) continue;
      let c = 0;
      while (c + 1 < nc && y + 0.5 >= beds[c + 1][x]) c++;
      let k = 0;
      while (k < heads[c].length && x + 0.5 >= heads[c][k][y]) k++;
      raw[y * W + x] = first[c] + k;
    }
  }
  const parts = partsOf(raw, W, H, courseOfId);
  foldScraps(parts, raw, W, H);
  return withContacts(spec, edges, raw, parts);
};

type Part = { id: number; course: number; px: number[] };

/** Each block's connected pieces, as parts of their own; `raw` is relabelled to part ids. */
const partsOf = (raw: Int32Array, W: number, H: number, courseOfId: Int16Array) => {
  const part = new Int32Array(W * H).fill(-1);
  const parts: Part[] = [];
  const queue: number[] = [];
  for (let start = 0; start < W * H; start++) {
    const id = raw[start];
    if (id < 0 || part[start] >= 0) continue;
    const p: Part = { id: parts.length, course: courseOfId[id], px: [] };
    part[start] = p.id;
    queue.push(start);
    while (queue.length) {
      const q = queue.pop() as number;
      p.px.push(q);
      const x = q % W;
      const y = (q - x) / W;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (raw[n] === id && part[n] < 0) {
          part[n] = p.id;
          queue.push(n);
        }
      }
    }
    parts.push(p);
  }
  raw.set(part);
  return parts;
};

const boxOf = (px: number[], W: number) => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const q of px) {
    const x = q % W;
    const y = (q - x) / W;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};

/** Fold every scrap into the neighbour it shares the most edge with, a neighbour in its own
 *  course counting half again: a sliver over a window joins the block over it, a sliver at a
 *  window's side the block beside it. */
const foldScraps = (parts: Part[], raw: Int32Array, W: number, H: number) => {
  for (let pass = 0; pass < 4; pass++) {
    const small = parts
      .filter((p) => {
        if (!p.px.length) return false;
        const b = boxOf(p.px, W);
        return p.px.length < MIN_PX || b.w < MIN_SIDE || b.h < MIN_SIDE;
      })
      .sort((a, b) => a.px.length - b.px.length || a.id - b.id);
    if (!small.length) return;
    for (const p of small) {
      if (!p.px.length) continue;
      const edge = new Map<number, number>();
      for (const q of p.px) {
        const x = q % W;
        const y = (q - x) / W;
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const o = raw[ny * W + nx];
          if (o >= 0 && o !== p.id) edge.set(o, (edge.get(o) ?? 0) + 1);
        }
      }
      let best = -1;
      let score = 0;
      for (const [o, n] of [...edge].sort((a, b) => a[0] - b[0])) {
        const s = n * (parts[o].course === p.course ? 1.5 : 1);
        if (s > score) [best, score] = [o, s];
      }
      if (best < 0) continue;
      for (const q of p.px) raw[q] = best;
      parts[best].px.push(...p.px);
      p.px = [];
    }
  }
};

/** Number the blocks top to bottom, left to right, and find what touches what. */
const withContacts = (spec: Spec, edges: number[], raw: Int32Array, parts: Part[]): Bond => {
  const { w: W, h: H } = spec;
  const kept = parts
    .filter((p) => p.px.length)
    .map((p) => ({ p, box: boxOf(p.px, W) }))
    .sort((a, b) => a.p.course - b.p.course || a.box.x - b.box.x || a.box.y - b.box.y);
  const renumber = new Int32Array(parts.length).fill(-1);
  kept.forEach(({ p }, i) => (renumber[p.id] = i));
  const owner = new Int16Array(W * H).fill(-1);
  for (let q = 0; q < W * H; q++) if (raw[q] >= 0) owner[q] = renumber[raw[q]];
  const blocks: Block[] = kept.map(({ p, box }, i) => {
    const px = Int32Array.from(p.px).sort();
    let sx = 0;
    let sy = 0;
    for (const q of px) {
      const x = q % W;
      sx += x;
      sy += (q - x) / W;
    }
    return {
      i,
      course: p.course,
      ...box,
      n: px.length,
      cx: sx / px.length + 0.5,
      cy: sy / px.length + 0.5,
      px,
      bed: [],
      top: [],
      heads: [],
    };
  });
  // Shared edges, pixel by pixel: under a block (another block, an insert, or the base) and
  // beside it (another block, or an abutment at the wall's end).
  const beds = blocks.map(() => new Map<number, Contact>());
  const sides = blocks.map(() => new Map<number, Contact>());
  const add = (m: Map<number, Contact>, j: number, at: number) => {
    const c = m.get(j);
    if (c) {
      c.a = Math.min(c.a, at);
      c.b = Math.max(c.b, at);
      c.n++;
    } else m.set(j, { j, a: at, b: at, n: 1 });
  };
  const insertAt = (x: number, y: number) =>
    spec.inserts.findIndex(({ rect }) => inside(rect, x, y));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = owner[y * W + x];
      if (o < 0) continue;
      if (y === H - 1) add(beds[o], BASE, x);
      else {
        const below = owner[(y + 1) * W + x];
        if (below >= 0 && below !== o) add(beds[o], below, x);
        else if (below < 0) {
          const k = insertAt(x, y + 1);
          if (k >= 0) add(beds[o], insertRef(k), x);
        }
      }
      if (x === 0 || x === W - 1) add(sides[o], ABUT, y);
      if (x + 1 < W) {
        const right = owner[y * W + x + 1];
        if (right >= 0 && right !== o) {
          add(sides[o], right, y);
          add(sides[right], o, y);
        }
      }
    }
  }
  // A block rests only on what is in a lower course (or the base, or an insert), so support
  // always runs downward and never round in a loop; a scrap folded in above or below a
  // neighbour in its own course only touches it, like a head joint.
  for (const b of blocks) {
    const firm = [...beds[b.i].values()].filter((c) => c.n >= HOLD);
    b.bed = firm.filter((c) => c.j < 0 || blocks[c.j].course > b.course);
    b.heads = [
      ...[...sides[b.i].values()].filter((c) => c.n >= HOLD),
      ...firm.filter((c) => c.j >= 0 && blocks[c.j].course <= b.course),
    ];
  }
  for (const b of blocks) {
    for (const c of b.bed) if (c.j >= 0) blocks[c.j].top.push({ ...c, j: b.i });
  }
  return { spec, owner, blocks, edges };
};
