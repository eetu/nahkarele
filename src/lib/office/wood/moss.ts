// Moss: first over friday's floor, out from the cracks and the climbers' roots (korpi's
// `mossOf`, painted by its moss painter), and later over whatever comes to lie on it. The floor's
// patch is the room's: the strip below the floor line, 8 m by 0.75 m as the room's view shows it.

import { lru, type Rgba } from "@anarkisti/korpi/core";
import { type Pen, shifted } from "@anarkisti/korpi/paint";
import { type Moss, mossOf } from "@anarkisti/korpi/plants";
import { MOSSES, mossPainterOf } from "@anarkisti/korpi/plants/paint";

import { hash } from "$lib/scene/pixel";

import { PX_M } from "../depth";
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

/**
 * The floor's moss `since` seconds into friday, spreading out from `sources` (scene px, where it
 * starts: the cracks, the climbers' roots), its cushions from `seed`. Repainted while it grows
 * and when the season turns.
 */
export const drawMoss = (
  pen: Pen,
  since: number,
  seed: number,
  sources: readonly (readonly [number, number])[],
) => {
  const moss = floors.get(seed, () =>
    mossOf({
      seed,
      w: SCENE_W / PX_M,
      h: (SCENE_H - FLOOR_Y) / PX_M,
      sources: sources.map(([x, y]) => ({ x: x / PX_M, y: (y - FLOOR_Y) / PX_M })),
    }),
  );
  painter.draw(shifted(pen, { dy: FLOOR_Y }), moss, since, lookAt(since), PX_M);
};
