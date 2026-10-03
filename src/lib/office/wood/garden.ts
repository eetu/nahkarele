// Friday, later: the office becomes a wood, and then the wood has seasons. Everything here is
// a function of `since`, the seconds since friday began, and of friday's `seed`, which shapes
// the trees; the only state is caches. This is the order the room is drawn in; the office
// lays its slabs, desk and arc between the garden and the floor, and its bird before the air.

import { drawDeer, drawFliers, drawSmallLife } from "./life";
import { drawCracks, drawGrass, drawMoss, drawVines } from "./overgrowth";
import { drawApples, drawTrees, type Knocks } from "./stand";
import { drawBackShrubs, drawFrontShrubs } from "./undergrowth";
import { drawRubble, type Fixtures } from "./wall";
import { drawFalling, drawGround, drawSillSnow, drawSnowCaps } from "./weather";

export type Friday = { since: number; seed: number; knocks: Knocks };

/** What hangs on the back wall, the openings among it, and how to draw one that has fallen. */
export type Fallen = {
  fixtures: Fixtures;
  openings: string[];
  draw: (ctx: CanvasRenderingContext2D, name: string, x: number, y: number) => void;
};

/**
 * What grows, behind the desk, back to front: the floor going green, what is on the back wall
 * (the sill's snow, the climbers), what has come down off it, the trees, the shrubs at their
 * feet, the grass, the apples.
 */
export const drawGarden = (
  ctx: CanvasRenderingContext2D,
  { since, seed, knocks }: Friday,
  fallen: Fallen,
) => {
  drawCracks(ctx);
  drawMoss(ctx, since);
  drawSillSnow(ctx, since);
  drawVines(ctx, since, seed);
  drawRubble(ctx, since, seed, fallen.fixtures, fallen.openings, fallen.draw);
  drawTrees(ctx, since, seed, knocks);
  drawGround(ctx, since);
  drawBackShrubs(ctx, since, seed);
  drawGrass(ctx, since, seed);
  drawApples(ctx, since, seed, knocks);
};

/** What is in front of it, back to front: snow on the furniture, the small animals, the low
 *  shrubs along the near edge, the deer. */
export const drawFloor = (ctx: CanvasRenderingContext2D, { since, seed }: Friday) => {
  drawSnowCaps(ctx, since);
  drawSmallLife(ctx, since);
  drawFrontShrubs(ctx, since, seed);
  drawDeer(ctx, since);
};

/** What flies and falls, over everything. */
export const drawAir = (ctx: CanvasRenderingContext2D, { since, seed, knocks }: Friday) => {
  drawFliers(ctx, since, seed, knocks);
  drawFalling(ctx, since, seed);
};
