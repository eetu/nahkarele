// Every tree moves by the same rules. Its wood is a rig: each piece hangs off the piece its base
// touches (rebuilt from any plan, so a new kind needs nothing extra), and every clump, fruit
// and the owl's branch hangs off the piece nearest it. In wind a piece turns about its base,
// pushed as far as it stands upright and resisting as its width cubed; turns add up from the
// root out, so the trunk hardly moves, limbs more, twigs most. Each piece is a damped spring
// with its own pace, answering the wind of the last few seconds: a steady wind is a steady
// lean, a gust a bend that overshoots and settles. Clumps flutter on top of that.
//
// A tree is painted once into pixel lists, part by part, by `paintTreeParts`; each frame the
// parts are put back where the pose has them. Nothing tears, and the bark keeps its pattern.

import { hash } from "./pixel";
import {
  deciduous,
  grownAt,
  type Look,
  paintTreeParts,
  type Part,
  type Plan,
  type Species,
} from "./trees";

type Pt = { x: number; y: number };

/** Where something hangs: on piece `piece` (-1: the root), `t` of the way along it. */
type Hang = { piece: number; t: number };

type Rig = {
  joints: Hang[];
  /** How each piece answers the wind `LAG_S` apart, newest first; the weights sum to 1. */
  answer: Float64Array[];
  clumps: Hang[];
  fruit: Hang[];
  perch: Hang;
};

const alongOf = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  return l2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
};

const offOf = (p: Pt, a: Pt, b: Pt) => {
  const t = alongOf(p, a, b);
  return Math.hypot(a.x + (b.x - a.x) * t - p.x, a.y + (b.y - a.y) * t - p.y);
};

/** The piece among the first `before` nearest `p`; the earliest wins a tie. */
const nearest = (plan: Plan, p: Pt, before: number): Hang & { off: number } => {
  let best = { piece: -1, t: 0, off: Infinity };
  for (let j = 0; j < before; j++) {
    const { a, b } = plan.limbs[j];
    const off = offOf(p, a, b);
    if (off < best.off - 1e-6) best = { piece: j, t: alongOf(p, a, b), off };
  }
  return best;
};

const rigs = new WeakMap<Plan, Rig>();

/** The wind's history a piece answers to: this many samples, this far apart, in seconds. */
const LAGS = 16;
const LAG_S = 0.25;

/**
 * A damped spring's answer to a push `ago` seconds back, sampled at `LAG_S`: its impulse
 * response, made to sum to 1 so a steady push is a steady lean. `hz` is its own pace; twigs,
 * in leaf, are damped harder than the wood they hang from.
 */
const springOf = (hz: number, w: number) => {
  const omega = 2 * Math.PI * hz;
  const zeta = w <= 1 ? 0.45 : 0.3;
  const ring = omega * Math.sqrt(1 - zeta * zeta);
  const out = new Float64Array(LAGS);
  let sum = 0;
  for (let k = 0; k < LAGS; k++) {
    const ago = (k + 0.5) * LAG_S;
    out[k] = Math.exp(-zeta * omega * ago) * Math.sin(ring * ago);
    sum += out[k];
  }
  return out.map((v) => v / sum);
};

export const rigOf = (plan: Plan): Rig => {
  const known = rigs.get(plan);
  if (known) return known;
  const n = plan.limbs.length;
  const salt = Math.round(plan.root.x * 7 + plan.root.y);
  const joints = plan.limbs.map((l, k): Hang => {
    // Generators lay a parent's pieces before its children's; a base at the root is a stem.
    const up = nearest(plan, l.a, k);
    const root = Math.hypot(l.a.x - plan.root.x, l.a.y - plan.root.y);
    return root <= up.off + 1e-6 ? { piece: -1, t: 0 } : { piece: up.piece, t: up.t };
  });
  const hang = (p: Pt): Hang => {
    const { piece, t } = nearest(plan, p, n);
    return { piece, t };
  };
  const rig: Rig = {
    joints,
    answer: plan.limbs.map((l, k) => springOf(0.3 + 0.3 / l.w + 0.15 * hash(salt, k, 1), l.w)),
    clumps: plan.clumps.map(hang),
    fruit: plan.fruit.map(hang),
    perch: hang(plan.perch),
  };
  rigs.set(plan, rig);
  return rig;
};

/** How readily each kind's wood gives: birch whips about, oak hardly. */
const FLEX: Record<Species, number> = {
  birch: 1.4,
  rowan: 1.2,
  cherry: 1,
  plum: 1,
  maple: 1,
  apple: 0.9,
  spruce: 0.8,
  pine: 0.8,
  oak: 0.7,
};

/**
 * Per unit of wind: the lean of an upright twig and the flap of any twig as the wind changes
 * (radians), a clump's flutter (px).
 */
const PUSH = 0.06;
const FLAP = 0.05;
const FLUTTER = 0.8;
/** No piece turns further than this on its own, nor with all it hangs from. */
const OWN_MAX = 0.3;
const ALL_MAX = 0.7;

const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));

/** How far everything on a tree has moved from rest, px: each piece's ends, each clump, each
 *  fruit, the perch. */
export type Pose = { a: Pt[]; b: Pt[]; clumps: Pt[]; fruit: Pt[]; perch: Pt };

/**
 * `plan` at growth `g`, `t` seconds in, in `wind`: its strength at a scene x, `ago` seconds
 * before `t` (+ to the right; see `wind.ts`). A tree takes the wind where it stands. A bare
 * crown catches about half the wind a leafy one does.
 */
export const poseOf = (
  plan: Plan,
  g: number,
  look: Look,
  t: number,
  wind: (x: number, ago: number) => number,
): Pose => {
  const rig = rigOf(plan);
  const at = grownAt(plan, g);
  const drag = deciduous(plan.species) ? 0.45 + 0.55 * look.leaves : 1;
  const flex = FLEX[plan.species] * drag;
  const n = plan.limbs.length;
  const history = Array.from({ length: LAGS }, (_, k) => wind(plan.root.x, (k + 0.5) * LAG_S));
  const settled = history.reduce((s, w) => s + w, 0) / LAGS;
  const ends: { a: Pt; b: Pt; turn: number }[] = [];
  const da: Pt[] = [];
  const db: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const l = plan.limbs[k];
    const a = at(l.a);
    const b = at(l.b);
    const { piece: parent, t: along } = rig.joints[k];
    let o = a;
    let base = 0;
    if (parent >= 0) {
      // The base rides along its parent, wherever that has gone.
      const p = ends[parent];
      const pa = at(plan.limbs[parent].a);
      const pb = at(plan.limbs[parent].b);
      o = {
        x: a.x + p.a.x + (p.b.x - p.a.x) * along - (pa.x + (pb.x - pa.x) * along),
        y: a.y + p.a.y + (p.b.y - p.a.y) * along - (pa.y + (pb.y - pa.y) * along),
      };
      base = p.turn;
    }
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const up = -vy / (Math.hypot(vx, vy) || 1);
    let felt = 0;
    const answer = rig.answer[k];
    for (let j = 0; j < LAGS; j++) felt += answer[j] * history[j];
    const own = clamp((flex * (PUSH * felt * up + FLAP * (felt - settled))) / l.w ** 3, OWN_MAX);
    const turn = clamp(base + own, ALL_MAX);
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const end = { x: o.x + vx * c - vy * s, y: o.y + vx * s + vy * c };
    ends.push({ a: o, b: end, turn });
    da.push({ x: o.x - a.x, y: o.y - a.y });
    db.push({ x: end.x - b.x, y: end.y - b.y });
  }
  const hung = (h: Hang): Pt =>
    h.piece < 0
      ? { x: 0, y: 0 }
      : {
          x: da[h.piece].x + (db[h.piece].x - da[h.piece].x) * h.t,
          y: da[h.piece].y + (db[h.piece].y - da[h.piece].y) * h.t,
        };
  // Leaves keep still in a light breeze and flutter once it blows.
  const flutter = flex * FLUTTER * Math.max(0, Math.abs(wind(plan.root.x, 0)) - 0.3);
  const clumps = rig.clumps.map((h, i) => {
    const d = hung(h);
    const ph = 2 * Math.PI * hash(i, 3, Math.round(plan.root.x));
    return {
      x: d.x + flutter * Math.sin(t * 6 + ph),
      y: d.y + flutter * 0.5 * Math.sin(t * 4.5 + ph * 1.7),
    };
  });
  return { a: da, b: db, clumps, fruit: rig.fruit.map(hung), perch: hung(rig.perch) };
};

// --- Painting ---------------------------------------------------------------------------

/** A tree painted at rest into pixel lists, one run per part, and the buffer it is posed into. */
type Baked = {
  key: string;
  parts: Part[];
  /** Where each part's pixels start in the lists; one more entry than parts. */
  from: number[];
  xs: Int16Array;
  ys: Int16Array;
  colours: Uint32Array;
  /** How far along its piece each wood pixel is, 0..1. */
  along: Float32Array;
  box: { x: number; y: number; w: number; h: number };
  canvas: HTMLCanvasElement;
  image: ImageData;
  pixels: Uint32Array;
};

/** Room around the painted tree for it to move into, px. */
const MARGIN = 12;

let probe: CanvasRenderingContext2D | null = null;
const rgba = new Map<string, number>();
/** A CSS colour as a little-endian RGBA word, the way ImageData holds it. */
const wordOf = (colour: string) => {
  const known = rgba.get(colour);
  if (known !== undefined) return known;
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe) return 0;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = colour;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  const word = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  rgba.set(colour, word);
  return word;
};

const bake = (key: string, plan: Plan, g: number, look: Look): Baked | null => {
  const parts: Part[] = [];
  const from: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const colours: number[] = [];
  const along: number[] = [];
  const at = grownAt(plan, g);
  let fill = "#000";
  let piece: { a: Pt; b: Pt } | null = null;
  // Stands in for a canvas: `rect` only sets a colour and fills whole pixels.
  const recorder = {
    set fillStyle(c: string) {
      fill = c;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const word = wordOf(fill);
      for (let py = Math.round(y); py < Math.round(y + h); py++) {
        for (let px = Math.round(x); px < Math.round(x + w); px++) {
          xs.push(px);
          ys.push(py);
          colours.push(word);
          along.push(piece ? alongOf({ x: px + 0.5, y: py }, piece.a, piece.b) : 0);
        }
      }
    },
  } as unknown as CanvasRenderingContext2D;
  paintTreeParts(recorder, plan, g, look, (p) => {
    parts.push(p);
    from.push(xs.length);
    const l = p.kind === "wood" ? plan.limbs[p.i] : null;
    piece = l ? { a: at(l.a), b: at(l.b) } : null;
  });
  from.push(xs.length);
  if (!xs.length) return null;
  const x0 = Math.min(...xs) - MARGIN;
  const y0 = Math.min(...ys) - MARGIN;
  const box = {
    x: x0,
    y: y0,
    w: Math.max(...xs) + MARGIN - x0 + 1,
    h: Math.max(...ys) + MARGIN - y0 + 1,
  };
  const canvas = document.createElement("canvas");
  canvas.width = box.w;
  canvas.height = box.h;
  const image = new ImageData(box.w, box.h);
  return {
    key,
    parts,
    from,
    xs: Int16Array.from(xs),
    ys: Int16Array.from(ys),
    colours: Uint32Array.from(colours),
    along: Float32Array.from(along),
    box,
    canvas,
    image,
    pixels: new Uint32Array(image.data.buffer),
  };
};

const baked = new Map<string, Baked>();

/**
 * Draw `plan` posed: painted once per `key` (growth step and season) under `name`, then each
 * part moved as `pose` says, in the order `paintTree` lays them.
 */
export const drawTree = (
  ctx: CanvasRenderingContext2D,
  name: string,
  key: string,
  plan: Plan,
  g: number,
  look: Look,
  pose: Pose,
) => {
  let tree = baked.get(name);
  if (!tree || tree.key !== key) {
    const fresh = bake(key, plan, g, look);
    if (!fresh) return;
    tree = fresh;
    baked.set(name, tree);
  }
  const { parts, from, xs, ys, colours, along, box, pixels } = tree;
  pixels.fill(0);
  parts.forEach((p, j) => {
    let still = { x: 0, y: 0 };
    let move: { a: Pt; b: Pt } | null = null;
    if (p.kind === "wood") move = { a: pose.a[p.i], b: pose.b[p.i] };
    else if (p.kind === "clump") still = pose.clumps[p.i];
    else if (p.kind === "fruit") still = pose.fruit[p.i];
    const sx = Math.round(still.x) - box.x;
    const sy = Math.round(still.y) - box.y;
    for (let k = from[j]; k < from[j + 1]; k++) {
      let x = xs[k] + sx;
      let y = ys[k] + sy;
      if (move) {
        const u = along[k];
        x = xs[k] + Math.round(move.a.x + (move.b.x - move.a.x) * u) - box.x;
        y = ys[k] + Math.round(move.a.y + (move.b.y - move.a.y) * u) - box.y;
      }
      if (x < 0 || y < 0 || x >= box.w || y >= box.h) continue;
      pixels[y * box.w + x] = colours[k];
    }
  });
  tree.canvas.getContext("2d")?.putImageData(tree.image, 0, 0);
  ctx.drawImage(tree.canvas, box.x, box.y);
};
