// Friday's floor plants, flowers and shrubs (korpi's undergrowth): spots strewn over the floor
// clear of the trees' feet, each held as the years go by the kind whose niche the stand's shade
// suits. Bare floor after the blast is the pioneers'; as the trees close over, the wood's own
// take over, and a fallen tree's gap brings the pioneers back. This is the room's side of it:
// which kinds, where the floor is and what must stay clear on it, the soil the moss makes, the
// headroom the furniture leaves, and the night that closes the kinds that close.

import { lru } from "@anarkisti/korpi/core";
import { BILBERRY, FLOWERS, JUNIPER, LILAC, RASPBERRY } from "@anarkisti/korpi/flora";
import type { Pen } from "@anarkisti/korpi/paint";
import { type FloorKind, type Meadow, undergrowthOf } from "@anarkisti/korpi/plants";
import { meadowPainterOf } from "@anarkisti/korpi/plants/paint";

import { floorZ, PX_M, ROOM_VIEW, SLOPE } from "../depth";
import { WALL } from "../draw";
import { FLOOR_Y, SCENE_H, SCENE_W } from "../engine";
import { dayAt } from "./daylight";
import { floorMoss } from "./overgrowth";
import { SEASONS_FROM } from "./seasons";
import { standFor } from "./stand";
import { plantWind } from "./wind";

/** What comes up on the floor, in the order tried: the flowers, then the shrubs. */
const KINDS: readonly FloorKind[] = [...FLOWERS, RASPBERRY, JUNIPER, LILAC, BILBERRY];

/** The floor, world m: the room's width, from the furniture's feet to the scene's foot. */
const FLOOR = {
  x0: 2 / PX_M,
  x1: (SCENE_W - 2) / PX_M,
  z0: floorZ(FLOOR_Y + 2),
  z1: floorZ(SCENE_H - 1),
};
/** Spots a square metre of it. */
const PER = 1.2;
/** Where the exit sign comes down, scene px across: kept clear, so it can be found and pressed. */
const EXIT = { x0: 140, x1: 182 };

/** How far a plant spreads either side of its root, scene px: one this near the furniture
 *  stands in front of it. */
const SPREAD = 12;

/** A floor point, world m, in scene px: across, and its row. */
const sceneOf = (x: number, z: number) => ({ x: x * PX_M, row: FLOOR_Y + z * SLOPE * PX_M });
/** What stands on the floor across `x` (scene px), `by` px either side. */
const fronting = (x: number, by = 0) =>
  WALL.fronts.filter((f) => x >= f.x - by && x < f.x + f.w + by);

/** Whether a plant may come up at (x, z): not where the exit sign lands, nor behind the
 *  furniture's feet, where it would not show. */
const keep = (x: number, z: number) => {
  const at = sceneOf(x, z);
  return (at.x < EXIT.x0 || at.x >= EXIT.x1) && fronting(at.x).every((f) => at.row > f.y + f.h);
};

/** The most a plant at (x, z) may stand, m: in front of what stands on the floor (the AIs, the
 *  desk) it keeps under the floor line, so the furniture still reads. */
const roomAt = (x: number, z: number) => {
  const at = sceneOf(x, z);
  return (fronting(at.x, SPREAD).length ? at.row - FLOOR_Y - 1 : SCENE_H) / PX_M;
};

/** When there is soil at (x, z), s: when the moss, out from the cracks, has come. */
const soilAt = (seed: number, x: number, z: number) => {
  const moss = floorMoss(seed);
  const i = Math.min(moss.cols - 1, Math.floor(x / moss.cell));
  const r = Math.min(moss.rows - 1, Math.floor((z * SLOPE) / moss.cell));
  return moss.cells[r * moss.cols + i];
};

const floors = lru<number, Meadow>(8);

/** `seed`'s floor under its stand (korpi's undergrowth): the grow-in in seven steps, then a year
 *  a step, each spot with the soil and headroom the room gives it there. */
export const floorFor = (seed: number): Meadow =>
  floors.get(seed, () =>
    undergrowthOf({
      ...{ stand: standFor(seed), kinds: KINDS, floor: FLOOR, per: PER, keep },
      soil: (x, z) => soilAt(seed, x, z),
      room: roomAt,
      steps: { n: 7, every: 40 },
      growIn: { years: 5, by: SEASONS_FROM },
    }),
  );

/** What holds each spot `since` seconds into friday, where (world m), and its room: for the
 *  tests. */
export const floorPlantsAt = (seed: number, since: number) =>
  floorFor(seed)
    .plantsAt(since)
    .map(({ kind, x, z }) => ({ kind, x, z, room: roomAt(x, z) }));

const painter = meadowPainterOf({ pxPerM: PX_M, max: 384 });

/** The floor's plants in friday's wind, each at its spot's depth, the flowers that close shut
 *  for the night; drawn coarser, a share of them rustle. */
export const drawFloorPlants = (pen: Pen, since: number, seed: number, detail = 0) =>
  painter.draw(
    pen,
    floorFor(seed),
    ROOM_VIEW,
    since,
    plantWind(seed),
    dayAt(since).sun === null,
    detail,
  );
