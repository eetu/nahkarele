import { canvasPen, type Pen } from "@anarkisti/korpi/paint";

import { fill } from "./pen";
import { paintText } from "./pixelfont";

/** A tear-off wall calendar, 24 × 32 scene px: the day, and the count still to come. */
export const CALENDAR = { w: 24, h: 32 };

const FRAME = "#3a3a3a";
const PAGE = "#f4f0e0";
const BAND = "#c8452f";
const INK = "#3d3d3d";

/**
 * `day` is the weekday name, shown as its first three letters; `left` is the count still to
 * come, or null when there is nothing to count (the line before a shift, friday's loop).
 */
export const paintCalendar = (pen: Pen, x: number, y: number, day: string, left: number | null) => {
  const { w, h } = CALENDAR;
  fill(pen, FRAME, x, y, w, h);
  fill(pen, PAGE, x + 1, y + 1, w - 2, h - 2);
  fill(pen, BAND, x + 1, y + 1, w - 2, 10);
  // The hanger and the ring holes through the band.
  fill(pen, FRAME, x + 6, y - 2, 2, 4);
  fill(pen, FRAME, x + w - 8, y - 2, 2, 4);

  paintText(pen, day.slice(0, 3), x + w / 2, y + 3, PAGE, { align: "center" });
  // Centred in the page below the band (which ends at y + 11; the page at y + 31).
  const count = left === null ? "-" : String(left);
  paintText(pen, count, x + w / 2, y + 18, INK, { align: "center" });
};

/** The same on a canvas. */
export const drawCalendar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  day: string,
  left: number | null,
) => paintCalendar(canvasPen(ctx), x, y, day, left);
