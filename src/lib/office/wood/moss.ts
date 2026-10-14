// Moss: first over friday's floor, out from the cracks and the climbers' roots (korpi's
// `mossOf`, painted by its moss painter), and later over whatever comes to lie on it. The floor's
// patch is the room's: the strip below the floor line, 8 m by 0.75 m as the room's view shows it.

import { lru, type Rgba } from "@anarkisti/korpi/core";
import { type Pen, shifted } from "@anarkisti/korpi/paint";
import { type Moss, mossOf } from "@anarkisti/korpi/plants";
import { MOSSES, mossPainterOf } from "@anarkisti/korpi/plants/paint";
import type { SurfaceGrid } from "@anarkisti/korpi/wet/paint";

import { hash } from "$lib/scene/pixel";

import { floorZ, PX_M, SLOPE } from "../depth";
import { FLOOR_Y, SCENE_H, SCENE_W } from "../engine";
import { lookAt, seasonAt } from "./seasons";

/** A moss pixel at scene (x, y): lit where it is `top`, in `since`'s season. The room's own
 *  dither of korpi's moss. */
export const mossColour = (x: number, y: number, top: boolean, since: number): Rgba => {
  const m = MOSSES[seasonAt(since).k];
  return top || hash(x, y, 71) > 0.85 ? m.lit : m.body[Math.floor(hash(x, y, 72) * 3)];
};

const floors = lru<number, Moss>(4);
const painter = mossPainterOf();

/** The floor's moss, spreading out from `sources` (scene px, where it starts: the cracks, the
 *  climbers' roots), its cushions from `seed`. */
export const floorMossOf = (seed: number, sources: readonly (readonly [number, number])[]) =>
  floors.get(seed, () =>
    mossOf({
      seed,
      w: SCENE_W / PX_M,
      h: (SCENE_H - FLOOR_Y) / PX_M,
      sources: sources.map(([x, y]) => ({ x: x / PX_M, y: (y - FLOOR_Y) / PX_M })),
    }),
  );

/** The floor's moss `since` seconds into friday. Repainted while it grows and when the season
 *  turns. */
export const drawMoss = (
  pen: Pen,
  since: number,
  seed: number,
  sources: readonly (readonly [number, number])[],
) =>
  painter.draw(
    shifted(pen, { dy: FLOOR_Y }),
    floorMossOf(seed, sources),
    since,
    lookAt(since),
    PX_M,
  );

/** Where `moss` has come by `since` over the floor, in the room's metres (x across, z out from
 *  the wall, a node a moss cell apart): 1 where it has. The moss lies in the floor as the view
 *  shows it, a metre of the floor's depth a quarter of a metre of its rows. */
export const mossOver = (moss: Moss, since: number): SurfaceGrid & { v: Float32Array } => {
  const { cell, cols } = moss;
  const rows = Math.ceil(floorZ(SCENE_H) / cell) + 1;
  const v = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const r = Math.min(moss.rows - 1, Math.floor(j * SLOPE));
    for (let i = 0; i < cols; i++) v[j * cols + i] = moss.cells[r * cols + i] <= since ? 1 : 0;
  }
  return { x0: 0, z0: 0, cell, cols, rows, v };
};
