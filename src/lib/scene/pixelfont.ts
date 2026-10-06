// Text drawn into the scenes in glowbox's 5×7 dot-matrix face, one scene pixel per dot, so
// the readouts, counters and calendars are as crisp as the sprites around them: korpi's `text`,
// the same face. Printable ASCII plus the euro sign: no "×", "·" or "—" on these walls.

import { canvasPen, type Pen, text, TEXT_LINE, textWidth } from "@anarkisti/korpi/paint";

import { colourOf } from "./pen";

export const PIXEL_LINE = TEXT_LINE;

type Options = {
  /** Scene pixels per dot. */
  scale?: number;
  align?: "left" | "center" | "right";
};

export const pixelTextWidth = (s: string, scale = 1): number => textWidth(s, scale);

/** Paint `s` with its top-left at (x, y), or anchored by `align` at x. */
export const paintText = (
  pen: Pen,
  s: string,
  x: number,
  y: number,
  colour: string,
  options: Options = {},
) => text(pen, colourOf(colour), s, x, y, options);

/** The same on a canvas. */
export const drawPixelText = (
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  colour: string,
  options: Options = {},
) => paintText(canvasPen(ctx), s, x, y, colour, options);
