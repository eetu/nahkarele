/**
 * A window onto a Finnish winter day, run once per shift: dark when the shift
 * starts, a short grey day, and night long before it ends. Shared by every room.
 */

import { canvasPen, disc, ellipse, line, lit, masked, type Pen } from "@anarkisti/korpi/paint";
import { bandsFor, paintBands } from "@anarkisti/korpi/sky/paint";

import { prefersReducedMotion } from "$lib/keys";

import { colourOf, fill, fillFaded } from "./pen";

export type Weather = "clear" | "snow" | "rain" | "storm";

export type SkyInput = {
  t: number;
  /** How far through the shift, 0..1. */
  progress: number;
  weather: Weather;
  /** Wind across the window, + to the right (friday's, `office/wind.ts`); else the weather's own. */
  wind?: number;
};

export type Glass = { x: number; y: number; w: number; h: number };

export type WindowExtras = {
  /** The glass is broken. */
  cracked?: boolean;
  /** Seconds since a blast on the horizon, or null. */
  blast?: number | null;
  /** The glass shows the world around it: what is painted behind it, not its own sky, sun
   *  and town, and the weather falling in front of it, not its own; it keeps its cracks. */
  open?: boolean;
};

type Key = { at: number; top: string; low: string };

/** The shift runs 07:00 to 17:00; keyframes are fractions of it. */
export const SHIFT_START_H = 7;
export const SHIFT_HOURS = 10;

const SKY: Key[] = [
  { at: 0, top: "#0b1426", low: "#1a2640" },
  { at: 0.14, top: "#141d38", low: "#2a3050" },
  { at: 0.2, top: "#2a3358", low: "#c77a6a" },
  { at: 0.28, top: "#8fb3cc", low: "#c8d8e0" },
  { at: 0.58, top: "#8fa8bd", low: "#d9b08c" },
  { at: 0.7, top: "#3a3560", low: "#b0685a" },
  { at: 0.8, top: "#0d1630", low: "#1c2848" },
  { at: 1, top: "#0b1426", low: "#1a2640" },
];

const OVERCAST = "#7d848c";

const hex = (c: string): number[] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

const toHex = (v: number[]) => "#" + v.map((n) => n.toString(16).padStart(2, "0")).join("");

export const mix = (a: string, b: string, t: number): string => {
  const [x, y] = [hex(a), hex(b)];
  return toHex(x.map((v, i) => Math.round(v + (y[i] - v) * t)));
};

/** 0 at night, 1 at midday. */
export const daylight = (p: number): number => {
  if (p < 0.15 || p > 0.78) return 0;
  if (p < 0.28) return (p - 0.15) / 0.13;
  if (p < 0.6) return 1;
  return 1 - (p - 0.6) / 0.18;
};

const skyAt = (progress: number, grey: number): { top: string; low: string } => {
  const p = Math.min(1, Math.max(0, progress));
  const next = SKY.findIndex((k) => k.at > p);
  const i = next === -1 ? SKY.length - 2 : Math.max(0, next - 1);
  const [a, b] = [SKY[i], SKY[i + 1]];
  const t = Math.min(1, Math.max(0, (p - a.at) / (b.at - a.at)));
  const top = mix(a.top, b.top, t);
  const low = mix(a.low, b.low, t);
  if (!grey) return { top, low };
  // Overcast drains the colour out, more so in daylight.
  const day = daylight(p);
  return { top: mix(top, OVERCAST, grey * day * 0.7), low: mix(low, OVERCAST, grey * day * 0.8) };
};

/** The wall clock, "HH:MM". */
export const clockAt = (progress: number): string => {
  const p = Math.min(1, Math.max(0, progress));
  const minutes = Math.round((SHIFT_START_H + p * SHIFT_HOURS) * 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
};

/** Lightning strikes on a fixed rhythm, a double flicker each. */
export const flash = (sky: SkyInput): number => {
  if (sky.weather !== "storm" || prefersReducedMotion()) return 0;
  const c = sky.t % 6.3;
  return c < 0.08 ? 1 : c > 0.16 && c < 0.22 ? 0.6 : 0;
};

/** How dark the room is: lamps and machines hold their own. */
export const roomDarkness = (sky: SkyInput): number => {
  const day = daylight(sky.progress);
  const grey = sky.weather === "clear" ? 0 : 0.35;
  return Math.max(0, (1 - day) * 0.28 + grey * day * 0.12 - flash(sky) * 0.25);
};

// Skyline, lit windows and stars as fractions of the glass, so any window size works.
const TOWN = [
  [0.1, 0.59, 0.14, 0.41],
  [0.32, 0.73, 0.25, 0.27],
  [0.64, 0.41, 0.07, 0.59],
  [0.75, 0.68, 0.18, 0.32],
];
const LIT = [
  [0.14, 0.66],
  [0.2, 0.77],
  [0.36, 0.8],
  [0.5, 0.86],
  [0.66, 0.5],
  [0.79, 0.75],
  [0.86, 0.84],
];
const STARS = [
  [0.07, 0.07],
  [0.27, 0.14],
  [0.39, 0.05],
  [0.59, 0.2],
  [0.73, 0.09],
  [0.91, 0.16],
  [0.82, 0.3],
];

/** A mushroom cloud rising off the horizon over `age` seconds. */
const paintBlast = (pen: Pen, g: Glass, age: number) => {
  const cx = g.x + g.w * 0.55;
  const ground = g.y + g.h;
  const rise = Math.min(1, age / 2.6);
  const top = ground - rise * g.h * 0.8;
  const glow = Math.max(0, 1 - age / 4);
  // Stem.
  const stem = 2 + rise * 3;
  fill(
    pen,
    mix("#f4c25a", "#9a8c84", Math.min(1, Math.max(0, (age - 1) / 4))),
    Math.round(cx - stem / 2),
    Math.round(top + 4),
    Math.round(stem),
    ground - top,
  );
  // Cap, rolling outward as it climbs.
  const r = 3 + rise * g.w * 0.26;
  const cap = (dx: number, dy: number, rr: number, colour: string) =>
    ellipse(pen, colourOf(colour), cx + dx, top + dy, rr, rr * 0.6);
  const cool = (s: number) => Math.min(1, Math.max(0, (age - 1) / s));
  cap(0, 0, r, mix("#ffd27a", "#a8988c", cool(4)));
  cap(-r * 0.4, -r * 0.2, r * 0.6, mix("#fff0c0", "#c0b2a6", cool(3.5)));
  cap(r * 0.45, -r * 0.1, r * 0.55, mix("#f79a3a", "#9a8a80", cool(4.5)));
  // Ground ring.
  fill(
    pen,
    mix("#f78f08", "#6a605c", Math.min(1, age / 2)),
    Math.round(cx - r),
    ground - 2,
    Math.round(r * 2),
    2,
  );
  fillFaded(pen, "#ffd98a", glow * 0.35, g.x, g.y, g.w, g.h);
};

const CRACK = "rgba(230, 236, 244, 0.75)";

const paintCracks = (pen: Pen, g: Glass) => {
  const at = (fx: number, fy: number): [number, number] => [g.x + g.w * fx, g.y + g.h * fy];
  const lines: [number, number][][] = [
    [at(0.62, 0.35), at(0.78, 0.1), at(0.84, 0)],
    [at(0.62, 0.35), at(0.95, 0.42), at(1, 0.5)],
    [at(0.62, 0.35), at(0.7, 0.72), at(0.64, 1)],
    [at(0.62, 0.35), at(0.4, 0.55), at(0.2, 0.62)],
    [at(0.62, 0.35), at(0.48, 0.12), at(0.42, 0)],
    [at(0.7, 0.2), at(0.6, 0.18), at(0.52, 0.3), at(0.56, 0.48), at(0.72, 0.5), at(0.78, 0.34)],
  ];
  // A crack is one line: where two of its strokes meet, the corner is drawn once.
  const seen = new Set<number>();
  const once: Pen = {
    fill: (c, x, y, w, h, d) => {
      const k = Math.round(y) * 4096 + Math.round(x);
      if (seen.has(k)) return;
      seen.add(k);
      pen.fill(c, x, y, w, h, d);
    },
    span: pen.span,
  };
  for (const l of lines) {
    for (let i = 1; i < l.length; i++) {
      const [ax, ay] = l[i - 1].map(Math.round);
      const [bx, by] = l[i].map(Math.round);
      line(once, colourOf(CRACK), ax, ay, bx, by);
    }
  }
};

/**
 * The sky itself over `g`: its colours for the time of day and the weather, top to bottom in
 * steps that blend (korpi's `paintBands`, a step every 6 px unless `bands` is given), a
 * lightning flash, stars on a clear night. What a window shows before the town and the weather;
 * what a hole in a wall shows, too.
 */
export const paintOpenSky = (pen: Pen, sky: SkyInput, g: Glass, bands = bandsFor(g.h)) => {
  const p = sky.progress;
  const grey = sky.weather === "clear" ? 0 : sky.weather === "storm" ? 1 : 0.8;
  const lit = flash(sky);
  const { x, y, w, h } = g;
  const colours = skyAt(p, grey);
  paintBands(pen, g, colourOf(colours.top), colourOf(colours.low), bands, true, 0);
  if (lit) fillFaded(pen, "#e8ecf4", 0.7 * lit, x, y, w, h);
  if (!grey && daylight(p) === 0) {
    for (const [fx, fy] of STARS) {
      if (Math.floor(sky.t * 2 + fx * 50) % 7 !== 0) fill(pen, "#cfd8e8", x + fx * w, y + fy * h);
    }
  }
};

/**
 * A window onto `sky` through glass `g` in a frame: its own sky, sun, town and weather, or with
 * `open` the world's (friday's, beyond the wall and falling through the room), and any cracks.
 */
export const paintWindow = (
  pen: Pen,
  sky: SkyInput,
  g: Glass,
  frame: string,
  extras: WindowExtras = {},
) => {
  const p = sky.progress;
  const { weather } = sky;
  const grey = weather === "clear" ? 0 : weather === "storm" ? 1 : 0.8;
  const day = daylight(p);
  const { x, y, w, h } = g;
  const open = extras.open === true;

  // The frame round the glass; the glass itself left for what is seen through it.
  fill(pen, frame, x - 2, y - 2, w + 4, 2);
  fill(pen, frame, x - 2, y + h, w + 4, 2);
  fill(pen, frame, x - 2, y, 2, h);
  fill(pen, frame, x + w, y, 2, h);
  const glass = masked(pen, (px, py) => px >= x && px < x + w && py >= y && py < y + h);

  if (!open) {
    paintOpenSky(glass, sky, g);
    // A low winter sun that barely clears the rooftops.
    if (!grey && p > 0.18 && p < 0.7) {
      const q = (p - 0.18) / 0.52;
      disc(
        glass,
        colourOf("#f6d27a"),
        x + 4 + q * (w - 8),
        y + h - 14 - Math.sin(q * Math.PI) * 14,
        3,
      );
    }
  }

  if (extras.blast != null && extras.blast >= 0) paintBlast(glass, g, extras.blast);

  const ruined = extras.cracked === true;
  const town = ruined ? mix("#1c1f24", "#4e565e", day) : mix("#262e3a", "#7a8a95", day);
  TOWN.forEach(([fx, fy, fw, fh], i) => {
    if (open) return;
    if (!ruined) {
      fill(glass, town, x + fx * w, y + fy * h, fw * w, fh * h + 1);
      return;
    }
    // What the blast left: stumps at a third to two thirds of their height, tops bitten off.
    const keep = 0.35 + ((i * 7) % 5) * 0.08;
    const base = y + (fy + fh) * h + 1;
    for (let px = 0; px < fw * w; px++) {
      const hash = ((Math.imul(i * 131 + px * 17, 2654435761) >>> 0) % 100) / 100;
      const stump = fh * h * keep * (0.6 + 0.4 * hash);
      fill(glass, town, x + fx * w + px, base - stump, 1, stump);
    }
  });
  // No lights in a town that is no longer there.
  if (day < 0.5 && extras.blast == null && !ruined && !open) {
    const lights = lit(glass);
    for (const [fx, fy] of LIT) fillFaded(lights, "#f2c230", 1 - day * 2, x + fx * w, y + fy * h);
  }

  if (weather === "snow" && !open) {
    const wind = sky.wind ?? 0;
    for (let i = 0; i < 24; i++) {
      const fall = (i * 13 + sky.t * (10 + (i % 4) * 3)) % h;
      const along = i * 37 + Math.sin(sky.t * 1.3 + i) * 3 + fall * wind * 0.8;
      fill(glass, "#eef2f6", x + (((along % w) + w) % w), y + fall);
    }
  }
  if ((weather === "rain" || weather === "storm") && !open) {
    // Each drop has its own column, speed and length; the wind leans them all.
    const storm = weather === "storm";
    const n = Math.round((storm ? 34 : 20) * (w / 56));
    const lean = sky.wind === undefined ? (storm ? 0.45 : 0.2) : -sky.wind * 0.45;
    const drop = storm ? "#c4cfdc" : "#a9b8c8";
    for (let i = 0; i < n; i++) {
      const hash = Math.imul(i + 1, 2654435761) >>> 0;
      const speed = 70 + (hash % 50);
      const len = 3 + ((hash >>> 7) % 3);
      const fall = (sky.t * speed + (hash >>> 11)) % (h + len * 2);
      const col = (hash >>> 3) % (w + 12);
      for (let k = 0; k < len; k++) {
        const py = y + fall - len + k;
        const px = x + ((col - (fall + k) * lean + w * 4) % (w + 12)) - 6;
        fillFaded(glass, drop, 0.7, px, py);
      }
    }
  }
  if (extras.cracked) paintCracks(glass, g);

  fill(pen, frame, x + Math.floor(w / 2) - 1, y, 2, h);
  fill(pen, frame, x, y + Math.floor(h / 2) - 1, w, 2);
};

/** A window on a canvas, as the factory hangs one. */
export const drawWindow = (
  ctx: CanvasRenderingContext2D,
  sky: SkyInput,
  g: Glass,
  frame: string,
  extras: WindowExtras = {},
) => paintWindow(canvasPen(ctx), sky, g, frame, extras);
