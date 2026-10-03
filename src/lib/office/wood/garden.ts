// Friday, later: the office becomes a wood, and then the wood has seasons. Everything here is
// a function of `since`, the seconds since friday began, and of friday's `seed`, which shapes
// the trees; the only state is caches. This is the order the room is drawn in; the office
// lays its slabs, desk and arc between the garden and the floor, and its bird before the air.

import { crowTook, drawCrow } from "./crow";
import { drawDeer, drawFliers, drawGlowing, drawSmallLife } from "./life";
import { drawCracks, drawGrass, drawMoss, drawVines } from "./overgrowth";
import { drawSticks } from "./shedding";
import { drawApples, drawTrees, type Knocks } from "./stand";
import { drawSwallows } from "./swallows";
import { drawBackShrubs, drawFrontShrubs } from "./undergrowth";
import { climbTo, drawOnWall, drawRubble, fixtureAt, type Setting } from "./wall";
import { drawFalling, drawGround, drawSillSnow, drawSnowCaps } from "./weather";

export type Friday = { since: number; seed: number; knocks: Knocks };

/** The apples the crow has carried off, for the stand to leave out. */
const takenBy = (since: number, seed: number, fallen: Fallen, knocks: Knocks) => {
  const took = crowTook(since, seed, fallen.wall, knocks);
  return (key: string) => took.get(key);
};

/** The back wall's room, and how to draw what has fallen off it. */
export type Fallen = {
  wall: Setting;
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
  drawMoss(ctx, since);
  const sill = fixtureAt("window", since, seed, fallen.wall).on;
  drawOnWall(ctx, (wall) => {
    drawCracks(wall);
    drawSillSnow(wall, since, sill);
    drawVines(wall, since, seed);
  });
  drawRubble(ctx, since, seed, fallen.wall, fallen.draw);
  drawSticks(ctx, since, seed, false);
  drawTrees(ctx, since, seed, knocks, false);
  drawGround(ctx, since);
  drawBackShrubs(ctx, since, seed);
  drawGrass(ctx, since, seed);
  drawApples(ctx, since, seed, knocks, false, takenBy(since, seed, fallen, knocks));
};

/** What is in front of it, back to front: the trees that stand clear of the desk and their
 *  apples, snow on the furniture, the small animals, the low shrubs along the near edge, the
 *  deer. */
export const drawFloor = (
  ctx: CanvasRenderingContext2D,
  { since, seed, knocks }: Friday,
  fallen: Fallen,
) => {
  drawSticks(ctx, since, seed, true);
  drawTrees(ctx, since, seed, knocks, true);
  drawApples(ctx, since, seed, knocks, true, takenBy(since, seed, fallen, knocks));
  drawSnowCaps(ctx, since);
  drawSmallLife(ctx, since, (x, y) => climbTo(x, y, since, seed, fallen.wall));
  drawCrow(ctx, since, seed, fallen.wall, knocks, "floor");
  drawFrontShrubs(ctx, since, seed);
  drawDeer(ctx, since);
};

/** What flies and falls, over everything. */
export const drawAir = (
  ctx: CanvasRenderingContext2D,
  { since, seed, knocks }: Friday,
  fallen: Fallen,
) => {
  drawFliers(ctx, since, seed, knocks);
  drawCrow(ctx, since, seed, fallen.wall, knocks, "air");
  drawSwallows(ctx, since);
  drawFalling(ctx, since, seed);
};

/** What gives its own light, over the night's shade: the fireflies. */
export const drawGlow = (ctx: CanvasRenderingContext2D, { since, seed }: Friday) =>
  drawGlowing(ctx, since, seed);
