// Where things are in the room, for depth. The room is one scene raster seen through korpi's
// oblique view, the floor line its horizon, the back wall at z = 0 (metres toward the viewer): a
// point on the floor at scene row y is (y − FLOOR_Y) / 10 m out. Everything is painted at its own
// z, so whatever is nearer covers whatever is farther where they meet; what is beyond the wall
// is behind it, under the open sky.

import { type Pen, shifted } from "@anarkisti/korpi/paint";
import { obliqueView } from "@anarkisti/korpi/view";

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

/** What lies flat on the floor, each a hair over the one before. */
export const FLAT = { floor: 0, moss: 1e-4, cracks: 2e-4, litter: 3e-4, snow: 4e-4 } as const;
/** What stands on the floor is this far over what lies flat there, at its foot. */
const FOOT = 1e-3;

/** `pen` at `z` m out. */
export const at = (pen: Pen, z: number): Pen => shifted(pen, { dd: -z });

/** The rows a fill covers, as the raster pen rounds them. */
const rows = (y: number, h: number): [number, number] => [Math.round(y), Math.round(y + h)];

/**
 * `pen` (in scene px) laying what is flat on the floor, `lift` m over it: every row at the
 * floor's depth there, whatever depth it is given.
 */
export const onFloor = (pen: Pen, lift = 0): Pen => {
  const d = (y: number) => -(floorZ(y) + lift);
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

/**
 * `pen` (in scene px) that puts nothing under the floor: what reaches below the floor where it
 * is painted (a leaf below its root, an apple's lower half) lies on the floor there.
 */
export const grounded = (pen: Pen): Pen => {
  const lowest = (y: number) => -(floorZ(y) + FOOT);
  const out: Pen = {
    fill: (c, x, y, w = 1, h = 1, d = 0) => {
      const [y0, y1] = rows(y, h);
      if (y1 <= y0) return;
      if (d <= lowest(y1 - 1)) {
        pen.fill(c, x, y, w, h, d);
        return;
      }
      for (let r = y0; r < y1; r++) pen.fill(c, x, r, w, 1, Math.min(d, lowest(r)));
    },
    span: (c, x0, x1, y, d0, dd = 0) => {
      const floor = lowest(Math.round(y));
      if (dd === 0 || (d0 <= floor && d0 + dd * (x1 - x0) <= floor)) {
        pen.span(c, x0, x1, y, Math.min(d0, floor), dd);
        return;
      }
      const s0 = Math.round(x0);
      for (let x = s0; x < Math.round(x1); x++)
        pen.fill(c, x, y, 1, 1, Math.min(d0 + (x - s0) * dd, floor));
    },
  };
  const { glowing } = pen;
  return glowing ? { ...out, glowing: (g) => grounded(glowing(g)) } : out;
};

/** `pen` (in scene px) for something standing on the floor `z` m out. */
export const standing = (pen: Pen, z: number): Pen => at(grounded(pen), z);

/** `pen` (in scene px) for something standing on the floor with its foot on scene row `y`. */
export const footAt = (pen: Pen, y: number): Pen => standing(pen, floorZ(y));

/** Under cover: the room in front of the wall, not the world beyond it. */
export const covered = (p: { z: number }) => (p.z > -0.0005 ? 1 : 0);
