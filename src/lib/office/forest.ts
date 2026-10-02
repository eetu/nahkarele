// Friday, later: the office becomes a wood. Everything here is a function of `since`,
// the seconds since friday began (see Mood), like the garden it grows out of.

import butterfly from "$lib/sprites/butterfly.json";
import owl from "$lib/sprites/owl.json";
import rabbit from "$lib/sprites/rabbit.json";
import { drawSprite, frameOf, type Sprite } from "$lib/sprites/sprite";

import { FLOOR_Y, SCENE_H, SCENE_W } from "./engine";

const S = {
  rabbit: rabbit as Sprite,
  butterfly: butterfly as Sprite,
  owl: owl as Sprite,
};

/** A unit hash of a few integers: the same every frame, so nothing reshuffles on redraw. */
const hash = (...n: number[]): number => {
  let h = 2166136261;
  for (const v of n) h = Math.imul(h ^ (v | 0), 16777619);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

const rect = (ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w = 1, h = 1) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

// --- Trees ----------------------------------------------------------------------------

type Tree = {
  /** Where the trunk leaves the floor, at a crack. */
  x: number;
  /** Full height, scene px. */
  h: number;
  /** Seconds into friday the sapling shows. */
  start: number;
  /** Trunk drift per px of height, signed. */
  lean: number;
};

const TREES: Tree[] = [
  { x: 84, h: 100, start: 50, lean: -0.08 },
  { x: 136, h: 96, start: 95, lean: 0.06 },
  { x: 232, h: 72, start: 65, lean: -0.04 },
  { x: 258, h: 62, start: 120, lean: -0.1 },
];
/** Seconds from sapling to full crown. */
const GROW_S = 180;
/** Growth is drawn in this many steps; a tree is re-baked when it reaches the next one. */
const GROW_STEPS = 40;
const BARK = "#4a3320";
const BARK_LIT = "#6a4a2c";
const LEAVES = ["#3f6a2a", "#4f7f33", "#5f9a3a", "#46732e"];
const LEAVES_LIT = "#7ab648";

const smooth = (v: number) => {
  const t = Math.min(1, Math.max(0, v));
  return t * t * (3 - 2 * t);
};

/** How grown tree `i` is at `since`, 0..1. */
const growth = (i: number, since: number) => smooth((since - TREES[i].start) / GROW_S);

type Pt = { x: number; y: number };

/** The top of tree `i`'s trunk at `since`. */
const crown = (i: number, since: number): Pt => {
  const t = TREES[i];
  const g = growth(i, since);
  return { x: t.x + t.lean * t.h * g, y: FLOOR_Y + 3 - t.h * g };
};

const line = (ctx: CanvasRenderingContext2D, a: Pt, b: Pt, c: string, w: number) => {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    rect(
      ctx,
      c,
      Math.round(a.x + (b.x - a.x) * t - w / 2),
      Math.round(a.y + (b.y - a.y) * t),
      w,
      1,
    );
  }
};

/** A dithered ellipse of leaves, lit from the upper left. */
const blob = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed: number) => {
  const ry = r * 0.75;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = ((x - cx) / r) ** 2 + ((y - cy) / ry) ** 2;
      if (d > 1) continue;
      const h = hash(x, y, seed);
      // A ragged edge, not a stamped oval.
      if (d > 0.7 && h < 0.4) continue;
      const lit = y < cy - ry * 0.25 && x < cx + r * 0.2 && h > 0.6;
      rect(ctx, lit ? LEAVES_LIT : LEAVES[Math.floor(h * 97) % LEAVES.length], x, y);
    }
  }
};

const paintTree = (ctx: CanvasRenderingContext2D, i: number, g: number) => {
  const t = TREES[i];
  const base = { x: t.x, y: FLOOR_Y + 3 };
  const top = { x: t.x + t.lean * t.h * g, y: FLOOR_Y + 3 - t.h * g };
  if (g < 0.2) {
    // A sapling: a green stem and two leaves.
    line(ctx, base, top, "#4f7f33", 1);
    rect(ctx, LEAVES[2], Math.round(top.x) - 2, Math.round(top.y) + 1, 2, 1);
    rect(ctx, LEAVES[2], Math.round(top.x) + 1, Math.round(top.y) + 2, 2, 1);
    return;
  }
  const trunkW = 1 + Math.round(2 * g);
  line(ctx, base, top, BARK, trunkW);
  if (trunkW > 1) line(ctx, { x: base.x - 1, y: base.y }, { x: top.x - 1, y: top.y }, BARK_LIT, 1);
  // Branches leave the upper half of the trunk, alternating sides, each with its leaves.
  const branches = 2 + Math.floor(g * 4);
  for (let k = 0; k < branches; k++) {
    const f = 0.5 + 0.45 * hash(i, k, 1);
    const side = k % 2 ? 1 : -1;
    const len = t.h * g * (0.2 + 0.14 * hash(i, k, 2));
    const angle = (0.6 + 0.4 * hash(i, k, 3)) * (Math.PI / 2);
    const from = { x: base.x + (top.x - base.x) * f, y: base.y + (top.y - base.y) * f };
    const to = { x: from.x + side * Math.cos(angle) * len, y: from.y - Math.sin(angle) * len };
    line(ctx, from, to, BARK, 1);
    blob(ctx, to.x, to.y, (5 + 6 * hash(i, k, 4)) * g, i * 31 + k);
  }
  blob(ctx, top.x, top.y + 2, (7 + 4 * hash(i, 9, 5)) * g, i * 31 + 99);
};

/** Each tree baked at its current growth step: trees change slowly, frames come fast. */
const baked = new Map<number, { step: number; canvas: HTMLCanvasElement }>();

export const drawTrees = (ctx: CanvasRenderingContext2D, since: number) => {
  TREES.forEach((_, i) => {
    const g = growth(i, since);
    if (g <= 0) return;
    const step = Math.round(g * GROW_STEPS);
    let hit = baked.get(i);
    if (!hit || hit.step !== step) {
      const canvas = hit?.canvas ?? document.createElement("canvas");
      canvas.width = SCENE_W;
      canvas.height = SCENE_H;
      const off = canvas.getContext("2d");
      if (!off) return;
      off.clearRect(0, 0, SCENE_W, SCENE_H);
      paintTree(off, i, step / GROW_STEPS);
      hit = { step, canvas };
      baked.set(i, hit);
    }
    ctx.drawImage(hit.canvas, 0, 0);
  });
};

// --- Butterflies ----------------------------------------------------------------------

const BUTTERFLIES_FROM = 70;
/** Where the vines flower; a butterfly keeps to one of them. */
const FLOWER_X = [58, 104, 218, 262];
const WINGS = [undefined, "white", "blue", "violet"];

const drawButterflies = (ctx: CanvasRenderingContext2D, since: number) => {
  const n = Math.min(5, Math.floor((since - BUTTERFLIES_FROM) / 18));
  for (let i = 0; i < n; i++) {
    const ax = FLOWER_X[i % FLOWER_X.length];
    const x = ax + Math.sin(since * 0.35 + i) * 18 + Math.sin(since * 0.9 + i * 2) * 4;
    const y = FLOOR_Y - 52 + Math.sin(since * 0.5 + i * 1.7) * 22 + Math.sin(since * 2.1 + i) * 2;
    drawSprite(ctx, S.butterfly, x, y, {
      frame: frameOf(S.butterfly, "flap", since * 9 + i),
      variant: WINGS[i % WINGS.length],
    });
  }
};

// --- The rabbit -----------------------------------------------------------------------

const RABBIT_FROM = 100;
const RABBIT_CYCLE = 58;
const RABBIT_SPEED = 26;
const RABBIT_SCALE = 2;
/** Scene px per hop. */
const HOP = 14;
/** Grass tufts worth stopping at. */
const TUFT_X = [72, 138, 214, 252];

const drawRabbit = (ctx: CanvasRenderingContext2D, since: number) => {
  if (since < RABBIT_FROM) return;
  const n = Math.floor((since - RABBIT_FROM) / RABBIT_CYCLE);
  const c = (since - RABBIT_FROM) % RABBIT_CYCLE;
  const h = hash(n, 7);
  const face: 1 | -1 = h < 0.5 ? 1 : -1;
  const w = S.rabbit.w * RABBIT_SCALE;
  const picks = [TUFT_X[Math.floor(h * 2)], TUFT_X[2 + Math.floor(hash(n, 8) * 2)]];
  const stops = face > 0 ? picks : picks.map((x) => SCENE_W - x).reverse();
  const nibble = [4, 5];
  let t = c;
  let along = 0;
  let still = false;
  let prev = -w;
  for (const [i, stop] of stops.entries()) {
    const hop = (stop - prev) / RABBIT_SPEED;
    if (t < hop) {
      along = prev + t * RABBIT_SPEED;
      t = -1;
      break;
    }
    t -= hop;
    if (t < nibble[i]) {
      along = stop;
      still = true;
      t = -1;
      break;
    }
    t -= nibble[i];
    prev = stop;
  }
  if (t >= 0) along = prev + t * RABBIT_SPEED;
  if (along > SCENE_W + w) return;
  const x = face > 0 ? along : SCENE_W - along - w;
  const air = still ? 0 : Math.abs(Math.sin((along / HOP) * Math.PI)) * 5;
  const frame = still
    ? frameOf(S.rabbit, "nibble", since * 3)
    : frameOf(S.rabbit, air > 1 ? "hop" : "sit", 0);
  ctx.save();
  ctx.translate(Math.round(x) + (face < 0 ? w : 0), FLOOR_Y + 4 - S.rabbit.h * RABBIT_SCALE - air);
  ctx.scale(RABBIT_SCALE * face, RABBIT_SCALE);
  drawSprite(ctx, S.rabbit, 0, 0, { frame });
  ctx.restore();
};

// --- The owl --------------------------------------------------------------------------

const OWL_FROM = 200;
/** The owl takes the tree by the clock, a branch below its crown. */
const OWL_TREE = 2;
const HOOT_CYCLE = 23;
const HOOT_S = 1.2;

const drawOwl = (ctx: CanvasRenderingContext2D, since: number) => {
  if (since < OWL_FROM || growth(OWL_TREE, since) < 0.8) return;
  const top = crown(OWL_TREE, since);
  const c = (since - OWL_FROM) % HOOT_CYCLE;
  const frame =
    c < HOOT_S ? frameOf(S.owl, "hoot", (c / HOOT_S) * 3) : frameOf(S.owl, "perch", since * 0.7);
  // It looks about: the head turns now and then.
  const flip = Math.floor(since / 9) % 3 === 0 ? "h" : undefined;
  drawSprite(ctx, S.owl, top.x - 2, top.y + 12, { frame, flip });
};

/** What the wood says between two moments of friday, if anything. */
export const forestCue = (from: number, to: number): "hoot" | null => {
  if (to <= from || to < OWL_FROM || growth(OWL_TREE, to) < 0.8) return null;
  const a = (from - OWL_FROM) % HOOT_CYCLE;
  const b = (to - OWL_FROM) % HOOT_CYCLE;
  return b < a ? "hoot" : null;
};

// --- Fireflies ------------------------------------------------------------------------

const FIREFLIES_FROM = 300;

const drawFireflies = (ctx: CanvasRenderingContext2D, since: number) => {
  const n = Math.min(12, Math.floor((since - FIREFLIES_FROM) / 10));
  for (let i = 0; i < n; i++) {
    const glow = Math.max(0, Math.sin(since * 1.3 + i * 2.1)) ** 4;
    if (glow < 0.05) continue;
    const x = Math.round(20 + hash(i, 1) * (SCENE_W - 40) + Math.sin(since * 0.3 + i) * 12);
    const y = Math.round(40 + hash(i, 2) * (FLOOR_Y - 50) + Math.sin(since * 0.45 + i * 3) * 6);
    ctx.globalAlpha = glow * 0.35;
    rect(ctx, "#e8ff7a", x - 2, y - 2, 5, 5);
    ctx.globalAlpha = glow;
    rect(ctx, "#f4ffb0", x - 1, y - 1, 2, 2);
  }
  ctx.globalAlpha = 1;
};

/** The animals of the wood, drawn over everything else in the room. */
export const drawWoodlife = (ctx: CanvasRenderingContext2D, since: number) => {
  drawButterflies(ctx, since);
  drawRabbit(ctx, since);
  drawOwl(ctx, since);
  drawFireflies(ctx, since);
};
