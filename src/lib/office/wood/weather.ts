// Friday's weather: what the window shows, the litter and snow on the ground and the
// ledges, and the leaves and flakes that fall through the room on the wind.

import { hash, ramp, rect } from "$lib/scene/pixel";
import type { Weather } from "$lib/scene/sky";

import { FLOOR_Y, SCENE_H, SCENE_W } from "../engine";
import { dayAt } from "./daylight";
import { litter, type Season, seasonAt, SEASONS_FROM, snowCover, STORM_S } from "./seasons";
import { growth, standing } from "./stand";
import { autumnOf, crownOf, deciduous } from "./trees";
import { driftOf } from "./wind";

const AUTUMN = ["#d9a441", "#e07b2a", "#c8452f", "#b3741f"];
const SNOW = ["#f4f7fa", "#e4ebf0"];

/** Friday's window: the storm after the blast, then the wood's seasons and their weather. */
export const windowAt = (since: number): { progress: number; weather: Weather } => {
  if (since < STORM_S) return { progress: 0.9, weather: "storm" };
  // Friday's days and nights (`daylight.ts`).
  const { progress } = dayAt(since);
  // The first summer comes in, after the storm's rain, while the wood grows.
  if (since < SEASONS_FROM) return { progress, weather: since < 160 ? "rain" : "clear" };
  const { k, p } = seasonAt(since);
  const wet = spellsOf(k).some(([a, b]) => p >= a && p < b);
  return { progress, weather: !wet ? "clear" : k === 2 ? "snow" : "rain" };
};

/**
 * When it rains or snows, by season, as shares of it: a spell of summer rain, a wet autumn with
 * a dry spell in it, two snowfalls in winter with clear frost (and the moon) between and after,
 * a spring shower.
 */
const SPELLS: [number, number][][] = [
  [[0.4, 0.55]],
  [
    [0.15, 0.4],
    [0.55, 0.75],
  ],
  [
    [0.05, 0.38],
    [0.55, 0.8],
  ],
  [[0.3, 0.45]],
];
const spellsOf = (k: number) => SPELLS[k];

/** How hard it is snowing, 0..1, easing in and out of each winter spell. */
const snowing = (since: number) => {
  const { k, p } = seasonAt(since);
  if (k !== 2 || since < SEASONS_FROM) return 0;
  return Math.max(...SPELLS[2].map(([a, b]) => ramp(p, a, a + 0.04) * (1 - ramp(p, b - 0.04, b))));
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
const FURNITURE: [number, number, number][] = [
  // The AIs' tops (`SLAB` in office/draw.ts), and the desk.
  [6, 32, 44],
  [270, 32, 44],
  [104, 118, 112],
];
const SILL: [number, number, number][] = [[126, 60, 68]];

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
const capLedges = (
  ctx: CanvasRenderingContext2D,
  since: number,
  ledges: [number, number, number][],
) => {
  const snow = snowCover(since);
  if (snow <= 0) return;
  for (const [x, y, w] of ledges) {
    for (let k = 0; k < w; k++) {
      if (hash(x + k, y, 31) > snow) continue;
      rect(ctx, SNOW[0], x + k, y - 1);
      if (hash(x + k, y, 32) < snow - 0.5) rect(ctx, SNOW[1], x + k, y - 2);
    }
  }
};

/** Snow on the window sill, on the wall behind the trees. */
export const drawSillSnow = (ctx: CanvasRenderingContext2D, since: number) =>
  capLedges(ctx, since, SILL);

/** Snow on the slabs and the desk, in front of the trees. */
export const drawSnowCaps = (ctx: CanvasRenderingContext2D, since: number) =>
  capLedges(ctx, since, FURNITURE);

const drawFallingLeaves = (
  ctx: CanvasRenderingContext2D,
  since: number,
  season: Season,
  seed: number,
) => {
  const on =
    season.k === 1 ? ramp(season.p, 0.3, 0.5) : season.k === 2 ? 1 - ramp(season.p, 0, 0.15) : 0;
  if (on <= 0) return;
  // Only the living shed; a dead tree's leaves came down the autumn before.
  const shedding = standing(seed, since).filter((l) => deciduous(l.plan.species) && since < l.dies);
  if (!shedding.length) return;
  for (let i = 0; i < 28; i++) {
    if (hash(i, 41) > on) continue;
    const tree = shedding[Math.floor(hash(i, 42) * shedding.length)];
    const from = crownOf(tree.plan, growth(tree, since));
    const colours = autumnOf(tree.plan.species);
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
  const on = snowing(since);
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

/** Leaves in autumn, snow in winter, through the whole room. */
export const drawFalling = (ctx: CanvasRenderingContext2D, since: number, seed: number) => {
  const season = seasonAt(since);
  drawFallingLeaves(ctx, since, season, seed);
  drawSnowfall(ctx, since, season, seed);
};
