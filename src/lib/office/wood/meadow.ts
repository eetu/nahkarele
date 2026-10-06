// Friday's flowers: where they come up (korpi's `meadowOf` decides which kind holds each spot as
// the years go, from the shade the stand casts). Bare floor after the blast is the pioneers';
// as the trees close over, the wood's own flowers take over, and a fallen tree's gap brings the
// pioneers back. This is the room's side of it: the spots, the headroom the furniture leaves
// them, and the night that closes the kinds that close.

import { lru } from "@anarkisti/korpi/core";
import type { Pen } from "@anarkisti/korpi/paint";
import { type Flower, type Meadow, meadowOf, shadeOf, type Spot } from "@anarkisti/korpi/plants";
import { meadowPainterOf } from "@anarkisti/korpi/plants/paint";

import { floorZ, grounded, PX_M, ROOM_VIEW } from "../depth";
import { WALL } from "../draw";
import { FLOOR_Y, SCENE_H } from "../engine";
import { dayAt } from "./daylight";
import { FRIDAY, SEASONS_FROM } from "./seasons";
import { standFor } from "./stand";
import { plantWind } from "./wind";

/** Where flowers may come up, scene px, and when there is soil enough there, s: clear of the
 *  trees' feet, the shrubs, and where the exit sign comes down; soonest along the cracks. */
const PLACES = [
  [2, 158, 150],
  [8, 174, 130],
  [54, 158, 70],
  [66, 170, 30],
  [76, 162, 25],
  [92, 176, 40],
  [96, 160, 110],
  [106, 168, 140],
  [136, 158, 35],
  [142, 173, 50],
  [160, 177, 160],
  [182, 158, 170],
  [196, 170, 150],
  [210, 158, 30],
  [224, 167, 35],
  [238, 176, 45],
  [250, 162, 40],
  [258, 173, 55],
  [267, 165, 120],
  [312, 170, 160],
  [318, 157, 180],
] as const;

let spots: Spot[] | null = null;

/** The spots, world m, back to front. A flower in front of what stands on the floor (the AIs,
 *  the desk) keeps under the floor line, so the furniture still reads. */
const spotsOf = (): Spot[] =>
  (spots ??= PLACES.map(([x, y, at]) => {
    const behind = WALL.fronts.some((f) => x >= f.x && x < f.x + f.w);
    const room = behind ? y - FLOOR_Y - 1 : SCENE_H;
    return { x: x / PX_M, z: floorZ(y), at, room: room / PX_M };
  }).sort((a, b) => a.z - b.z));

const meadows = lru<number, Meadow>(8);

/** `seed`'s meadow, under its stand: the grow-in in seven steps, then a year a step. */
const meadowFor = (seed: number): Meadow =>
  meadows.get(seed, () =>
    meadowOf({
      seed,
      cal: FRIDAY,
      spots: spotsOf(),
      shade: shadeOf(standFor(seed)),
      steps: { n: 7, every: 40 },
      growIn: { years: 5, by: SEASONS_FROM },
    }),
  );

/** What holds each spot `since` seconds into friday, if anything, where (world m): for the
 *  tests. */
export const flowersAt = (seed: number, since: number) =>
  meadowFor(seed)
    .heldAt(since)
    .map((held, i): { x: number; z: number; kind: Flower } | null => {
      if (!held) return null;
      const { x, z } = spotsOf()[i];
      return { x, z, kind: held.kind };
    });

const painter = meadowPainterOf({ pxPerM: PX_M, max: 384 });

/** The flowers on the floor in friday's wind, each at its spot's depth, closed for the night. */
export const drawFlowers = (pen: Pen, since: number, seed: number) =>
  painter.draw(
    grounded(pen),
    meadowFor(seed),
    ROOM_VIEW,
    since,
    plantWind(seed),
    dayAt(since).sun === null,
  );
