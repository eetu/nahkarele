// Friday, later: the office becomes a wood, and then the wood has seasons. Everything here
// is a function of `since`, the seconds since friday began, and of friday's `seed` (see
// Mood), which shapes the trees; the only state is caches: the stand and baked canvases.

import { prefersReducedMotion } from "$lib/keys";
import type { Weather } from "$lib/scene/sky";
import butterfly from "$lib/sprites/butterfly.json";
import fox from "$lib/sprites/fox.json";
import hedgehog from "$lib/sprites/hedgehog.json";
import owl from "$lib/sprites/owl.json";
import rabbit from "$lib/sprites/rabbit.json";
import { drawSprite, frameOf, type Sprite } from "$lib/sprites/sprite";

import { FLOOR_Y, SCENE_H, SCENE_W } from "./engine";
import { hash, ramp, rect, smooth } from "./pixel";
import { type Season, SEASON_S, seasonAt, SEASONS_FROM, STORM_S } from "./seasons";
import { drawTree, type Pose, poseOf } from "./sway";
import {
  appleOnTree,
  autumnOf,
  crownOf,
  deciduous,
  drawApple,
  grownAt,
  type Look,
  perchOf,
  type Plan,
  planTree,
  SPECIES,
  type Species,
} from "./trees";
import { driftOf, windAt } from "./wind";

export { type Season, SEASON_S, seasonAt, SEASONS_FROM } from "./seasons";

const S = {
  rabbit: rabbit as Sprite,
  butterfly: butterfly as Sprite,
  owl: owl as Sprite,
  fox: fox as Sprite,
  hedgehog: hedgehog as Sprite,
};

/** Something drawn once per quantised state and reused: snow cover, leaf litter. */
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

/** Where the trees come up, at the cracks, and when; their kind and shape come from the seed. */
const SLOTS = [
  { x: 62, h: 134, start: 60 },
  { x: 100, h: 142, start: 40 },
  { x: 140, h: 138, start: 95 },
  { x: 190, h: 124, start: 75 },
  { x: 232, h: 114, start: 55 },
  { x: 262, h: 98, start: 120 },
];
/** How tall each kind stands against its slot. */
const SIZE: Record<Species, number> = {
  birch: 1,
  rowan: 0.8,
  apple: 0.72,
  oak: 1,
  maple: 1,
  cherry: 0.72,
  plum: 0.75,
  spruce: 1.05,
  pine: 1.15,
};
/** Seconds from sapling to full crown. */
const GROW_S = 180;
/** Growth is drawn in this many steps; a tree is re-baked when it reaches the next one. */
const GROW_STEPS = 40;
const AUTUMN = ["#d9a441", "#e07b2a", "#c8452f", "#b3741f"];
const SNOW = ["#f4f7fa", "#e4ebf0"];

const growth = (i: number, since: number) => smooth((since - SLOTS[i].start) / GROW_S);
/** Growth as drawn: in steps, so a tree is painted afresh only now and then. */
const grownStep = (i: number, since: number) =>
  Math.round(growth(i, since) * GROW_STEPS) / GROW_STEPS;

let stand: { seed: number; plans: Plan[] } | null = null;

/** `items` in an order the seed picks. */
const shuffled = <T>(items: T[], seed: number, salt: number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(hash(seed, i, salt) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Friday's trees: always the apple tree, and five of the other kinds, each shaped by the seed. */
const standOf = (seed: number): Plan[] => {
  if (stand?.seed === seed) return stand.plans;
  const rest = SPECIES.filter((k) => k !== "apple");
  const others = shuffled<Species>(rest, seed, 2).slice(0, SLOTS.length - 1);
  const kinds = shuffled<Species>(["apple", ...others], seed, 3);
  const plans = SLOTS.map((slot, i) =>
    planTree(
      Math.floor(hash(seed, i, 9) * 2 ** 31),
      { x: slot.x, y: FLOOR_Y + 3 },
      slot.h * SIZE[kinds[i]] * (0.9 + 0.2 * hash(seed, i, 5)),
      kinds[i],
    ),
  );
  stand = { seed, plans };
  return plans;
};

/** How far into the day the light is, per season: Finnish light, bright summer nights, dark
 *  winters. Values on the shift's 0..1 scale (`scene/sky.ts`): 0.45 midday, 0.9 night. */
const LIGHT = [0.45, 0.72, 0.9, 0.55];

/** Friday's window: the storm after the blast, then the wood's seasons and their weather. */
export const windowAt = (since: number): { progress: number; weather: Weather } => {
  if (since < STORM_S) return { progress: 0.9, weather: "storm" };
  if (since < SEASONS_FROM) {
    // The first summer comes in while the wood grows.
    const u = smooth((since - STORM_S) / (SEASONS_FROM - STORM_S));
    return { progress: 0.9 + (LIGHT[0] - 0.9) * u, weather: since < 160 ? "rain" : "clear" };
  }
  const { k, p } = seasonAt(since);
  const progress = LIGHT[k] + (LIGHT[(k + 1) % 4] - LIGHT[k]) * smooth((p - 0.7) / 0.3);
  const between = (a: number, b: number) => p >= a && p < b;
  const weather: Weather =
    k === 2
      ? between(0.02, 0.9)
        ? "snow"
        : "clear"
      : k === 1
        ? between(0.15, 0.75)
          ? "rain"
          : "clear"
        : between(k === 0 ? 0.4 : 0.3, k === 0 ? 0.55 : 0.45)
          ? "rain"
          : "clear";
  return { progress, weather };
};

/** How the trees look at `since`: the season, its leaves and its snow. */
export const lookAt = (since: number): Look => {
  const season = seasonAt(since);
  return { k: season.k, p: season.p, leaves: foliage(season), snow: snowCover(since) };
};

/** The last pose of each tree, so the apples and the owl ride the branches the frame drew. */
const poses = new Map<number, { since: number; pose: Pose }>();

/** How long a tap pushes the apple tree, s. */
const SHAKE_S = 0.6;

/** Tree `i` in friday's wind at the growth step it is drawn at; a tap shakes the apple tree. */
const poseAt = (i: number, since: number, seed: number, knocks: Knocks): Pose => {
  const hit = poses.get(i);
  if (hit && hit.since === since) return hit.pose;
  const plan = standOf(seed)[i];
  // A tap is a hard push for a moment; the branches answer it with their own wobble.
  const tapped = plan.species === "apple" ? Math.max(-Infinity, ...Object.values(knocks)) : -1;
  const shake = (time: number) => {
    const d = time - tapped;
    return d >= 0 && d < SHAKE_S ? 3 * Math.sin((Math.PI * d) / SHAKE_S) ** 2 : 0;
  };
  // Asked for less motion, the trees stir rather than toss.
  const calm = prefersReducedMotion() ? 0.3 : 1;
  const pose = poseOf(
    plan,
    grownStep(i, since),
    lookAt(since),
    since,
    (x, ago) => (windAt(since - ago, seed, x) + shake(since - ago)) * calm,
  );
  poses.set(i, { since, pose });
  return pose;
};

export const drawTrees = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  knocks: Knocks,
) => {
  const look = lookAt(since);
  standOf(seed).forEach((plan, i) => {
    const g = growth(i, since);
    if (g <= 0) return;
    const step = grownStep(i, since);
    const key = `${seed}|${step}|${look.k}|${Math.round(look.p * 24)}`;
    drawTree(ctx, `tree${i}`, key, plan, step, look, poseAt(i, since, seed, knocks));
  });
};

// --- Apples -----------------------------------------------------------------------------

/** Apples knocked down early by a shake, by `year:apple`, at the moment of the shake. */
export type Knocks = Record<string, number>;

const YEAR_S = 4 * SEASON_S;
const APPLE_FALL_S = 0.6;

/** The apple year `since` is in, counted from the first summer of the seasons; -1 before. */
const yearOf = (since: number) =>
  since < SEASONS_FROM ? -1 : Math.floor((since - SEASONS_FROM) / YEAR_S);

const autumnOfYear = (y: number) => SEASONS_FROM + y * YEAR_S + SEASON_S;

/** When apple `j` lets go: some time in the autumn, or when a shake knocked it down. */
const dropAt = (y: number, j: number, knocks: Knocks) =>
  Math.min(
    autumnOfYear(y) + (0.05 + 0.75 * hash(j, y, 61)) * SEASON_S,
    knocks[`${y}:${j}`] ?? Infinity,
  );

/** By then the fallen apples are under the snow. */
const buriedAt = (y: number) => SEASONS_FROM + y * YEAR_S + 2.3 * SEASON_S;

/** The apple tree and its slot. */
const appleTree = (seed: number) => {
  const plans = standOf(seed);
  const i = plans.findIndex((p) => p.species === "apple");
  return i < 0 ? null : { plan: plans[i], i };
};

/** Where apple `j` comes to rest, in the grass below where it hung. */
const groundOf = (hang: { x: number }, y: number, j: number) => ({
  x: Math.min(SCENE_W - 3, Math.max(2, hang.x + (hash(j, y, 62) - 0.5) * 10)),
  y: FLOOR_Y + 2 + Math.floor(hash(j, y, 63) * 16),
});

/** The apples, hanging, falling, and lying in the grass. Drawn with the trees, behind the desk. */
export const drawApples = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  knocks: Knocks,
) => {
  const tree = appleTree(seed);
  const y = yearOf(since);
  if (!tree || y < 0) return;
  const look = lookAt(since);
  const on = appleOnTree(look);
  const at = grownAt(tree.plan, grownStep(tree.i, since));
  const moved = poseAt(tree.i, since, seed, knocks).fruit;
  tree.plan.fruit.forEach((f, j) => {
    const rest = at(f);
    const hang = { x: Math.round(rest.x + moved[j].x), y: Math.round(rest.y + moved[j].y) };
    const drop = dropAt(y, j, knocks);
    if (since < drop) {
      if (on) drawApple(ctx, hang.x, hang.y, on.size, on.ripe, j);
      return;
    }
    if (since >= buriedAt(y)) return;
    const ground = groundOf(rest, y, j);
    const u = Math.min(1, (since - drop) / APPLE_FALL_S);
    const fx = hang.x + (ground.x - hang.x) * u;
    const fy = hang.y + (ground.y - hang.y) * u * u;
    drawApple(ctx, fx, fy, 2, true, j);
  });
};

/** Where apples came down in the grass between two moments of friday: for the thud. */
export const appleCue = (from: number, to: number, seed: number, knocks: Knocks): number[] => {
  const tree = appleTree(seed);
  const y = yearOf(to);
  if (!tree || y < 0 || to <= from) return [];
  const at = grownAt(tree.plan, growth(tree.i, to));
  return tree.plan.fruit.flatMap((f, j) => {
    const landed = dropAt(y, j, knocks) + APPLE_FALL_S;
    return landed > from && landed <= to ? [groundOf(at(f), y, j).x] : [];
  });
};

/** The ripe apples still hanging, soonest to fall first. */
const ripeHanging = (since: number, seed: number, knocks: Knocks) => {
  const tree = appleTree(seed);
  const y = yearOf(since);
  if (!tree || y < 0 || !appleOnTree(lookAt(since))?.ripe) return [];
  return tree.plan.fruit
    .map((_, j) => ({ j, drop: dropAt(y, j, knocks) }))
    .filter((a) => a.drop > since)
    .sort((a, b) => a.drop - b.drop)
    .map((a) => `${y}:${a.j}`);
};

/** Where to tap to shake the apple tree, while it has ripe apples to give: its crown. */
export const appleTreeAt = (since: number, seed: number, knocks: Knocks) => {
  const tree = appleTree(seed);
  if (!tree || !ripeHanging(since, seed, knocks).length) return null;
  const at = grownAt(tree.plan, growth(tree.i, since));
  const { clumps } = tree.plan;
  const left = Math.min(...clumps.map((c) => at({ x: c.x - c.r, y: c.y }).x));
  const right = Math.max(...clumps.map((c) => at({ x: c.x + c.r, y: c.y }).x));
  const top = Math.min(...clumps.map((c) => at({ x: c.x, y: c.y - c.r }).y));
  const bottom = Math.max(...clumps.map((c) => at({ x: c.x, y: c.y + c.r }).y));
  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(right - left),
    h: Math.round(bottom - top),
  };
};

/** A shake: the next ripe apple comes down now. The key to record in the knocks, or null. */
export const shakeApple = (since: number, seed: number, knocks: Knocks): string | null =>
  ripeHanging(since, seed, knocks)[0] ?? null;

/** Once the first apple of the year is down, the hedgehog has one on its spines. */
const hedgehogApple = (since: number) => {
  const y = yearOf(since);
  return y >= 0 && since > autumnOfYear(y) + 0.1 * SEASON_S;
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

const drawFallingLeaves = (
  ctx: CanvasRenderingContext2D,
  since: number,
  season: Season,
  seed: number,
) => {
  const on =
    season.k === 1 ? ramp(season.p, 0.3, 0.5) : season.k === 2 ? 1 - ramp(season.p, 0, 0.15) : 0;
  if (on <= 0) return;
  const plans = standOf(seed);
  const shedding = plans.flatMap((plan, i) => (deciduous(plan.species) ? [i] : []));
  if (!shedding.length) return;
  for (let i = 0; i < 28; i++) {
    if (hash(i, 41) > on) continue;
    const tree = shedding[Math.floor(hash(i, 42) * shedding.length)];
    const from = crownOf(plans[tree], growth(tree, since));
    const colours = autumnOf(plans[tree].species);
    const x0 = from.x + (hash(i, 43) - 0.5) * 30;
    const y0 = from.y - 10 + hash(i, 44) * 20;
    const period = 5 + 3 * hash(i, 45);
    const t = ((since + hash(i, 46) * period) % period) / period;
    const blown = driftOf(since - t * period, since, seed, x0) * LEAF_PX_S;
    const x = x0 + Math.sin(t * 6 + i) * 8 + t * 12 * (hash(i, 47) - 0.5) + blown;
    const y = y0 + t * (FLOOR_Y + 4 - y0);
    rect(ctx, colours[i % colours.length], Math.round(x), Math.round(y), 2, 1);
  }
};

/** How fast a leaf and a flake ride a wind of 1, scene px/s. */
const LEAF_PX_S = 20;
const FLAKE_PX_S = 16;

const drawSnowfall = (
  ctx: CanvasRenderingContext2D,
  since: number,
  season: Season,
  seed: number,
) => {
  const on = season.k === 2 ? ramp(season.p, 0.02, 0.1) * (1 - ramp(season.p, 0.9, 1)) : 0;
  if (on <= 0) return;
  ctx.globalAlpha = 0.9 * on;
  // Spread over the whole room, carried on the wind through the broken window; one flake in
  // four is nearer, bigger and quicker.
  const span = SCENE_W + 10;
  const fall = SCENE_H + 10;
  for (let i = 0; i < 90; i++) {
    const near = i % 4 === 0;
    const speed = near ? 20 + 8 * hash(i, 51) : 10 + 7 * hash(i, 51);
    const x0 = hash(i, 52) * span;
    const down = (since * speed + hash(i, 53) * fall) % fall;
    const blown = driftOf(since - down / speed, since, seed, x0) * FLAKE_PX_S * (near ? 1.3 : 1);
    const drift = blown + Math.sin(since * 0.6 + i) * 4;
    const x = ((((x0 + drift) % span) + span) % span) - 5;
    const y = down - 5;
    rect(ctx, SNOW[0], Math.round(x), Math.round(y), near ? 2 : 1, near ? 2 : 1);
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

const drawButterflies = (
  ctx: CanvasRenderingContext2D,
  since: number,
  season: Season,
  seed: number,
) => {
  // Summer, and late spring.
  const on = season.k === 0 ? 1 : season.k === 3 ? ramp(season.p, 0.5, 0.8) : 0;
  const n = Math.round(Math.min(5, Math.floor((since - BUTTERFLIES_FROM) / 18)) * on);
  for (let i = 0; i < n; i++) {
    const ax = FLOWER_X[i % FLOWER_X.length];
    const x0 = ax + Math.sin(since * 0.35 + i) * 18 + Math.sin(since * 0.9 + i * 2) * 4;
    const x = x0 + windAt(since, seed, x0) * 10;
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
  if (hedgehogApple(since)) drawApple(ctx, 4, -1, 2, true, 1);
  ctx.restore();
};

// --- The owl --------------------------------------------------------------------------

const OWL_FROM = 200;
/** The owl takes the tree by the clock, on a branch three fifths of the way up. */
const OWL_TREE = 4;
const HOOT_CYCLE = 23;
const HOOT_S = 1.2;

const drawOwl = (ctx: CanvasRenderingContext2D, since: number, seed: number, knocks: Knocks) => {
  const g = growth(OWL_TREE, since);
  if (since < OWL_FROM || g < 0.8) return;
  const branch = perchOf(standOf(seed)[OWL_TREE], grownStep(OWL_TREE, since));
  const moved = poseAt(OWL_TREE, since, seed, knocks).perch;
  const perch = { x: Math.round(branch.x + moved.x), y: Math.round(branch.y + moved.y) };
  const c = (since - OWL_FROM) % HOOT_CYCLE;
  const frame =
    c < HOOT_S ? frameOf(S.owl, "hoot", (c / HOOT_S) * 3) : frameOf(S.owl, "perch", since * 0.7);
  // It looks about: the head turns now and then.
  const flip = Math.floor(since / 9) % 3 === 0 ? "h" : undefined;
  drawSprite(ctx, S.owl, perch.x - 4, perch.y - S.owl.h + 1, { frame, flip });
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

const drawFireflies = (
  ctx: CanvasRenderingContext2D,
  since: number,
  season: Season,
  seed: number,
) => {
  // A summer thing, lingering into early autumn.
  const on = season.k === 0 ? 1 : season.k === 1 ? 1 - ramp(season.p, 0, 0.3) : 0;
  if (on <= 0) return;
  const n = Math.min(12, Math.floor((since - FIREFLIES_FROM) / 10));
  for (let i = 0; i < n; i++) {
    const glow = Math.max(0, Math.sin(since * 1.3 + i * 2.1)) ** 4 * on;
    if (glow < 0.05) continue;
    const x0 = 20 + hash(i, 1) * (SCENE_W - 40) + Math.sin(since * 0.3 + i) * 12;
    const x = Math.round(x0 + windAt(since, seed, x0) * 6);
    const y = Math.round(40 + hash(i, 2) * (FLOOR_Y - 50) + Math.sin(since * 0.45 + i * 3) * 6);
    ctx.globalAlpha = glow * 0.35;
    rect(ctx, "#e8ff7a", x - 2, y - 2, 5, 5);
    ctx.globalAlpha = glow;
    rect(ctx, "#f4ffb0", x - 1, y - 1, 2, 2);
  }
  ctx.globalAlpha = 1;
};

/**
 * What stands on the floor, back to front by where its feet are (rabbit, fox, hedgehog), over
 * the snow on the furniture. The office draws the deer, nearest of all, after this.
 */
export const drawGroundlife = (ctx: CanvasRenderingContext2D, since: number) => {
  const season = seasonAt(since);
  drawSnowCaps(ctx, since);
  drawRabbit(ctx, since, season);
  drawFox(ctx, since);
  drawHedgehog(ctx, since, season);
};

/** What flies or falls, over everything on the floor. */
export const drawWoodlife = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  knocks: Knocks,
) => {
  const season = seasonAt(since);
  drawButterflies(ctx, since, season, seed);
  drawOwl(ctx, since, seed, knocks);
  drawFireflies(ctx, since, season, seed);
  drawFallingLeaves(ctx, since, season, seed);
  drawSnowfall(ctx, since, season, seed);
};
