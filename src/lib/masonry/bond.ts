// Laying a wall, one of three ways: concrete blocks in running bond (each course half a block
// along from the one below, joints wandering a little, here and there a half block where it
// breaks no joint above or below); bricks, one by one; or medieval rubble, stones of every
// size in rough courses. Whichever, the wall is pieces (what
// comes away whole), and what touches what: what each rests on (its bed), what rests on it,
// its neighbours in the course, and any insert sitting on it. Pieces are called blocks here
// whatever they are made of.

import { hash } from "$lib/scene/pixel";

import { stream, wander } from "./rand";
import { ABUT, BASE, type Block, type Bond, type Contact, insertRef, type Spec } from "./types";

/** A piece of a block smaller than this, px, or thinner than MIN_SIDE either way, is a scrap:
 *  it joins the neighbour it shares the most edge with. Never more than a quarter of a whole
 *  piece, or thinner than a course: a brick is a piece, not a scrap. */
const MIN_PX = 12;
const MIN_SIDE = 5;
const scrapOf = (spec: Spec) => ({
  px: Math.min(MIN_PX, (spec.unit * spec.course) / 4),
  side: Math.min(MIN_SIDE, spec.course - 1),
});
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

/** A layout before tidying: each pixel's piece (-1 in an opening), each piece's course, the
 *  courses' rows, and per pixel whether it is mortar and which unit (block, brick, stone) it
 *  belongs to. */
type Layout = {
  raw: Int32Array;
  courseOfId: Int16Array;
  edges: number[];
  mortar: Uint8Array | null;
  unit: Int32Array | null;
};

/** Concrete blocks, each its own piece: courses up from the base, joints wandering a little. */
const layBlocks = (spec: Spec, seed: number): Layout => {
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
  return { raw, courseOfId, edges, mortar: null, unit: null };
};

/** A brick and its joint, px: 9 by 3 with 1 px of mortar, about 22 by 7 cm. */
const BRICK = { w: 9, h: 3, joint: 1 };

/**
 * Bricks in running bond, half a brick along each course, each brick laid on its bed joint
 * with its head joint at its side: each brick, with its mortar, a piece of its own.
 */
const layBricks = (spec: Spec): Layout => {
  const { w: W, h: H } = spec;
  const mw = BRICK.w + BRICK.joint;
  const mh = BRICK.h + BRICK.joint;
  const edges = coursesOf(H, mh);
  const nc = edges.length - 1;
  const ids = new Map<number, number>();
  const courses: number[] = [];
  const raw = new Int32Array(W * H).fill(-1);
  const mortar = new Uint8Array(W * H);
  const unit = new Int32Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (spec.inserts.some(({ rect }) => inside(rect, x, y))) continue;
      // Counted up from the base: the brick course, and the row in it (the bottom row is the
      // bed joint the brick is laid on, so a broken top shows brick, not mortar).
      const up = H - 1 - y;
      const bc = Math.floor(up / mh);
      const row = up % mh;
      const off = ((bc % 2) * mw) / 2;
      const col = Math.floor((x + off) / mw);
      const at = (x + off) % mw;
      const q = y * W + x;
      mortar[q] = row === 0 || at >= BRICK.w ? 1 : 0;
      const key = bc * 1000 + col;
      unit[q] = key;
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size;
        ids.set(key, id);
        // A sliver course left over at the top goes with the course under it.
        courses.push(Math.max(0, nc - 1 - bc));
      }
      raw[q] = id;
    }
  }
  return { raw, courseOfId: Int16Array.from(courses), edges, mortar, unit };
};

/**
 * Random rubble, roughly coursed, as a medieval wall is laid: courses of uneven height, each
 * of stones of uneven length, rounded off and bedded in thick lime mortar. Each stone is its
 * own piece, with the mortar nearest it.
 */
const layRubble = (spec: Spec, seed: number): Layout => {
  const { w: W, h: H } = spec;
  const rand = stream(seed ^ 0x5701e);
  const edges = [H];
  while (edges[0] > 0)
    edges.unshift(Math.max(0, edges[0] - (spec.course - 3 + Math.floor(rand() * 7))));
  if (edges[1] < 5 && edges.length > 2) edges.splice(1, 1);
  const nc = edges.length - 1;
  type Stone = { x: number; y: number; hx: number; hy: number; course: number };
  const stones: Stone[] = [];
  const byCourse: Stone[][] = [];
  for (let c = 0; c < nc; c++) {
    const [y0, y1] = [edges[c], edges[c + 1]];
    const row: Stone[] = [];
    let x = -rand() * 10;
    while (x < W) {
      const len = Math.max(6, spec.unit * (0.45 + rand() * 0.9));
      const tall = (y1 - y0) * (0.8 + 0.25 * rand());
      const s: Stone = {
        x: x + len / 2 + (rand() - 0.5) * 2,
        y: y1 - tall / 2 - 0.5 + (rand() - 0.5) * 2,
        hx: len / 2,
        hy: tall / 2,
        course: c,
      };
      row.push(s);
      stones.push(s);
      x += len;
    }
    byCourse.push(row);
  }
  const raw = new Int32Array(W * H).fill(-1);
  const mortar = new Uint8Array(W * H);
  const unit = new Int32Array(W * H).fill(-1);
  const index = new Map(stones.map((s, i) => [s, i]));
  for (let y = 0; y < H; y++) {
    let c = 0;
    while (c + 1 < nc && y >= edges[c + 1]) c++;
    for (let x = 0; x < W; x++) {
      if (spec.inserts.some(({ rect }) => inside(rect, x, y))) continue;
      // The nearest stone by a rounded-square measure, roughened; mortar where two are near
      // alike, or where it is a way out from even the nearest.
      let [best, d1, d2] = [-1, Infinity, Infinity];
      for (let k = Math.max(0, c - 1); k <= Math.min(nc - 1, c + 1); k++) {
        for (const s of byCourse[k]) {
          if (Math.abs(s.x - x) > s.hx + 12) continue;
          const u = Math.abs(x + 0.5 - s.x) / s.hx;
          const v = Math.abs(y + 0.5 - s.y) / s.hy;
          const d =
            (u ** 3 + v ** 3) ** (1 / 3) *
            (1 + 0.08 * wander(x / 3 + y, seed, 700 + (index.get(s) ?? 0)));
          if (d < d1) [best, d1, d2] = [index.get(s) ?? -1, d, d1];
          else if (d < d2) d2 = d;
        }
      }
      const q = y * W + x;
      raw[q] = best;
      unit[q] = best;
      mortar[q] = d2 - d1 < 0.14 || d1 > 1.05 ? 1 : 0;
    }
  }
  return { raw, courseOfId: Int16Array.from(stones, (s) => s.course), edges, mortar, unit };
};

/** Lay `spec`'s wall for `seed`: blocks, bricks or rubble stone, as the spec says. */
export const layBond = (spec: Spec, seed: number): Bond => {
  const { w: W, h: H } = spec;
  const { raw, courseOfId, edges, mortar, unit } =
    spec.bond === "brick"
      ? layBricks(spec)
      : spec.bond === "rubble"
        ? layRubble(spec, seed)
        : layBlocks(spec, seed);
  const parts = partsOf(raw, W, H, courseOfId);
  foldScraps(parts, raw, W, H, scrapOf(spec));
  let bond = withContacts(spec, edges, raw, parts);
  // A piece laid with nothing under it (a sliver wedged beside an opening) is part of the
  // piece it shares the most edge with.
  for (let pass = 0; pass < 4; pass++) {
    const loose = bond.blocks.filter((b) => !b.bed.length);
    if (!loose.length) break;
    const into = new Int32Array(bond.blocks.length).map((_, i) => i);
    for (const b of loose) {
      const best = b.heads.filter((c) => c.j >= 0).sort((x, y) => y.n - x.n || x.j - y.j)[0];
      if (best) into[b.i] = best.j;
    }
    const again = Int32Array.from(bond.owner, (o) => (o < 0 ? -1 : into[o]));
    const courses = Int16Array.from(bond.blocks, (b) => b.course);
    bond = withContacts(spec, edges, again, partsOf(again, W, H, courses));
  }
  // Blocks show a joint along each edge they share (their left and upper sides); bricks and
  // stones as laid.
  bond.joint =
    mortar ??
    Uint8Array.from(bond.owner, (o, q) => {
      if (o < 0) return 0;
      const x = q % W;
      return (x > 0 && bond.owner[q - 1] >= 0 && bond.owner[q - 1] !== o) ||
        (q >= W && bond.owner[q - W] >= 0 && bond.owner[q - W] !== o)
        ? 1
        : 0;
    });
  bond.unit = unit ?? Int32Array.from(bond.owner);
  return bond;
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
const foldScraps = (
  parts: Part[],
  raw: Int32Array,
  W: number,
  H: number,
  scrap: { px: number; side: number },
) => {
  for (let pass = 0; pass < 4; pass++) {
    const small = parts
      .filter((p) => {
        if (!p.px.length) return false;
        const b = boxOf(p.px, W);
        return p.px.length < scrap.px || b.w < scrap.side || b.h < scrap.side;
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
      caps: [],
    };
  });
  // Shared edges, pixel by pixel: under a block (another block, an insert, or the base) and
  // beside it (another block, or an abutment at the wall's end).
  const beds = blocks.map(() => new Map<number, Contact>());
  const sides = blocks.map(() => new Map<number, Contact>());
  const caps = blocks.map(() => new Map<number, Contact>());
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
      if (y > 0 && owner[(y - 1) * W + x] < 0) {
        const k = insertAt(x, y - 1);
        if (k >= 0) add(caps[o], insertRef(k), x);
      }
      if (x === 0 || x === W - 1) add(sides[o], ABUT, y);
      if (x + 1 < W) {
        const right = owner[y * W + x + 1];
        if (right >= 0 && right !== o) {
          add(sides[o], right, y);
          add(sides[right], o, y);
        } else if (right < 0) {
          const k = insertAt(x + 1, y);
          if (k >= 0) add(sides[o], insertRef(k), y);
        }
      }
      if (x > 0 && owner[y * W + x - 1] < 0) {
        const k = insertAt(x - 1, y);
        if (k >= 0) add(sides[o], insertRef(k), y);
      }
    }
  }
  // A block rests only on what is lower: in a lower course, or in its own course with its
  // middle clearly lower (a scrap folded in beside a window, a stone set a little down); or on
  // the base, or an insert. So support always runs downward and never round in a loop; what
  // else it touches above or below it only touches, like a head joint.
  const lower = (b: Block, o: Block) =>
    o.course > b.course || (o.course === b.course && o.cy > b.cy + 1);
  for (const b of blocks) {
    const firm = [...beds[b.i].values()].filter((c) => c.n >= HOLD);
    b.bed = firm.filter((c) => c.j < 0 || lower(b, blocks[c.j]));
    b.heads = [
      ...[...sides[b.i].values()].filter((c) => c.n >= HOLD),
      ...firm.filter((c) => c.j >= 0 && !lower(b, blocks[c.j])),
    ];
  }
  for (const b of blocks) {
    for (const c of b.bed) if (c.j >= 0) blocks[c.j].top.push({ ...c, j: b.i });
    b.caps = [...caps[b.i].values()].filter((c) => c.n >= HOLD);
  }
  return { spec, owner, blocks, edges, joint: new Uint8Array(0), unit: new Int32Array(0) };
};
