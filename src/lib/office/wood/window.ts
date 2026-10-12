// Friday's window, korpi's (`window`): two panes each side of the middle bar and the transom,
// cracked where the blast struck them and one of them gone, its jagged edge left in the frame;
// the room's light catches what glass is left, and rain runs down it. The blows are laid down
// once a seed, so a reload breaks the same panes.

import { lru, type Rgba } from "@anarkisti/korpi/core";
import type { Pen } from "@anarkisti/korpi/paint";
import { type Window, windowOf } from "@anarkisti/korpi/window";
import { paintWindow, WINDOW_LOOK } from "@anarkisti/korpi/window/paint";

import { hash } from "$lib/scene/pixel";

import { PX_M, ROOM_VIEW, Z } from "../depth";
import type { Rect } from "./wall";
import { raining } from "./weather";

/** What a pane takes before it shatters, J (korpi's), and the blast's blow on one it cracks. */
const BREAKS = 25;
const CRACKS_J = [1.5, 6];

const windows = lru<number, Window>(4);

/** The window in `opening` (scene px, its frame and all) as `seed`'s blast left it. */
const windowFor = (seed: number, opening: Rect): Window =>
  windows.get(seed, () => {
    const { x, y, w, h } = opening;
    const top = ROOM_VIEW.unproject(x, y, -Z.hung);
    const foot = ROOM_VIEW.unproject(x + w, y + h, -Z.hung);
    const win = windowOf({
      box: { x0: top.x, x1: foot.x, y0: foot.y, y1: top.y },
      z: Z.hung,
      panes: 2,
      frame: 2 / PX_M,
      bar: 2 / PX_M,
      transom: (top.y + foot.y) / 2,
      breaks: BREAKS,
      seed,
    });
    // One pane gone, one in four of the rest whole, the others struck once.
    const gone = Math.floor(hash(seed, 71) * win.panes.length);
    win.panes.forEach((pane, i) => {
      if (i !== gone && hash(seed, i, 72) < 0.25) return;
      const b = pane.box;
      const px = b.x0 + (b.x1 - b.x0) * (0.2 + 0.6 * hash(seed, i, 73));
      const py = b.y0 + (b.y1 - b.y0) * (0.2 + 0.6 * hash(seed, i, 74));
      const [lo, hi] = CRACKS_J;
      win.strike(px, py, i === gone ? BREAKS : lo + (hi - lo) * hash(seed, i, 75), 0);
    });
    return win;
  });

/** The window hanging in `opening` `since` seconds into friday, in its rain (or `rain`, 0..1):
 *  frame `frame`, through `pen` (at the room's depths: the window keeps its own). */
export const paintFridayWindow = (
  pen: Pen,
  opening: Rect,
  since: number,
  seed: number,
  frame: Rgba,
  rain = raining(since),
) =>
  paintWindow(pen, ROOM_VIEW, windowFor(seed, opening), since, {
    rain,
    look: { ...WINDOW_LOOK, frame },
  });
