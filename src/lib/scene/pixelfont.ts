// Text drawn into the scenes in glowbox's 5×7 dot-matrix face, one scene pixel per dot, so
// the readouts, counters and calendars are as crisp as the sprites around them. Printable
// ASCII plus the euro sign: no "×", "·" or "—" on these walls.

import { compile5x7, FONT_5X7, glyph5x7 } from "@glowbox/lcd";

/** Glyphs the face does not carry, in its own authoring format. */
const EXTRA: Record<string, readonly number[]> = {
  "€": compile5x7(`
..###
.#...
####.
.#...
####.
.#...
..###`),
};

/** A character cell: the ink plus one column and one row of gap. */
const ADVANCE = FONT_5X7.width + 1;
export const PIXEL_LINE = FONT_5X7.height + 1;

type Options = {
  /** Scene pixels per dot. */
  scale?: number;
  align?: "left" | "center" | "right";
};

export const pixelTextWidth = (text: string, scale = 1): number =>
  Math.max(0, text.length * ADVANCE - 1) * scale;

/** Draw `text` with its top-left at (x, y), or anchored by `align` at x. */
export const drawPixelText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  colour: string,
  { scale = 1, align = "left" }: Options = {},
) => {
  const width = pixelTextWidth(text, scale);
  let cx = Math.round(align === "left" ? x : align === "center" ? x - width / 2 : x - width);
  const cy = Math.round(y);
  ctx.fillStyle = colour;
  for (const ch of text) {
    const rows = EXTRA[ch] ?? glyph5x7(ch);
    rows.forEach((bits, row) => {
      for (let col = 0; col < FONT_5X7.width; col++) {
        if (bits & (1 << (FONT_5X7.width - 1 - col))) {
          ctx.fillRect(cx + col * scale, cy + row * scale, scale, scale);
        }
      }
    });
    cx += ADVANCE * scale;
  }
};
