import { rgb } from "@anarkisti/korpi/core";
import { lit, type Pen } from "@anarkisti/korpi/paint";
import { litSegments, type SegmentName } from "@glowbox/seven-segment";

export const LIT = rgb("#ff3b2a");
const GHOST = rgb("#2e110d");

type Cell = { x: number; y: number; w: number; h: number };

/**
 * Segment `name` of a digit `w` × `h` px with strokes `s` px thick, as a rect from the digit's
 * corner. Upright and on whole pixels: sheared at this size, every stroke jogs a pixel halfway
 * down and a 1 reads as a J. The horizontals sit between the verticals, so segments stay apart.
 */
const segmentRect = (name: SegmentName, w: number, h: number, s: number): Cell => {
  const mid = Math.floor((h - s) / 2);
  const across = { x: s, w: w - 2 * s, h: s };
  const upper = { y: s, w: s, h: mid - s };
  const lower = { y: mid + s, w: s, h: h - s - (mid + s) };
  switch (name) {
    case "a":
      return { ...across, y: 0 };
    case "g":
      return { ...across, y: mid };
    case "d":
      return { ...across, y: h - s };
    case "f":
      return { ...upper, x: 0 };
    case "b":
      return { ...upper, x: w - s };
    case "e":
      return { ...lower, x: 0 };
    default:
      return { ...lower, x: w - s };
  }
};
const SEGMENTS: SegmentName[] = ["a", "b", "c", "d", "e", "f", "g"];

const hash = (...n: number[]) =>
  (n.reduce((h, v) => Math.imul(h ^ (v + 0x9e3779b9), 2654435761), 17) >>> 0) / 4294967296;

/**
 * A red seven-segment clock painted into the scene, the lit segments giving their own light
 * (what reaches the wall round it is the room's light to work out). `value` is "HH:MM", or ""
 * for a dead clock: segment ghosts only. `broken` is a clock nobody has reset since the power
 * went: blinking, a quarter of its segments dead, the rest flickering.
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
  const h = box.h - 2;
  const s = h >= 14 ? 2 : 1;
  const w = Math.round(h / 2);
  const gap = s;
  const colon = s;
  let x = box.x + Math.floor((box.w - (4 * w + colon + 4 * gap)) / 2);
  const y = box.y + 1;
  const dead = value === "";
  const chars = dead ? "    " : value.replace(":", "");

  const blinkOn = !broken || Math.floor(t * 1.5) % 2 === 0;
  const tick = Math.floor(t * 12);
  let index = 0;
  const alive = (segment: number) => {
    if (!broken) return true;
    if (hash(index, segment) < 0.25) return false;
    return blinkOn && hash(tick, index, segment) > 0.12;
  };

  const digit = (symbol: string) => {
    const on = new Set(litSegments(symbol));
    index += 1;
    for (const [n, name] of SEGMENTS.entries()) {
      const shown = !dead && on.has(name) && alive(n);
      const r = segmentRect(name, w, h, s);
      (shown ? glowing : ghost).fill(shown ? LIT : GHOST, x + r.x, y + r.y, r.w, r.h);
    }
    x += w + gap;
  };

  digit(chars[0]);
  digit(chars[1]);
  // The colon blinks once a second, as clocks do.
  const on = !dead && (broken ? blinkOn : Math.floor(t * 2) % 2 === 0);
  const mid = Math.floor((h - s) / 2);
  for (const dy of [mid - 2 * s, mid + 2 * s])
    (on ? glowing : ghost).fill(on ? LIT : GHOST, x, y + dy, colon, s);
  x += colon + gap;
  digit(chars[2]);
  digit(chars[3]);
};
