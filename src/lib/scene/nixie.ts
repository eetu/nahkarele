import { mix, rgb } from "@anarkisti/korpi/core";
import type { Pen } from "@anarkisti/korpi/paint";
import { nixiePixelText } from "@glowbox/nixie";

const LIT = rgb("#ff9a3c");
/** The cathodes stacked behind the lit one, darker the further back. */
const FRONT = rgb("#6a5244");
const BACK = rgb("#2a221e");

/**
 * A nixie clock painted into the scene: in each tube its ten cathodes stacked front to back,
 * the one for the digit glowing orange, the colon its own small tube. `value` is "HH:MM". Its
 * tubes are glowbox's, on whole pixels, `box.h` tall and a pixel apart. The cathodes are metal
 * and take the room's light, so `"metal"` is painted with the room and `"glow"` over its dark.
 */
export const drawNixieClock = (
  pen: Pen,
  box: { x: number; y: number; w: number; h: number },
  value: string,
  layer: "metal" | "glow",
) => {
  const row = nixiePixelText(value, { height: box.h, gap: 1 });
  const x0 = box.x + Math.floor((box.w - row.width) / 2);
  // Back to front, so a nearer cathode covers the ones behind it.
  const parts = row.parts
    .filter((p) => p.on === (layer === "glow"))
    .sort((a, b) => b.depth - a.depth);
  for (const { rects, depth, on } of parts) {
    const c = on ? LIT : mix(FRONT, BACK, depth / 9);
    for (const r of rects) pen.fill(c, x0 + r.x, box.y + r.y, r.w, r.h);
  }
};
