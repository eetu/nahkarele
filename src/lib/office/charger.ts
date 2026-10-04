// The drone's charger on friday. The box at the desk's right end was one all along: at
// friday's first dusk, the power long gone, a mast comes up out of it and a solar panel
// unfolds over it like a roof over a parking place. By day the panel turns to the sun and
// fills the box; at dusk the drone comes down onto the box and sleeps the night there, its
// rotors still, and rises at dawn, as the birds do. All of it read off friday's clock.

import { rect, smooth } from "$lib/scene/pixel";
import { daylight } from "$lib/scene/sky";

import { dayAt } from "./wood/daylight";
import { STORM_S } from "./wood/seasons";
import { windowAt } from "./wood/weather";

/** The box, scene px: on the desk, at its right end. */
export const BOX = { x: 198, y: 113, w: 14, h: 5 };
/** The mast's height over the box, and the panel's width, px. */
const MAST = 14;
const PANEL = 13;
/** The light the drone comes down in and goes up in, on the birds' scale (they roost below
 *  it), and how far either side of it the going takes. */
const DUSK = 0.3;
const EASE = 0.12;
/** How long the charger takes to come out of the box, s. */
const UNFOLD_S = 2.5;

const C = {
  box: "#6b7075",
  lit: "#9aa0a6",
  mast: "#7d8389",
  frame: "#9aa0a6",
  cell: "#2c3e66",
  grid: "#55709a",
  sun: "#e8b84a",
  full: "#58e070",
};

const lightAt = (since: number) => daylight(windowAt(since).progress);

let opening: number | null = null;
/** When the box opens: at friday's first dusk, a little before the drone wants it. */
export const opensAt = () => {
  if (opening === null) {
    let t = STORM_S;
    while (lightAt(t) < DUSK + 0.3 && t < STORM_S + 300) t += 0.25;
    while (lightAt(t) >= DUSK + EASE && t < STORM_S + 600) t += 0.25;
    opening = t - UNFOLD_S - 1;
  }
  return opening;
};

/** How far out of the box the charger is `since` seconds into friday, 0 to 1. */
export const openAt = (since: number) => Math.min(1, Math.max(0, (since - opensAt()) / UNFOLD_S));

/** How far down onto the box the drone is, 0 (about the room) to 1 (asleep on it): it goes
 *  as the light goes, once there is somewhere to go. */
export const dockAt = (since: number) => {
  if (openAt(since) < 1) return 0;
  return 1 - smooth((lightAt(since) - (DUSK - EASE)) / (2 * EASE));
};

/** Where the drone sits on the box: its middle, and its top (it is 7 px tall). */
export const PAD = { x: BOX.x + BOX.w / 2, y: BOX.y - 7 };

/** The panel's tilt toward the sun, in whole px of rise from end to end (- left end down,
 *  facing a sun on the left); lying flat at night. */
export const tiltAt = (since: number) => {
  const sun = dayAt(since).sun;
  return sun ? Math.round((sun.across - 0.5) * 4) : 0;
};

/** The box as the working week has it: three lights on its top. */
export const drawBox = (ctx: CanvasRenderingContext2D) => {
  rect(ctx, C.box, BOX.x, BOX.y, BOX.w, BOX.h);
  for (let i = 0; i < 3; i++) rect(ctx, C.lit, BOX.x + 2 + i * 4, BOX.y + 1, 2, 2);
};

/** Its light: amber while the sun fills it, green while the drone takes it, flashing as the
 *  charger comes out. */
export const drawChargerLight = (
  ctx: CanvasRenderingContext2D,
  open: number,
  sunUp: boolean,
  docked: number,
  t: number,
) => {
  if (open <= 0) return;
  const on = open < 1 ? Math.floor(t * 8) % 2 === 0 : docked > 0.5 || Math.floor(t * 1.5) % 2;
  if (!on) return;
  rect(ctx, docked > 0.5 ? C.full : sunUp ? C.sun : C.full, BOX.x + 2, BOX.y + 1, 2, 2);
};

/** The box with the charger `open` of the way out of it, its panel tilted `tilt` px. */
export const drawCharger = (
  ctx: CanvasRenderingContext2D,
  open: number,
  tilt: number,
  sunUp: boolean,
  docked: number,
  t: number,
) => {
  drawBox(ctx);
  if (open <= 0) return;
  // The mast comes up out of the back of the box, then the panel unfolds from its top over
  // the box.
  const tall = Math.round(MAST * smooth(Math.min(1, open / 0.6)));
  const wide = Math.round(PANEL * smooth(Math.max(0, (open - 0.55) / 0.45)));
  const mx = BOX.x + BOX.w - 2;
  rect(ctx, C.mast, mx, BOX.y - tall, 1, tall);
  if (wide > 0) {
    const top = BOX.y - tall;
    for (let i = 0; i < wide; i++) {
      // Column i from the mast leftward; the far (left) end down `-tilt` px, or up.
      const x = mx - i;
      const y = top - Math.round((tilt * i) / (PANEL - 1));
      const cell = i % 3 === 2 || i === wide - 1 ? C.grid : C.cell;
      rect(ctx, cell, x, y - 2, 1, 2);
      rect(ctx, C.frame, x, y, 1, 1);
    }
  }
  drawChargerLight(ctx, open, sunUp, docked, t);
};

/** The charger as friday has it `since` seconds in. */
export const drawChargerAt = (ctx: CanvasRenderingContext2D, since: number) =>
  drawCharger(ctx, openAt(since), tiltAt(since), dayAt(since).sun !== null, dockAt(since), since);

/** Only its light, for drawing over the night. */
export const drawChargerLightAt = (ctx: CanvasRenderingContext2D, since: number) =>
  drawChargerLight(ctx, openAt(since), dayAt(since).sun !== null, dockAt(since), since);
