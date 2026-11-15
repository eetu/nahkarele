// Where things are in the room, for depth. The room is one scene raster seen through korpi's
// oblique view, the floor line its horizon, the back wall at z = 0 (metres toward the viewer): a
// point on the floor at scene row y is (y − FLOOR_Y) / 10 m out. Everything is painted at its own
// z, so whatever is nearer covers whatever is farther where they meet; what is beyond the wall
// is behind it, under the open sky.

import { coverOf } from "@anarkisti/korpi/light";
import { floored, type Pen, shifted } from "@anarkisti/korpi/paint";
import { floorDepths, groundDepth, linesOf, obliqueView } from "@anarkisti/korpi/view";

import { FLOOR_Y, SCENE_H, SCENE_W } from "./engine";

/** Scene px a metre is wide in the room (the desk's scale), and down the scene a metre of
 *  depth slides a point (the masonry's slope). */
export const PX_M = 40;
export const SLOPE = 0.25;

export const ROOM_VIEW = obliqueView({
  w: SCENE_W,
  h: SCENE_H,
  pxPerM: PX_M,
  k: SLOPE,
  horizon: FLOOR_Y,
});

/** Beyond the wall, z in metres: the land, and the sky. */
export const OUTSIDE_Z = -50;
export const SKY_Z = -1e4;

/** How far out the floor is at scene row `y`, m. */
export const floorZ = (y: number) => (y - FLOOR_Y) / (SLOPE * PX_M);

/** Where what does not stand on the floor is, m out from the wall. */
export const Z = {
  /** On the wall: sill snow, climbers, the snail. What hangs on it, and the readouts in that. */
  onWall: 0.01,
  hung: 0.02,
  readout: 0.021,
  /** The spider, down its thread from the top of the wall. */
  spider: 0.05,
  /** Behind the desk: the chair, and whoever sits in it. */
  chair: 0.1,
  /** The AIs' faces, what shows on them, snow on their tops, the ivy over them, the swallows'
   *  nest on #1 and a swallow on it. The arc runs face to face. */
  slab: 0.35,
  slabFace: 0.351,
  slabSnow: 0.352,
  ivy: 0.36,
  nest: 0.37,
  nesting: 0.375,
  /** The desk top's back edge, under what stands on it. */
  deskBack: 0.37,
  /** On the desk: the CRT, the charger, the tray and its tokens, the jar, the cake, the tit and
   *  its seeds, the drone asleep; snow in front of them, the crow in front of that. Just behind
   *  the desk's front, so the back lane's trees (rooted at 0.3) stand behind them. */
  onDesk: 0.38,
  deskSnow: 0.381,
  deskCrow: 0.382,
  /** Tokens in flight between the AIs and the tray, in front of both. */
  tokens: 0.385,
  /** The desk's front and the top in front of what stands on it. */
  desk: 0.4,
  /** In the air: the drone, the swallows, butterflies and the crow, fireflies. */
  drone: 0.5,
  swallows: 0.8,
  fliers: 1,
  fireflies: 1.2,
} as const;

/** What lies flat on the floor, how far over it, m: each a hair over the one before, all under
 *  what stands on it (`FLOOR_DEPTHS`, a millimetre nearer in depth, a quarter of one in height). */
export const FLAT = { floor: 0, moss: 2.5e-5, cracks: 5e-5, litter: 7.5e-5, snow: 1e-4 } as const;

/** `pen` at `z` m out. */
export const at = (pen: Pen, z: number): Pen => shifted(pen, { dd: -z });

/** The rows a fill covers, as the raster pen rounds them. */
const rows = (y: number, h: number): [number, number] => [Math.round(y), Math.round(y + h)];

const LINES = linesOf(ROOM_VIEW);

/**
 * `pen` (in scene px) laying what is flat on the floor, `lift` m over it: every row at the depth
 * ground that high is seen at there (korpi's `groundDepth`, as its moss and wet mirror take it),
 * whatever depth it is given.
 */
export const onFloor = (pen: Pen, lift = 0): Pen => {
  const d = (y: number) => groundDepth(LINES, lift, y + 0.5);
  const out: Pen = {
    fill: (c, x, y, w = 1, h = 1) => {
      const [y0, y1] = rows(y, h);
      for (let r = y0; r < y1; r++) pen.fill(c, x, r, w, 1, d(r));
    },
    span: (c, x0, x1, y) => pen.span(c, x0, x1, y, d(Math.round(y)), 0),
  };
  const { glowing } = pen;
  return glowing ? { ...out, glowing: (g) => onFloor(glowing(g), lift) } : out;
};

/** The floor as the room's view draws it, a millimetre nearer: what is drawn through korpi's
 *  `floored` over it reaches no deeper (a leaf below its root, an apple's lower half lie on it). */
export const FLOOR_DEPTHS = floorDepths(ROOM_VIEW);

/** `pen` (in scene px) for something standing on the floor `z` m out. */
export const standing = (pen: Pen, z: number): Pen => at(floored(pen, FLOOR_DEPTHS), z);

/** `pen` (in scene px) for something standing on the floor with its foot on scene row `y`. */
export const footAt = (pen: Pen, y: number): Pen => standing(pen, floorZ(y));

/** Under cover, the room: from half a millimetre behind the wall's face out (its top and the beds
 *  its gaps leave, further back, are in the open with the world beyond it). */
export const COVER = coverOf([{ z0: -Math.fround(0.0005) }]);
