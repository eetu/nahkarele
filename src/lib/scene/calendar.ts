import { drawPixelText } from "./pixelfont";

/** A tear-off wall calendar, 24 × 32 scene px: the day, and the count still to come. */
export const CALENDAR = { w: 24, h: 32 };

const FRAME = "#3a3a3a";
const PAGE = "#f4f0e0";
const BAND = "#c8452f";
const INK = "#3d3d3d";

const rect = (
  ctx: CanvasRenderingContext2D,
  c: string,
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

/**
 * `day` is the weekday name, shown as its first three letters; `left` is the count still to
 * come, or null when there is nothing to count (the line before a shift, friday's loop).
 */
export const drawCalendar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  day: string,
  left: number | null,
) => {
  const { w, h } = CALENDAR;
  rect(ctx, FRAME, x, y, w, h);
  rect(ctx, PAGE, x + 1, y + 1, w - 2, h - 2);
  rect(ctx, BAND, x + 1, y + 1, w - 2, 10);
  // The hanger and the ring holes through the band.
  rect(ctx, FRAME, x + 6, y - 2, 2, 4);
  rect(ctx, FRAME, x + w - 8, y - 2, 2, 4);

  drawPixelText(ctx, day.slice(0, 3), x + w / 2, y + 3, PAGE, { align: "center" });
  // Centred in the page below the band (which ends at y + 11; the page at y + 31).
  const count = left === null ? "-" : String(left);
  drawPixelText(ctx, count, x + w / 2, y + 18, INK, { align: "center" });
};
