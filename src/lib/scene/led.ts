import { rgb } from "@anarkisti/korpi/core";
import { line, lit, type Pen } from "@anarkisti/korpi/paint";
import {
  litSegments,
  SEGMENT_SLANT,
  SEGMENT_VIEWBOX,
  segmentGeometry,
} from "@glowbox/seven-segment";

const GEOMETRY = segmentGeometry();
export const LIT = rgb("#ff3b2a");
const GHOST = rgb("#3a1410");

/** A segment's outline as the line along its length: end to end across a wide one, tip to tip
 *  down a tall one, half a pixel short at each end. */
const strokeOf = (pts: [number, number][]): [[number, number], [number, number]] => {
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (x1 - x0 >= y1 - y0) {
    const y = (y0 + y1) / 2;
    return [
      [x0 + 0.5, y],
      [x1 - 0.5, y],
    ];
  }
  const at = (v: number) => {
    const ends = pts.filter(([, py]) => Math.abs(py - v) < 0.01);
    return ends.reduce((n, [px]) => n + px, 0) / ends.length;
  };
  return [
    [at(y0), y0 + 0.5],
    [at(y1), y1 - 0.5],
  ];
};

const hash = (...n: number[]) =>
  (n.reduce((h, v) => Math.imul(h ^ (v + 0x9e3779b9), 2654435761), 17) >>> 0) / 4294967296;

/**
 * A red seven-segment clock painted into the scene, from glowbox's segment geometry: each
 * segment a one-pixel line along its length, a little short of its ends so the segments stay
 * apart, the lit ones giving their own light (what reaches the
 * wall round it is the room's light to work out). `value` is "HH:MM", or "" for a dead clock:
 * segment ghosts only. `broken` is a clock nobody has reset since the power went: blinking, a
 * quarter of its segments dead, the rest flickering.
 */
export const drawLedClock = (
  pen: Pen,
  box: { x: number; y: number; w: number; h: number },
  value: string,
  t: number,
  broken = false,
) => {
  const glowing = lit(pen);
  // A dead segment still shows faintly in the dark: the face's own red, half lit.
  const ghost = lit(pen, 128);
  const digitH = box.h - 4;
  const digitW = digitH * (SEGMENT_VIEWBOX.width / SEGMENT_VIEWBOX.height);
  const colonW = digitW * 0.45;
  const gap = digitW * 0.18;
  const width = digitW * 4 + colonW + gap * 4;
  let x = box.x + (box.w - width) / 2;
  const y = box.y + 2;
  const sx = digitW / SEGMENT_VIEWBOX.width;
  const sy = digitH / SEGMENT_VIEWBOX.height;
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
    for (const [n, { name, polygon: shape }] of GEOMETRY.segments.entries()) {
      const lit = !dead && on.has(name) && alive(n);
      const pts = shape.map(([px, py]): [number, number] => {
        const shear = (SEGMENT_VIEWBOX.height - py) * SEGMENT_SLANT;
        return [x + (px + shear) * sx, y + py * sy];
      });
      const [[ax, ay], [bx, by]] = strokeOf(pts);
      line(
        lit ? glowing : ghost,
        lit ? LIT : GHOST,
        Math.round(ax),
        Math.round(ay),
        Math.round(bx),
        Math.round(by),
      );
    }
    x += digitW + gap;
  };

  digit(chars[0]);
  digit(chars[1]);
  // The colon blinks once a second, as clocks do.
  const on = !dead && (broken ? blinkOn : Math.floor(t * 2) % 2 === 0);
  for (const f of [0.32, 0.68])
    (on ? glowing : ghost).fill(
      on ? LIT : GHOST,
      Math.round(x + colonW / 2 - 0.5),
      Math.round(y + digitH * f - 0.5),
    );
  x += colonW + gap;
  digit(chars[2]);
  digit(chars[3]);
};
