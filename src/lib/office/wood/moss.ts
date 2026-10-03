// Moss: first over friday's floor, out from the cracks and the climbers' roots, and later over
// whatever comes to lie on it. Cushions of it, lit on top and dark in the hollows between;
// fresh in spring (with spore stalks standing up out of it), deep green in summer, gold-tinged
// through autumn and winter, when the snow has it anyway.

import { hash, smooth } from "$lib/scene/pixel";

import { FLOOR_Y, SCENE_H, SCENE_W } from "../engine";
import { seasonAt } from "./seasons";

/** Moss by season (summer, autumn, winter, spring): its body, its lit tops, its hollows. */
const MOSS = [
  { body: ["#4f7f33", "#5f9a3a", "#46732e"], lit: "#7ab84a", dark: "#36582a" },
  { body: ["#5f7f33", "#6f8a3a", "#56732e"], lit: "#9aa84a", dark: "#3e5a2a" },
  { body: ["#56743a", "#5f7f3a", "#4e6a34"], lit: "#8a9a52", dark: "#3a5230" },
  { body: ["#5a9a3a", "#6aaa42", "#4f8a32"], lit: "#8ac85a", dark: "#3a6a2a" },
];

/** A moss pixel at `x`, `y`: lit where it is `top`, in `since`'s season. */
export const mossColour = (x: number, y: number, top: boolean, since: number) => {
  const m = MOSS[seasonAt(since).k];
  return top || hash(x, y, 71) > 0.85 ? m.lit : m.body[Math.floor(hash(x, y, 72) * 3)];
};

/** The season's moss, for what it grows over: its body, its lit tops more rarely. */
export const mossesAt = (since: number) => {
  const m = MOSS[seasonAt(since).k];
  return [...m.body, ...m.body, m.lit];
};

/** Seconds a cushion takes to swell to full size once the moss reaches it. */
const SWELL_S = 5;

type Cushion = { x: number; y: number; r: number; at: number; spore: boolean };

let floor: { cushions: Cushion[]; cells: Float32Array; grown: number } | null = null;

/** When the moss reaches each 2 × 2 cell of floor, and its cushions: worked out once. */
const floorOf = (sources: [number, number][]) => {
  if (floor) return floor;
  const reach = (x: number, y: number) =>
    6 +
    Math.min(...sources.map(([sx, sy]) => Math.hypot(x - sx, (y - sy) * 1.6))) / 0.9 +
    hash(x, y, 73) * 8;
  const w = SCENE_W / 2;
  const h = (SCENE_H - FLOOR_Y) / 2;
  const cells = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) cells[j * w + i] = reach(i * 2, FLOOR_Y + j * 2);
  }
  const cushions: Cushion[] = [];
  for (let y = FLOOR_Y + 1; y < SCENE_H; y += 3) {
    for (let x = 0; x < SCENE_W; x += 4) {
      const cx = x + hash(x, y, 74) * 4;
      const cy = y + hash(x, y, 75) * 3;
      cushions.push({
        x: cx,
        y: cy,
        // Nearer the viewer, a little bigger.
        r: (1.6 + hash(x, y, 76) * 1.6) * (1 + (cy - FLOOR_Y) / 60),
        at: reach(cx, cy) + 2,
        spore: hash(x, y, 77) < 0.12,
      });
    }
  }
  const grown = Math.max(...cells, ...cushions.map((c) => c.at)) + SWELL_S;
  floor = { cushions, cells, grown };
  return floor;
};

let layer: { key: string; canvas: HTMLCanvasElement } | null = null;

const paint = (canvas: HTMLCanvasElement, f: NonNullable<typeof floor>, since: number) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { k, p } = seasonAt(since);
  const m = MOSS[k];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const px = (c: string, x: number, y: number) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y - FLOOR_Y, 1, 1);
  };
  // The hollows: moss low on the floor, reached cell by cell.
  const w = SCENE_W / 2;
  f.cells.forEach((at, n) => {
    if (at > since) return;
    ctx.globalAlpha = Math.min(1, (since - at) / 3);
    ctx.fillStyle = m.dark;
    ctx.fillRect((n % w) * 2, Math.floor(n / w) * 2, 2, 2);
  });
  ctx.globalAlpha = 1;
  // The cushions, swelling as the moss reaches them, back to front.
  for (const c of f.cushions) {
    const g = smooth((since - c.at) / SWELL_S);
    if (g <= 0) continue;
    const rx = c.r * g;
    const ry = rx * 0.6;
    for (let y = Math.floor(c.y - ry); y <= Math.ceil(c.y + ry); y++) {
      for (let x = Math.floor(c.x - rx); x <= Math.ceil(c.x + rx); x++) {
        const dx = (x - c.x) / Math.max(0.5, rx);
        const dy = (y - c.y) / Math.max(0.5, ry);
        if (dx * dx + dy * dy > 1 || y < FLOOR_Y || y >= SCENE_H) continue;
        const top = dy < -0.35 && dx < 0.3;
        px(top || hash(x, y, 71) > 0.85 ? m.lit : m.body[Math.floor(hash(x, y, 72) * 3)], x, y);
      }
    }
    // In spring the moss sends up its spore stalks, a capsule on each.
    if (c.spore && g >= 1 && k === 3 && p > 0.2 && p < 0.8) {
      const x = Math.round(c.x);
      const y = Math.round(c.y - ry);
      px("#9a6a3a", x, y - 1);
      px("#9a6a3a", x, y - 2);
      px("#c87a3a", x, y - 3);
    }
  }
};

/**
 * The floor's moss `since` seconds into friday, spreading out from `sources` (where it starts:
 * the cracks, the climbers' roots). Repainted while it grows and when the season turns.
 */
export const drawMoss = (
  ctx: CanvasRenderingContext2D,
  since: number,
  sources: [number, number][],
) => {
  const f = floorOf(sources);
  const { k, p } = seasonAt(since);
  const growing = since < f.grown ? Math.round(since * 2) : -1;
  const spores = k === 3 && p > 0.2 && p < 0.8;
  const key = `${growing}|${k}|${spores}`;
  if (!layer || layer.key !== key) {
    const canvas = layer?.canvas ?? document.createElement("canvas");
    canvas.width = SCENE_W;
    canvas.height = SCENE_H - FLOOR_Y;
    paint(canvas, f, growing < 0 ? Math.max(since, f.grown) : growing / 2);
    layer = { key, canvas };
  }
  ctx.drawImage(layer.canvas, 0, FLOOR_Y);
};
