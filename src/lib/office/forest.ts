// Friday, later: the office becomes a wood, and then the wood has seasons. Everything here
// is a function of `since`, the seconds since friday began (see Mood), like the garden it
// grows out of; the only state is the baked canvases, which are caches.

import butterfly from "$lib/sprites/butterfly.json";
import fox from "$lib/sprites/fox.json";
import hedgehog from "$lib/sprites/hedgehog.json";
import owl from "$lib/sprites/owl.json";
import rabbit from "$lib/sprites/rabbit.json";
import { drawSprite, frameOf, type Sprite } from "$lib/sprites/sprite";

import { FLOOR_Y, SCENE_H, SCENE_W } from "./engine";

const S = {
  rabbit: rabbit as Sprite,
  butterfly: butterfly as Sprite,
  owl: owl as Sprite,
  fox: fox as Sprite,
  hedgehog: hedgehog as Sprite,
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

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
/** 0 before `a`, 1 after `b`, linear between. */
const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));

/** Something drawn once per quantised state and reused: trees, snow cover, leaf litter. */
const baked = new Map<string, { key: string; canvas: HTMLCanvasElement }>();
const layer = (
  ctx: CanvasRenderingContext2D,
  name: string,
  key: string,
  paint: (off: CanvasRenderingContext2D) => void,
) => {
  let hit = baked.get(name);
  if (!hit || hit.key !== key) {
    const canvas = hit?.canvas ?? document.createElement("canvas");
    canvas.width = SCENE_W;
    canvas.height = SCENE_H;
    const off = canvas.getContext("2d");
    if (!off) return;
    off.clearRect(0, 0, SCENE_W, SCENE_H);
    paint(off);
    hit = { key, canvas };
    baked.set(name, hit);
  }
  ctx.drawImage(hit.canvas, 0, 0);
};

// --- Seasons --------------------------------------------------------------------------

/** The wood is grown; from here the year turns. */
export const SEASONS_FROM = 320;
/** Seconds per season. */
export const SEASON_S = 150;

export type Season = {
  /** 0 summer, 1 autumn, 2 winter, 3 spring. */
  k: 0 | 1 | 2 | 3;
  /** How far through it, 0..1. */
  p: number;
};

export const seasonAt = (since: number): Season => {
  if (since < SEASONS_FROM) return { k: 0, p: 0 };
  const t = (since - SEASONS_FROM) / SEASON_S;
  return { k: (Math.floor(t) % 4) as Season["k"], p: t % 1 };
};

/** How much of the crown is leaf, 0..1: bare in winter, back in spring. */
const foliage = ({ k, p }: Season) =>
  k === 0 ? 1 : k === 1 ? 1 - ramp(p, 0.35, 1) : k === 2 ? 0 : ramp(p, 0.3, 0.9);

/** Snow on the ground and the ledges, 0..1. */
export const snowCover = (since: number) => {
  const { k, p } = seasonAt(since);
  return k === 2 ? ramp(p, 0.1, 0.7) : k === 3 ? 1 - ramp(p, 0, 0.4) : 0;
};

/** Fallen leaves on the floor, 0..1: they pile in autumn and the moss has them by spring. */
const litter = ({ k, p }: Season) =>
  k === 1 ? ramp(p, 0.35, 1) : k === 2 ? 1 : k === 3 ? 1 - ramp(p, 0, 0.5) : 0;

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
const AUTUMN = ["#d9a441", "#e07b2a", "#c8452f", "#b3741f"];
const BLOSSOM = ["#f4c6d0", "#f8e8ee", "#e89aa8"];
const SNOW = ["#f4f7fa", "#e4ebf0"];

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

/** A broken line of snow along the top of a branch. */
const snowLine = (ctx: CanvasRenderingContext2D, a: Pt, b: Pt, seed: number) => {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let k = 0; k <= n; k++) {
    if (hash(seed, k) < 0.3) continue;
    const t = k / n;
    rect(ctx, SNOW[0], Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t) - 1);
  }
};

/** The colour of one leaf pixel in the season: turning in autumn, blossom first in spring. */
const leafColour = (h: number, lit: boolean, { k, p }: Season): string => {
  if (k === 1 && h < ramp(p, 0, 0.55)) return AUTUMN[Math.floor(h * 97) % AUTUMN.length];
  if (k === 3 && h > ramp(p, 0.45, 0.95)) return BLOSSOM[Math.floor(h * 97) % BLOSSOM.length];
  return lit ? LEAVES_LIT : LEAVES[Math.floor(h * 97) % LEAVES.length];
};

/** A dithered ellipse of leaves, lit from the upper left, thinned to `density`. */
const blob = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  seed: number,
  season: Season,
  density: number,
) => {
  if (density <= 0) return;
  const ry = r * 0.75;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = ((x - cx) / r) ** 2 + ((y - cy) / ry) ** 2;
      if (d > 1) continue;
      const h = hash(x, y, seed);
      // A ragged edge, not a stamped oval; and the leaves go from the outside in.
      if (d > 0.7 && h < 0.4) continue;
      if (hash(y, x, seed) > density * (1.15 - d * 0.3)) continue;
      const lit = y < cy - ry * 0.25 && x < cx + r * 0.2 && h > 0.6;
      rect(ctx, leafColour(h, lit, season), x, y);
    }
  }
};

const paintTree = (ctx: CanvasRenderingContext2D, i: number, g: number, season: Season) => {
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
  const density = foliage(season);
  const snowy = snowCover(SEASONS_FROM + (season.k + season.p) * SEASON_S) > 0.5;
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
    if (snowy) snowLine(ctx, from, to, i * 31 + k);
    blob(ctx, to.x, to.y, (5 + 6 * hash(i, k, 4)) * g, i * 31 + k, season, density);
  }
  blob(ctx, top.x, top.y + 2, (7 + 4 * hash(i, 9, 5)) * g, i * 31 + 99, season, density);
};

export const drawTrees = (ctx: CanvasRenderingContext2D, since: number) => {
  const season = seasonAt(since);
  TREES.forEach((_, i) => {
    const g = growth(i, since);
    if (g <= 0) return;
    const step = Math.round(g * GROW_STEPS);
    const key = `${step}|${season.k}|${Math.round(season.p * 24)}`;
    layer(ctx, `tree${i}`, key, (off) => paintTree(off, i, step / GROW_STEPS, season));
  });
};

// --- The ground: leaf litter, then snow -----------------------------------------------

/** Where fallen leaves settle, worked out once. */
const LITTER = Array.from({ length: 220 }, (_, i) => ({
  x: Math.floor(hash(i, 11) * SCENE_W),
  y: FLOOR_Y + 1 + Math.floor(hash(i, 12) * (SCENE_H - FLOOR_Y - 2)),
  at: hash(i, 13),
  colour: AUTUMN[Math.floor(hash(i, 14) * AUTUMN.length)],
}));

const SNOW_CELL = 2;
/** Every floor cell with the moment in the cover it whitens; melting runs it backwards. */
let snowCells: { x: number; y: number; at: number; colour: string }[] | null = null;
const snowField = () =>
  (snowCells ??= (() => {
    const cells: { x: number; y: number; at: number; colour: string }[] = [];
    for (let y = FLOOR_Y; y < SCENE_H; y += SNOW_CELL) {
      for (let x = 0; x < SCENE_W; x += SNOW_CELL) {
        const h = hash(x, y, 21);
        cells.push({ x, y, at: h, colour: SNOW[Math.floor(h * 53) % SNOW.length] });
      }
    }
    return cells;
  })());

/** Ledges the snow settles on, `[x, y, w]`: the slab tops, the sill, the desk. */
const LEDGES: [number, number, number][] = [
  [6, 22, 44],
  [270, 22, 44],
  [126, 60, 68],
  [104, 118, 112],
];

export const drawGround = (ctx: CanvasRenderingContext2D, since: number) => {
  const season = seasonAt(since);
  const leaves = litter(season);
  if (leaves > 0) {
    layer(ctx, "litter", `${Math.round(leaves * 30)}`, (off) => {
      for (const l of LITTER) if (l.at < leaves) rect(off, l.colour, l.x, l.y, 2, 1);
    });
  }
  const snow = snowCover(since);
  if (snow > 0) {
    layer(ctx, "snow", `${Math.round(snow * 30)}`, (off) => {
      for (const c of snowField()) {
        if (c.at < snow) rect(off, c.colour, c.x, c.y, SNOW_CELL, SNOW_CELL);
      }
    });
  }
};

/** Snow caps on the ledges, drawn over the furniture. */
const drawSnowCaps = (ctx: CanvasRenderingContext2D, since: number) => {
  const snow = snowCover(since);
  if (snow <= 0) return;
  for (const [x, y, w] of LEDGES) {
    for (let k = 0; k < w; k++) {
      if (hash(x + k, y, 31) > snow) continue;
      rect(ctx, SNOW[0], x + k, y - 1);
      if (hash(x + k, y, 32) < snow - 0.5) rect(ctx, SNOW[1], x + k, y - 2);
    }
  }
};

// --- Weather: falling leaves, falling snow --------------------------------------------

const drawFallingLeaves = (ctx: CanvasRenderingContext2D, since: number, season: Season) => {
  const on =
    season.k === 1 ? ramp(season.p, 0.3, 0.5) : season.k === 2 ? 1 - ramp(season.p, 0, 0.15) : 0;
  if (on <= 0) return;
  for (let i = 0; i < 28; i++) {
    if (hash(i, 41) > on) continue;
    const tree = Math.floor(hash(i, 42) * TREES.length);
    const from = crown(tree, since);
    const x0 = from.x + (hash(i, 43) - 0.5) * 30;
    const y0 = from.y - 10 + hash(i, 44) * 20;
    const period = 5 + 3 * hash(i, 45);
    const t = ((since + hash(i, 46) * period) % period) / period;
    const x = x0 + Math.sin(t * 6 + i) * 8 + t * 12 * (hash(i, 47) - 0.5);
    const y = y0 + t * (FLOOR_Y + 4 - y0);
    rect(ctx, AUTUMN[i % AUTUMN.length], Math.round(x), Math.round(y), 2, 1);
  }
};

const drawSnowfall = (ctx: CanvasRenderingContext2D, since: number, season: Season) => {
  const on = season.k === 2 ? ramp(season.p, 0.02, 0.1) * (1 - ramp(season.p, 0.9, 1)) : 0;
  if (on <= 0) return;
  ctx.globalAlpha = 0.9 * on;
  for (let i = 0; i < 70; i++) {
    const speed = 12 + 10 * hash(i, 51);
    const x = hash(i, 52) * SCENE_W + Math.sin(since * 0.7 + i) * 6;
    const y = ((since * speed + hash(i, 53) * SCENE_H) % (SCENE_H + 10)) - 5;
    rect(ctx, SNOW[0], Math.round(x), Math.round(y));
  }
  ctx.globalAlpha = 1;
};

// --- Ivy on the machines ----------------------------------------------------------------

const IVY_FROM = 360;
/** Seconds until the slabs are covered. */
const IVY_S = 540;

/** How far the ivy has got over the AIs, 0..1. Their lights and their arc go with it. */
export const overgrown = (since: number) => smooth((since - IVY_FROM) / IVY_S);

/** Ivy up one slab face: `x`..`x+w`, from `bottom` towards `top`. */
export const drawIvy = (
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  bottom: number,
  w: number,
  since: number,
) => {
  const cover = overgrown(since);
  if (cover <= 0) return;
  const runs = 5;
  for (let k = 0; k < runs; k++) {
    const cx = x + 4 + Math.round((k * (w - 8)) / (runs - 1));
    const reach = (bottom - top) * cover * (0.7 + 0.3 * hash(x, k, 61));
    for (let d = 0; d < reach; d++) {
      const y = bottom - d;
      const vx = cx + Math.round(Math.sin(d / 6 + k) * 2);
      rect(ctx, "#3f6a2a", vx, y);
      if (d % 5 === 2) rect(ctx, "#6aa84a", vx + (d % 10 < 5 ? 1 : -2), y, 2, 1);
    }
  }
};

// --- Butterflies ----------------------------------------------------------------------

const BUTTERFLIES_FROM = 70;
/** Where the vines flower; a butterfly keeps to one of them. */
const FLOWER_X = [58, 104, 218, 262];
const WINGS = [undefined, "white", "blue", "violet"];

const drawButterflies = (ctx: CanvasRenderingContext2D, since: number, season: Season) => {
  // Summer, and late spring.
  const on = season.k === 0 ? 1 : season.k === 3 ? ramp(season.p, 0.5, 0.8) : 0;
  const n = Math.round(Math.min(5, Math.floor((since - BUTTERFLIES_FROM) / 18)) * on);
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

// --- Passers-by: in from one side, stops, out the other ------------------------------

type Visit = { x: number; still: boolean; done: boolean };

/** Where along its path a visitor is `c` seconds in, at `speed` px/s, in path coordinates. */
const visit = (c: number, w: number, speed: number, stops: number[], waits: number[]): Visit => {
  let t = c;
  let prev = -w;
  for (const [i, stop] of stops.entries()) {
    const walk = (stop - prev) / speed;
    if (t < walk) return { x: prev + t * speed, still: false, done: false };
    t -= walk;
    if (t < waits[i]) return { x: stop, still: true, done: false };
    t -= waits[i];
    prev = stop;
  }
  const x = prev + t * speed;
  return { x, still: false, done: x > SCENE_W + w };
};

// --- The fox --------------------------------------------------------------------------

const FOX_FROM = 480;
const FOX_CYCLE = 140;
const FOX_SPEED = 44;
const FOX_SCALE = 2;

/** The fox's place this moment, or null while it is away. */
const foxAt = (since: number): { x: number; face: 1 | -1 } | null => {
  if (since < FOX_FROM) return null;
  const n = Math.floor((since - FOX_FROM) / FOX_CYCLE);
  const c = (since - FOX_FROM) % FOX_CYCLE;
  const w = S.fox.w * FOX_SCALE;
  const face: 1 | -1 = hash(n, 71) < 0.5 ? 1 : -1;
  const v = visit(c, w, FOX_SPEED, [], []);
  if (v.done) return null;
  return { x: face > 0 ? v.x : SCENE_W - v.x - w, face };
};

const drawFox = (ctx: CanvasRenderingContext2D, since: number) => {
  const f = foxAt(since);
  if (!f) return;
  const w = S.fox.w * FOX_SCALE;
  ctx.save();
  ctx.translate(Math.round(f.x) + (f.face < 0 ? w : 0), FLOOR_Y + 6 - S.fox.h * FOX_SCALE);
  ctx.scale(FOX_SCALE * f.face, FOX_SCALE);
  drawSprite(ctx, S.fox, 0, 0, { frame: frameOf(S.fox, "trot", since * 8) });
  ctx.restore();
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

const drawRabbit = (ctx: CanvasRenderingContext2D, since: number, season: Season) => {
  // It keeps out of the fox's way.
  if (since < RABBIT_FROM || foxAt(since)) return;
  const n = Math.floor((since - RABBIT_FROM) / RABBIT_CYCLE);
  const c = (since - RABBIT_FROM) % RABBIT_CYCLE;
  const h = hash(n, 7);
  const face: 1 | -1 = h < 0.5 ? 1 : -1;
  const w = S.rabbit.w * RABBIT_SCALE;
  const picks = [TUFT_X[Math.floor(h * 2)], TUFT_X[2 + Math.floor(hash(n, 8) * 2)]];
  const stops = face > 0 ? picks : picks.map((x) => SCENE_W - x).reverse();
  const v = visit(c, w, RABBIT_SPEED, stops, [4, 5]);
  if (v.done) return;
  const x = face > 0 ? v.x : SCENE_W - v.x - w;
  const air = v.still ? 0 : Math.abs(Math.sin((v.x / HOP) * Math.PI)) * 5;
  const frame = v.still
    ? frameOf(S.rabbit, "nibble", since * 3)
    : frameOf(S.rabbit, air > 1 ? "hop" : "sit", 0);
  const white = season.k === 2 ? season.p > 0.2 : season.k === 3 && season.p < 0.2;
  ctx.save();
  ctx.translate(Math.round(x) + (face < 0 ? w : 0), FLOOR_Y + 4 - S.rabbit.h * RABBIT_SCALE - air);
  ctx.scale(RABBIT_SCALE * face, RABBIT_SCALE);
  drawSprite(ctx, S.rabbit, 0, 0, { frame, variant: white ? "winter" : undefined });
  ctx.restore();
};

// --- The hedgehog ---------------------------------------------------------------------

const HEDGEHOG_SCALE = 2;

/** Shuffles about the leaf litter in autumn; asleep somewhere the rest of the year. */
const drawHedgehog = (ctx: CanvasRenderingContext2D, since: number, season: Season) => {
  const on =
    season.k === 1 ? ramp(season.p, 0.4, 0.5) : season.k === 2 ? 1 - ramp(season.p, 0, 0.08) : 0;
  if (on <= 0) return;
  const w = S.hedgehog.w * HEDGEHOG_SCALE;
  const x = 60 + 190 * (0.5 + 0.5 * Math.sin(since * 0.05));
  const face: 1 | -1 = Math.cos(since * 0.05) > 0 ? 1 : -1;
  ctx.save();
  ctx.globalAlpha = on;
  ctx.translate(Math.round(x) + (face < 0 ? w : 0), FLOOR_Y + 8 - S.hedgehog.h * HEDGEHOG_SCALE);
  ctx.scale(HEDGEHOG_SCALE * face, HEDGEHOG_SCALE);
  drawSprite(ctx, S.hedgehog, 0, 0, { frame: frameOf(S.hedgehog, "shuffle", since * 3) });
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

const drawFireflies = (ctx: CanvasRenderingContext2D, since: number, season: Season) => {
  // A summer thing, lingering into early autumn.
  const on = season.k === 0 ? 1 : season.k === 1 ? 1 - ramp(season.p, 0, 0.3) : 0;
  if (on <= 0) return;
  const n = Math.min(12, Math.floor((since - FIREFLIES_FROM) / 10));
  for (let i = 0; i < n; i++) {
    const glow = Math.max(0, Math.sin(since * 1.3 + i * 2.1)) ** 4 * on;
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

/** The animals and the weather of the wood, drawn over everything else in the room. */
export const drawWoodlife = (ctx: CanvasRenderingContext2D, since: number) => {
  const season = seasonAt(since);
  drawSnowCaps(ctx, since);
  drawButterflies(ctx, since, season);
  drawHedgehog(ctx, since, season);
  drawRabbit(ctx, since, season);
  drawFox(ctx, since);
  drawOwl(ctx, since);
  drawFireflies(ctx, since, season);
  drawFallingLeaves(ctx, since, season);
  drawSnowfall(ctx, since, season);
};
