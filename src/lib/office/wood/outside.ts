// The world behind the office's back wall, seen through the window and through the gaps where
// the wall has come down: the town the blast flattened, and what grows back over it. Right
// after the blast it is ash and stumps under smoke; year by year the ground greens, the stumps
// crumble and go under, and a forest comes up along the horizon. With the seasons and the time
// of day, like the room. It is drawn once a frame, and every opening shows its part of it.

import { hash, ramp, smooth } from "$lib/scene/pixel";
import { daylight, drawOpenSky, mix, type SkyInput } from "$lib/scene/sky";

import { SCENE_W } from "../engine";
import { dayAt, type Place } from "./daylight";
import { seasonAt } from "./seasons";
import { random } from "./trees";

/** Where the land meets the sky, scene y; the outside is drawn down to `DEPTH`. */
export const HORIZON = 57;
export const DEPTH = 98;

/** How far the world has healed, 0..1: nothing at the blast, a forest after some years. */
export const healAt = (since: number) => smooth((since - 60) / 1700);

const NIGHT = "#141a26";

/** The light the land is lit by under `sky`, 0 to 1, in the steps it is redrawn in. */
const lightOf = (sky: SkyInput) => 0.15 + 0.85 * (Math.round(daylight(sky.progress) * 8) / 8);

/** The night out there, as a shade for whatever else is seen in it: `k` of `colour`. */
export const nightOutside = (sky: SkyInput) => ({ colour: NIGHT, k: 1 - lightOf(sky) });

type Stump = { x: number; w: number; h: number; keep: number };
type Far = { x: number; base: number; h: number; conifer: boolean; from: number; salt: number };
type World = { seed: number; ridge: number[]; stumps: Stump[]; trees: Far[] };

let world: World | null = null;

/** The lie of the land for `seed`: the ridge, what was the town, where the forest will stand. */
const worldOf = (seed: number): World => {
  if (world?.seed === seed) return world;
  const rand = random(seed ^ 0x5eed);
  const phase = [rand(), rand(), rand()].map((v) => v * 6.28);
  const ridge = Array.from({ length: SCENE_W }, (_, x) =>
    Math.round(
      HORIZON -
        5 -
        2.5 * Math.sin(x / 41 + phase[0]) -
        1.5 * Math.sin(x / 17 + phase[1]) -
        0.8 * Math.sin(x / 7 + phase[2]),
    ),
  );
  const stumps: Stump[] = [];
  for (let x = rand() * 10; x < SCENE_W; x += 7 + rand() * 12) {
    const w = 5 + Math.floor(rand() * 10);
    stumps.push({ x: Math.round(x), w, h: 8 + rand() * 20, keep: 0.35 + rand() * 0.3 });
  }
  const trees: Far[] = [];
  for (let x = rand() * 4; x < SCENE_W; x += 2 + rand() * 4) {
    const base = HORIZON + Math.floor(rand() ** 2 * 16);
    const near = (base - HORIZON) / 16;
    trees.push({
      x: Math.round(x),
      base,
      h: (5 + rand() * 9) * (1 + near * 0.8),
      conifer: rand() < 0.6,
      from: rand() * 0.75,
      salt: rand(),
    });
  }
  trees.sort((a, b) => a.base - b.base);
  world = { seed, ridge, stumps, trees };
  return world;
};

/** Ground colour by season, healed; the ash it starts as; and snow, which covers either. */
const GROUND = ["#5a8a3a", "#8a8a4a", "#e4eaee", "#6aa040"];
const ASH = "#4a4440";
const BROADLEAF = [["#4a7a32"], ["#c8a040", "#d86a2a", "#b83a2a"], ["#6a5e52"], ["#7ab84a"]];

const paintLand = (ctx: CanvasRenderingContext2D, w: World, since: number, light: number) => {
  const heal = healAt(since);
  const { k, p } = seasonAt(since);
  const snow = k === 2 ? ramp(p, 0.05, 0.3) : k === 3 ? 1 - ramp(p, 0, 0.3) : 0;
  const lit = (c: string) => mix(NIGHT, c, light);
  const px = (c: string, x: number, y: number, pw = 1, ph = 1) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, pw, ph);
  };
  // The far ridge: bare and grey at first, forest blue once it has grown back.
  const ridge = lit(mix(mix("#5a5a5a", "#46606e", heal), "#b8c4cc", snow));
  for (let x = 0; x < SCENE_W; x++) px(ridge, x, w.ridge[x], 1, HORIZON - w.ridge[x]);
  // The ground, ash going green; darker toward the wall.
  const green = GROUND[k];
  for (let y = HORIZON; y < DEPTH; y++) {
    const near = (y - HORIZON) / (DEPTH - HORIZON);
    const base = mix(mix(ASH, green, heal), "#e4eaee", snow * (k === 2 ? 1 : 0.8));
    const row = lit(mix(base, "#000000", near * 0.25));
    px(row, 0, y, SCENE_W, 1);
    for (let x = 0; x < SCENE_W; x += 1) {
      if (hash(x, y, 7) < 0.12) px(lit(mix(base, "#000000", 0.18 + near * 0.2)), x, y);
    }
  }
  // What the blast left of the town: stumps, crumbling and going green.
  const stone = lit("#3a3e44");
  const moss = lit(mix("#4a6a3a", "#dfe6ea", snow));
  for (const s of w.stumps) {
    const h = s.h * s.keep * (1 - 0.75 * heal);
    for (let c = 0; c < s.w; c++) {
      const top = h * (0.6 + 0.4 * hash(s.x + c, 3, w.seed));
      if (top < 1) continue;
      const y0 = Math.round(HORIZON - top);
      px(stone, s.x + c, y0, 1, Math.ceil(top));
      // Green from the top down as the years go by.
      const grown = Math.ceil(top * heal * 0.9);
      if (grown > 0) px(moss, s.x + c, y0, 1, grown);
    }
  }
  // The forest, tree by tree as the land heals: spruce, and broadleaf with the seasons.
  for (const t of w.trees) {
    const g = Math.min(1, Math.max(0, (heal - t.from) / 0.25));
    if (g <= 0) continue;
    const h = Math.max(2, Math.round(t.h * g));
    const x = t.x;
    if (t.conifer) {
      const dark = lit(mix("#2f4a32", "#e4eaee", snow * 0.5));
      for (let r = 0; r < h; r++) {
        const half = Math.round(((r + 1) / h) * h * 0.22);
        px(dark, x - half, t.base - h + r, half * 2 + 1, 1);
      }
      if (snow > 0.3) px(lit("#f0f4f6"), x, t.base - h, 1, 1);
      continue;
    }
    const leaves = BROADLEAF[k];
    const trunk = lit("#4a4038");
    px(trunk, x, t.base - Math.round(h * 0.45), 1, Math.round(h * 0.45));
    const r = Math.max(1, Math.round(h * 0.33));
    const cy = t.base - Math.round(h * 0.65);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 0.5) continue;
        const v = hash(x + dx, cy + dy, 11);
        // Bare in winter: a few twigs where the crown was.
        if (k === 2 && v > 0.35) continue;
        px(lit(leaves[Math.floor((v + t.salt) * 7) % leaves.length]), x + dx, cy + dy);
      }
    }
  }
};

let land: { key: string; canvas: HTMLCanvasElement } | null = null;

/** How high the sky goes above the horizon for the sun at its highest, scene px. */
const ZENITH = 46;

/** A place in the sky as a scene point over the outside. */
const skyPoint = ({ across, up }: Place) => ({
  x: Math.round(18 + across * (SCENE_W - 36)),
  y: Math.round(HORIZON - 3 - up * ZENITH),
});

const drawSun = (ctx: CanvasRenderingContext2D, { x, y }: { x: number; y: number }) => {
  ctx.fillStyle = "#f6d27a";
  ctx.fillRect(x - 1, y - 3, 3, 7);
  ctx.fillRect(x - 3, y - 1, 7, 3);
  ctx.fillRect(x - 2, y - 2, 5, 5);
  ctx.fillStyle = "#fbe6a8";
  ctx.fillRect(x - 1, y - 1, 2, 2);
};

/** The moon's seas, a little darker on its lit face: offsets from its middle. */
const SEAS = [
  [-1, -1],
  [1, 0],
  [0, 1],
];

/**
 * The moon, `phase` of the way round its month: new at 0, full at 0.5, lit from the right as it
 * waxes and from the left as it wanes. The unlit part shows faintly, as it does.
 */
const drawMoon = (
  ctx: CanvasRenderingContext2D,
  { x, y }: { x: number; y: number },
  phase: number,
) => {
  const r = 3;
  const turn = Math.cos(2 * Math.PI * phase);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 1) continue;
      const u = dx / r;
      const half = Math.sqrt(Math.max(0, 1 - (dy / r) ** 2));
      const lit = phase < 0.5 ? u > turn * half - 0.05 : u < -turn * half + 0.05;
      const sea = SEAS.some(([sx, sy]) => sx === dx && sy === dy);
      ctx.fillStyle = !lit ? "#1c2434" : sea ? "#d8d2c0" : "#f6f2e4";
      ctx.fillRect(x + dx, y + dy, 1, 1);
    }
  }
};
let view: HTMLCanvasElement | null = null;

/** Smoke over the ruins after the blast, thinning away over the first minutes. */
const drawSmoke = (ctx: CanvasRenderingContext2D, w: World, since: number, day: number) => {
  const thick = 1 - smooth((since - 30) / 300);
  if (thick <= 0) return;
  for (const [i, s] of w.stumps.entries()) {
    if (hash(i, 9, w.seed) > 0.35) continue;
    for (let k = 0; k < 10; k++) {
      const age = (since * 0.6 + k * 0.1 + hash(i, k)) % 1;
      const x = s.x + s.w / 2 + Math.sin(since * 0.8 + k) * 2 + age * 10;
      const y = HORIZON - s.h * s.keep - age * 30;
      ctx.globalAlpha = thick * (1 - age) * 0.6;
      ctx.fillStyle = mix("#2a2a2c", "#7a7a7e", day);
      ctx.fillRect(Math.round(x), Math.round(y), 2 + Math.round(age * 3), 2);
    }
  }
  ctx.globalAlpha = 1;
};

/**
 * The outside `since` seconds into friday, under `sky`: a canvas the size of the back wall,
 * sky and land, for the window and the gaps to show their part of.
 */
export const outsideOf = (sky: SkyInput, since: number, seed: number): HTMLCanvasElement | null => {
  const w = worldOf(seed);
  const day = daylight(sky.progress);
  const { k, p } = seasonAt(since);
  const key = `${seed}|${Math.round(healAt(since) * 40)}|${k}|${Math.round(p * 12)}|${Math.round(day * 8)}`;
  if (!land || land.key !== key) {
    const canvas = land?.canvas ?? document.createElement("canvas");
    canvas.width = SCENE_W;
    canvas.height = DEPTH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, SCENE_W, DEPTH);
    paintLand(ctx, w, since, lightOf(sky));
    land = { key, canvas };
  }
  if (!view) {
    view = document.createElement("canvas");
    view.width = SCENE_W;
    view.height = DEPTH;
  }
  const ctx = view.getContext("2d");
  if (!ctx) return null;
  drawOpenSky(ctx, sky, { x: 0, y: 0, w: SCENE_W, h: HORIZON + 8 }, 14);
  // The sun and the moon on their arcs; cloud hides them. The land, drawn after, takes them
  // as they go down behind the ridge.
  if (sky.weather === "clear") {
    const { sun, moon } = dayAt(since);
    if (sun) drawSun(ctx, skyPoint(sun));
    if (moon) drawMoon(ctx, skyPoint(moon), moon.phase);
  }
  drawSmoke(ctx, w, since, day);
  ctx.drawImage(land.canvas, 0, 0);
  return view;
};
