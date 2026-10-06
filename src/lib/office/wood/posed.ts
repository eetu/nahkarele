// Things that move in the wind, painted in pixels: korpi's posed paintings
// (`@anarkisti/korpi/posed`), one keeping for the room's soft plants and the workbench's. A
// shrub or a climber is painted once at rest, part by part; each frame every part is put back
// where its pose has it, through the pen it is drawn with. The physics is korpi's `rustleOf`.

import type { Pen } from "@anarkisti/korpi/paint";
import { type Painter, type Pose, posedOf } from "@anarkisti/korpi/posed";

export type { Painter, Pose, Pt } from "@anarkisti/korpi/posed";

const paintings = posedOf({ max: 1024 });

/**
 * Draw a painting posed: painted once per `key` (growth step and season) under `name`, then
 * each part moved as `pose` says, in the order it was painted, through `pen`.
 */
export const drawPosed = (pen: Pen, name: string, key: string, paint: Painter, pose: Pose) =>
  paintings.draw(pen, name, key, paint, pose);
