// Friday's weather: what the window shows, the litter and snow on the ground and the
// ledges, and the leaves, flakes and drops that fall through the room on the wind. The year's
// spells, the snow and the rain are korpi's; the storm after the blast is friday's own.

import type { Box3 } from "@anarkisti/korpi/core";
import { clear, type Pen, type Raster, raster, rasterPen } from "@anarkisti/korpi/paint";
import { crownOf, deciduous } from "@anarkisti/korpi/plants";
import { autumnOf } from "@anarkisti/korpi/plants/paint";
import { rainAt, snowAt, weatherAt } from "@anarkisti/korpi/sky";
import {
  paintRainfall,
  paintSnowCaps,
  paintSnowfall,
  paintSnowGround,
} from "@anarkisti/korpi/sky/paint";

import { fill, paintRaster } from "$lib/scene/pen";
import { hash, ramp } from "$lib/scene/pixel";
import type { Weather } from "$lib/scene/sky";

import { at, FLAT, floorZ, onFloor, PX_M, ROOM_VIEW, Z } from "../depth";
import { FLOOR_Y, SCENE_H, SCENE_W } from "../engine";
import { dayAt } from "./daylight";
import { FRIDAY, litter, type Season, seasonAt, SEASONS_FROM, snowCover, STORM_S } from "./seasons";
import { ROOT_Y, sceneOf, standFor, standing } from "./stand";
import { driftOf, fridayAir } from "./wind";

const AUTUMN = ["#d9a441", "#e07b2a", "#c8452f", "#b3741f"];

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
export const raining = (since: number) =>
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

/** The room's floor, m: wall to wall, from the wall's foot out to the near edge. */
const FLOOR = { x0: 0, x1: SCENE_W / PX_M, z0: 0, z1: floorZ(SCENE_H) };

/** A ledge the snow settles on: its front edge's top at scene (x, y), `w` px long, `z` m out. */
const ledge = (x: number, y: number, w: number, z: number): Box3 => {
  const a = ROOM_VIEW.unproject(x, y, -z);
  return { x0: a.x, x1: a.x + w / PX_M, y0: a.y - 0.05, y1: a.y, z0: z - 0.05, z1: z };
};
/** The AIs' tops (`SLAB` in office/draw.ts) and the desk's, at the depth of what is on them:
 *  korpi lays the snow a millimetre in front, at `Z.slabSnow` and `Z.deskSnow`. */
const FURNITURE = [
  ledge(6, 32, 44, Z.slabFace),
  ledge(270, 32, 44, Z.slabFace),
  ledge(104, 118, 112, Z.onDesk),
];
/** The window's sill, on the wall. */
const SILL = [ledge(126, 60, 68, 0)];

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
    const key = `${Math.round(snow * 30)}`;
    layer(onFloor(pen, FLAT.snow), "snow", key, (off) =>
      paintSnowGround(off, ROOM_VIEW, FLOOR, Math.round(snow * 30) / 30),
    );
  }
};

/** Snow on the window sill (`pen` on the wall), while the window hangs: the sill goes down
 *  with it. */
export const drawSillSnow = (pen: Pen, since: number, hanging: boolean) => {
  if (hanging) paintSnowCaps(pen, ROOM_VIEW, SILL, snowCover(since));
};

/** Snow on the slabs and the desk. */
export const drawSnowCaps = (pen: Pen, since: number) =>
  paintSnowCaps(pen, ROOM_VIEW, FURNITURE, snowCover(since));

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
    // Anywhere from just off the wall to the near floor; past the floor there, under it.
    const z = 0.1 + 2.4 * hash(i, 48);
    at(pen, z).fill(colours[i % colours.length], Math.round(x), Math.round(y), 2, 1);
  }
};

/** How fast a leaf rides a wind of 1, scene px/s. */
const LEAF_PX_S = 20;

/** Across the room with a little either side, from up past the top of the view (at the near
 *  edge of the floor) down to the floor, m. */
const ACROSS = { x0: -0.25, x1: SCENE_W / PX_M + 0.25, y0: 0, y1: (SCENE_H + 10) / PX_M };
/** Rain through the room now that the roof is gone, splashing on the floor from a little off
 *  the wall to the near edge; snow carried in from just off the wall to the near floor. */
const RAIN = { ...ACROSS, z0: floorZ(FLOOR_Y + 2), z1: floorZ(SCENE_H - 2) };
const SNOW = { ...ACROSS, z0: 0.1, z1: 2.5 };
/** Half a floor row nearer, m: a drop splashes on the floor whichever way its row rounds. */
const SPLASH = 0.05;

/** Leaves in autumn, snow in winter, rain in its spells, through the whole room. */
export const drawFalling = (pen: Pen, since: number, seed: number) => {
  drawFallingLeaves(pen, since, seasonAt(since), seed);
  const air = fridayAir(seed);
  const snow = snowing(since);
  if (snow > 0) {
    const flakes = snowAt({ seed, volume: SNOW, count: 90 }, air, since, snow);
    paintSnowfall(pen, ROOM_VIEW, flakes);
  }
  const rain = raining(since);
  if (rain > 0) {
    const drops = rainAt({ seed, volume: RAIN, count: 70 }, air, since, rain);
    paintRainfall(at(pen, SPLASH), ROOM_VIEW, drops);
  }
};
