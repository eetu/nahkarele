import { rgb } from "@anarkisti/korpi/core";
import { lit, type Pen } from "@anarkisti/korpi/paint";
import { pixelText } from "@glowbox/seven-segment";

export const LIT = rgb("#ff3b2a");
const GHOST = rgb("#2e110d");

const SEGMENTS = "abcdefg";

const hash = (...n: number[]) =>
  (n.reduce((h, v) => Math.imul(h ^ (v + 0x9e3779b9), 2654435761), 17) >>> 0) / 4294967296;

/**
 * A red seven-segment clock painted into the scene, the lit segments giving their own light
 * (what reaches the wall round it is the room's light to work out). `value` is "HH:MM", or ""
 * for a dead clock: segment ghosts only. `broken` is a clock nobody has reset since the power
 * went: blinking, a quarter of its segments dead, the rest flickering. Its digits are glowbox's,
 * upright on whole pixels, two pixels apart.
 */
export const drawLedClock = (
  pen: Pen,
  box: { x: number; y: number; w: number; h: number },
  value: string,
  t: number,
  broken = false,
) => {
  const glowing = lit(pen);
  // A dead segment still shows faintly in the dark: the face's own red, barely lit.
  const ghost = lit(pen, 48);
  const dead = value === "";
  const blinkOn = !broken || Math.floor(t * 1.5) % 2 === 0;
  // The colon blinks once a second, as clocks do.
  const colon = !dead && (broken ? blinkOn : Math.floor(t * 2) % 2 === 0);
  const row = pixelText(dead ? "  :  " : value, { height: box.h - 2, colon });
  const x0 = box.x + Math.floor((box.w - row.width) / 2);
  const y0 = box.y + 1;
  const tick = Math.floor(t * 12);
  /** Whether segment `n` of the `digit`th digit (1 to 4) shows when lit. */
  const alive = (digit: number, n: number) =>
    !broken || (hash(digit, n) >= 0.25 && blinkOn && hash(tick, digit, n) > 0.12);
  for (const { index, name, rects, on } of row.parts) {
    const digit = index < 2 ? index + 1 : index;
    const shown = on && (name === "colon" || alive(digit, SEGMENTS.indexOf(name)));
    const [into, c] = shown ? [glowing, LIT] : [ghost, GHOST];
    for (const r of rects) into.fill(c, x0 + r.x, y0 + r.y, r.w, r.h);
  }
};
