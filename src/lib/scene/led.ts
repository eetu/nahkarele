import {
  litSegments,
  SEGMENT_SLANT,
  SEGMENT_VIEWBOX,
  segmentGeometry,
} from "@glowbox/seven-segment";

const GEOMETRY = segmentGeometry();
const LIT = "#ff3b2a";
const GHOST = "#3a1410";

const hash = (...n: number[]) =>
  (n.reduce((h, v) => Math.imul(h ^ (v + 0x9e3779b9), 2654435761), 17) >>> 0) / 4294967296;

/**
 * A red seven-segment clock drawn into the scene itself, from glowbox's segment
 * geometry, so it sits in the room's draw order like any other object. `value` is
 * "HH:MM", or "" for a dead clock: segment ghosts only. `broken` is a clock nobody
 * has reset since the power went: blinking, a quarter of its segments dead, the rest
 * flickering.
 */
export const drawLedClock = (
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  value: string,
  t: number,
  broken = false,
) => {
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
    const lit = new Set(litSegments(symbol));
    index += 1;
    for (const [n, { name, polygon }] of GEOMETRY.segments.entries()) {
      const on = !dead && lit.has(name) && alive(n);
      ctx.fillStyle = on ? LIT : GHOST;
      ctx.shadowColor = on ? LIT : "transparent";
      ctx.shadowBlur = on ? 3 : 0;
      ctx.beginPath();
      polygon.forEach(([px, py], i) => {
        const shear = (SEGMENT_VIEWBOX.height - py) * SEGMENT_SLANT;
        const X = x + (px + shear) * sx;
        const Y = y + py * sy;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      ctx.closePath();
      ctx.fill();
    }
    x += digitW + gap;
  };

  ctx.save();
  digit(chars[0]);
  digit(chars[1]);
  // The colon blinks once a second, as clocks do.
  const on = !dead && (broken ? blinkOn : Math.floor(t * 2) % 2 === 0);
  ctx.fillStyle = on ? LIT : GHOST;
  ctx.shadowColor = on ? LIT : "transparent";
  ctx.shadowBlur = on ? 3 : 0;
  const r = Math.max(0.7, digitW * 0.08);
  for (const f of [0.32, 0.68]) {
    ctx.beginPath();
    ctx.arc(x + colonW / 2, y + digitH * f, r, 0, Math.PI * 2);
    ctx.fill();
  }
  x += colonW + gap;
  digit(chars[2]);
  digit(chars[3]);
  ctx.restore();
};
