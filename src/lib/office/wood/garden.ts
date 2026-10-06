// Friday, later: the office becomes a wood, and then the wood has seasons. Everything here is
// a function of `since`, the seconds since friday began, and of friday's `seed`, which shapes
// the trees; the only state is caches. Each part is painted where it is in the room, at its own
// depth (`../depth.ts`), so the office lays its furniture among them in any order; what is
// translucent (the rain, the snow, the fireflies) comes last, over whatever is behind it.

import type { Pen } from "@anarkisti/korpi/paint";

import { at, Z } from "../depth";
import { crowTook, drawCrow } from "./crow";
import { drawDeer, drawFliers, drawGlowing, drawSmallLife } from "./life";
import { drawFlowers } from "./meadow";
import { drawCracks, drawGrass, drawMoss, drawVines } from "./overgrowth";
import { drawSticks } from "./shedding";
import { drawApples, drawTrees, type Knocks } from "./stand";
import { drawSwallows } from "./swallows";
import { drawShrubs } from "./undergrowth";
import { climbTo, fixtureAt, onWall, type Setting } from "./wall";
import { drawFalling, drawGround, drawSillSnow, drawSnowCaps } from "./weather";

export type Friday = { since: number; seed: number; knocks: Knocks };

/** The apples the crow has carried off, for the stand to leave out. */
const takenBy = (since: number, seed: number, wall: Setting, knocks: Knocks) => {
  const took = crowTook(since, seed, wall, knocks);
  return (key: string) => took.get(key);
};

/**
 * What grows: the floor going green and its cracks, the litter and the snow on it; what is on
 * the back wall (the sill's snow, the climbers); the trees and what they drop, the shrubs, the
 * grass and the flowers, the apples; snow on the furniture. What has come down off the wall
 * lies among them (`paintWall`).
 */
export const drawGarden = (pen: Pen, { since, seed, knocks }: Friday, wall: Setting) => {
  drawMoss(pen, since, seed);
  drawCracks(pen);
  drawGround(pen, since);
  const sill = fixtureAt("window", since, seed, wall).on;
  const on = onWall(at(pen, Z.onWall), since, seed, wall);
  drawSillSnow(on, since, sill);
  drawVines(on, since, seed);
  drawSticks(pen, since, seed);
  drawTrees(pen, since, seed, knocks);
  drawShrubs(pen, since, seed);
  drawGrass(pen, since, seed);
  drawFlowers(pen, since, seed);
  drawApples(pen, since, seed, knocks, takenBy(since, seed, wall, knocks));
  drawSnowCaps(pen, since);
};

/** What lives in it: the small animals, the deer, the crow, the swallows, the butterflies and
 *  the owl. */
export const drawLife = (pen: Pen, { since, seed, knocks }: Friday, wall: Setting) => {
  const climb = (x: number, y: number) => climbTo(x, y, since, seed, wall);
  drawSmallLife(pen, since, seed, climb);
  drawDeer(pen, since);
  drawCrow(pen, since, seed, wall, knocks);
  drawSwallows(pen, since);
  drawFliers(pen, since, seed, knocks);
};

/** What falls through the room: leaves, snow, rain. */
export const drawAir = (pen: Pen, { since, seed }: Friday) => drawFalling(pen, since, seed);

/** What gives its own light: the fireflies. */
export const drawGlow = (pen: Pen, { since, seed }: Friday) => drawGlowing(pen, since, seed);
