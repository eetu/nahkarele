// Friday's weather: what the window shows, the litter and snow on the ground and the
// ledges, and the leaves and flakes that fall through the room on the wind. The year's spells
// are korpi's; the storm after the blast and its rain are friday's own.

import { clear, type Pen, type Raster, raster, rasterPen } from "@anarkisti/korpi/paint";
import { crownOf, deciduous } from "@anarkisti/korpi/plants";
import { autumnOf } from "@anarkisti/korpi/plants/paint";
import { weatherAt } from "@anarkisti/korpi/sky";

import { fill, fillFaded, paintRaster } from "$lib/scene/pen";
import { hash, ramp } from "$lib/scene/pixel";
import type { Weather } from "$lib/scene/sky";

import { at, FLAT, footAt, onFloor, PX_M, Z } from "../depth";
import { FLOOR_Y, SCENE_H, SCENE_W } from "../engine";
import { dayAt } from "./daylight";
import { FRIDAY, litter, type Season, seasonAt, SEASONS_FROM, snowCover, STORM_S } from "./seasons";
import { ROOT_Y, sceneOf, standFor, standing } from "./stand";
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
  return { progress, weather: weatherAt(FRIDAY, since).kind };
};

/** How hard it is snowing, 0..1, easing in and out of each winter spell. */
const snowing = (since: number) => weatherAt(FRIDAY, since).snow;

/** How hard it is raining, 0..1: the storm's rain as the wood comes in, then the spells of
 *  every season but winter. */
const raining = (since: number) =>
  since < SEASONS_FROM ? 1 - ramp(since, 150, 160) : weatherAt(FRIDAY, since).rain;

/** Something on the floor painted once per quantised state and reused: snow cover, leaf
 *  litter. Each is a raster of the floor, painted in scene px. */
const baked = new Map<string, { key: string; r: Raster }>();
const layer = (pen: Pen, name: string, key: string, paint: (off: Pen) => void) => {
  let hit = baked.get(name);
  if (!hit || hit.key !== key) {
    const r = hit?.r ?? raster(SCENE_W, SCENE_H - FLOOR_Y);
    clear(r);
    paint(rasterPen(r, { dy: -FLOOR_Y }));
    hit = { key, r };
    baked.set(name, hit);
  }
  paintRaster(pen, hit.r, 0, FLOOR_Y);
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

/** A ledge the snow settles on, scene px: where it starts, its row, how long it is. */
type Ledge = [number, number, number];
/** The AIs' tops (`SLAB` in office/draw.ts) and the desk's, at the depth of what is on them. */
const FURNITURE: [Ledge, number][] = [
  [[6, 32, 44], Z.slabSnow],
  [[270, 32, 44], Z.slabSnow],
  [[104, 118, 112], Z.deskSnow],
];
const SILL: Ledge = [126, 60, 68];

/** The leaf litter and the snow on the floor, flat on it. */
export const drawGround = (pen: Pen, since: number) => {
  const season = seasonAt(since);
  const leaves = litter(season);
  if (leaves > 0) {
    layer(onFloor(pen, FLAT.litter), "litter", `${Math.round(leaves * 30)}`, (off) => {
      for (const l of LITTER) if (l.at < leaves) fill(off, l.colour, l.x, l.y, 2, 1);
    });
  }
  const snow = snowCover(since);
  if (snow > 0) {
    layer(onFloor(pen, FLAT.snow), "snow", `${Math.round(snow * 30)}`, (off) => {
      for (const c of snowField()) {
        if (c.at < snow) fill(off, c.colour, c.x, c.y, SNOW_CELL, SNOW_CELL);
      }
    });
  }
};

/** A snow cap on a ledge. */
const capLedge = (pen: Pen, snow: number, [x, y, w]: Ledge) => {
  for (let k = 0; k < w; k++) {
    if (hash(x + k, y, 31) > snow) continue;
    fill(pen, SNOW[0], x + k, y - 1);
    if (hash(x + k, y, 32) < snow - 0.5) fill(pen, SNOW[1], x + k, y - 2);
  }
};

/** Snow on the window sill, while the window hangs: the sill goes down with it. */
export const drawSillSnow = (pen: Pen, since: number, hanging: boolean) => {
  const snow = snowCover(since);
  if (hanging && snow > 0) capLedge(pen, snow, SILL);
};

/** Snow on the slabs and the desk. */
export const drawSnowCaps = (pen: Pen, since: number) => {
  const snow = snowCover(since);
  if (snow > 0) for (const [ledge, z] of FURNITURE) capLedge(at(pen, z), snow, ledge);
};

const drawFallingLeaves = (pen: Pen, since: number, season: Season, seed: number) => {
  const on =
    season.k === 1 ? ramp(season.p, 0.3, 0.5) : season.k === 2 ? 1 - ramp(season.p, 0, 0.15) : 0;
  if (on <= 0) return;
  // Only the living shed; a dead tree's leaves came down the autumn before.
  const shedding = standing(seed, since).filter((l) => deciduous(l.species) && since < l.dies);
  if (!shedding.length) return;
  const stand = standFor(seed);
  for (let i = 0; i < 28; i++) {
    if (hash(i, 41) > on) continue;
    const tree = shedding[Math.floor(hash(i, 42) * shedding.length)];
    // The middle of the leaves as far as they are in the room.
    const from = sceneOf(tree, crownOf(stand.planOf(tree, since), 1, ROOT_Y / PX_M));
    const colours = autumnOf(tree.species);
    const x0 = from.x + (hash(i, 43) - 0.5) * 30;
    const y0 = from.y - 10 + hash(i, 44) * 20;
    const period = 5 + 3 * hash(i, 45);
    const t = ((since + hash(i, 46) * period) % period) / period;
    const blown = driftOf(since - t * period, since, seed, x0) * LEAF_PX_S;
    const x = x0 + Math.sin(t * 6 + i) * 8 + t * 12 * (hash(i, 47) - 0.5) + blown;
    const y = y0 + t * (FLOOR_Y + 4 - y0);
    at(pen, aloft(i, 48)).fill(colours[i % colours.length], Math.round(x), Math.round(y), 2, 1);
  }
};

/** How fast a leaf and a flake ride a wind of 1, scene px/s. */
const LEAF_PX_S = 20;
const FLAKE_PX_S = 16;
const DROP_PX_S = 30;

/** How far out falling leaf or flake `i` is, m: anywhere from just off the wall to the near
 *  floor, a `near` one in the nearer half. Past the floor where that is, it is under it. */
const aloft = (i: number, salt: number, near = false) =>
  near ? 1.3 + 1.2 * hash(i, salt) : 0.1 + 2.4 * hash(i, salt);

const RAIN = "#a8bccf";

/**
 * Rain through the room, now that the roof is gone: streaks that lean with the wind and fall
 * fast, each to a spot on the floor, where it splashes for a moment.
 */
const drawRainfall = (pen: Pen, since: number, seed: number) => {
  const on = raining(since);
  if (on <= 0) return;
  const a = 0.55 * on;
  const span = SCENE_W + 20;
  for (let i = 0; i < 70; i++) {
    const near = i % 5 === 0;
    const speed = near ? 190 : 140 + 30 * hash(i, 61);
    const land = FLOOR_Y + 2 + Math.floor(hash(i, 62) * (SCENE_H - FLOOR_Y - 4));
    // At the depth of the floor where it lands, so it splashes there.
    const drop = footAt(pen, land);
    const fall = (land + 6) / speed;
    const cycle = fall + 0.12;
    const t = (since + hash(i, 63) * cycle) % cycle;
    const x0 = hash(i, 64) * span;
    // The same wind that carries the snow, read over the drop's short way down.
    const lean = -driftOf(since - 0.25, since, seed, x0) * 4 * 0.45;
    const blown = driftOf(since - Math.min(t, fall), since, seed, x0) * DROP_PX_S;
    const x = ((((x0 + blown) % span) + span) % span) - 10;
    if (t < fall) {
      const y = -6 + t * speed;
      const len = near ? 5 : 3;
      for (let j = 0; j < len; j++)
        fillFaded(drop, RAIN, a, Math.round(x + lean * j), Math.round(y - j));
    } else {
      fillFaded(drop, RAIN, a, Math.round(x) - 1, land, 1, 1);
      fillFaded(drop, RAIN, a, Math.round(x) + 1, land, 1, 1);
      fillFaded(drop, RAIN, a, Math.round(x), land - 1, 1, 1);
    }
  }
};

const drawSnowfall = (pen: Pen, since: number, season: Season, seed: number) => {
  const on = snowing(since);
  if (on <= 0) return;
  const a = 0.9 * on;
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
    const flake = at(pen, aloft(i, 54, near));
    fillFaded(flake, SNOW[0], a, Math.round(x), Math.round(y), near ? 2 : 1, near ? 2 : 1);
  }
};

/** Leaves in autumn, snow in winter, rain in its spells, through the whole room. */
export const drawFalling = (pen: Pen, since: number, seed: number) => {
  const season = seasonAt(since);
  drawFallingLeaves(pen, since, season, seed);
  drawSnowfall(pen, since, season, seed);
  drawRainfall(pen, since, seed);
};
