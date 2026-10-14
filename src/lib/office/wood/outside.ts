// The world behind the office's back wall, seen through the window and through the gaps where
// the wall has come down: the town the blast flattened, and what grows back over it. Right
// after the blast it is ash and stumps under smoke; year by year the ground greens, the stumps
// crumble and go under, and a forest comes up along the horizon. With the seasons and the time
// of day, like the room. It is painted once a frame far behind the wall, and every opening shows
// its part of it; the sky (korpi's, its clouds and storms with it) gives its own light, the land
// is lit by the open sky's.

import { stream } from "@anarkisti/korpi/core";
import {
  lit,
  type Pen,
  type Raster,
  raster,
  rasterPen,
  shifted,
  stamp,
} from "@anarkisti/korpi/paint";
import {
  cloudCover,
  cloudsAt,
  type Day,
  deckAt,
  type DeckPass,
  flashAt,
  greyOf,
  type Storm,
  stormsOf,
  type StormSpec,
  strikesAt,
} from "@anarkisti/korpi/sky";
import { paintSky } from "@anarkisti/korpi/sky/paint";

import { prefersReducedMotion } from "$lib/keys";
import { fill, fillFaded } from "$lib/scene/pen";
import { hash, ramp, smooth } from "$lib/scene/pixel";
import { daylight, mix, type SkyInput } from "$lib/scene/sky";

import { OUTSIDE_Z, SKY_Z } from "../depth";
import { SCENE_W } from "../engine";
import { dayAt } from "./daylight";
import { FRIDAY, seasonAt, SEASONS_FROM, snowCover, STORM_S } from "./seasons";
import { fridayAir } from "./wind";

/** Where the land meets the sky, scene y; the outside is painted down to `DEPTH`. */
export const HORIZON = 57;
export const DEPTH = 98;

/** How far the world has healed, 0..1: nothing at the blast, a forest after some years. */
export const healAt = (since: number) => smooth((since - 60) / 1700);

/** What the land goes toward at night. */
export const OUTSIDE_NIGHT = "#141a26";

/** How far toward `OUTSIDE_NIGHT` the land is under `sky`, in the steps it always went in. */
export const outsideNight = (sky: SkyInput) =>
  1 - (0.15 + 0.85 * (Math.round(daylight(sky.progress) * 8) / 8));

type Stump = { x: number; w: number; h: number; keep: number };
type Far = { x: number; base: number; h: number; conifer: boolean; from: number; salt: number };
type World = { seed: number; ridge: number[]; stumps: Stump[]; trees: Far[] };

let world: World | null = null;

/** The lie of the land for `seed`: the ridge, what was the town, where the forest will stand. */
const worldOf = (seed: number): World => {
  if (world?.seed === seed) return world;
  const rand = stream(seed ^ 0x5eed);
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

/** The snow lying out there as it lies in the room, in the twelfths the land is painted again
 *  at. */
const snowStep = (since: number) => Math.round(snowCover(since) * 12) / 12;

const paintLand = (pen: Pen, w: World, since: number) => {
  const heal = healAt(since);
  const { k } = seasonAt(since);
  const snow = snowStep(since);
  const px = (c: string, x: number, y: number, pw = 1, ph = 1) => fill(pen, c, x, y, pw, ph);
  // The far ridge: bare and grey at first, forest blue once it has grown back.
  const ridge = mix(mix("#5a5a5a", "#46606e", heal), "#b8c4cc", snow);
  for (let x = 0; x < SCENE_W; x++) px(ridge, x, w.ridge[x], 1, HORIZON - w.ridge[x]);
  // The ground, ash going green; darker toward the wall.
  const green = GROUND[k];
  for (let y = HORIZON; y < DEPTH; y++) {
    const near = (y - HORIZON) / (DEPTH - HORIZON);
    const base = mix(mix(ASH, green, heal), "#e4eaee", snow * (k === 2 ? 1 : 0.8));
    px(mix(base, "#000000", near * 0.25), 0, y, SCENE_W, 1);
    for (let x = 0; x < SCENE_W; x += 1) {
      if (hash(x, y, 7) < 0.12) px(mix(base, "#000000", 0.18 + near * 0.2), x, y);
    }
  }
  // What the blast left of the town: stumps, crumbling and going green.
  const stone = "#3a3e44";
  const moss = mix("#4a6a3a", "#dfe6ea", snow);
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
      const dark = mix("#2f4a32", "#e4eaee", snow * 0.5);
      for (let r = 0; r < h; r++) {
        const half = Math.round(((r + 1) / h) * h * 0.22);
        px(dark, x - half, t.base - h + r, half * 2 + 1, 1);
      }
      if (snow > 0.3) px("#f0f4f6", x, t.base - h, 1, 1);
      continue;
    }
    const leaves = BROADLEAF[k];
    px("#4a4038", x, t.base - Math.round(h * 0.45), 1, Math.round(h * 0.45));
    const r = Math.max(1, Math.round(h * 0.33));
    const cy = t.base - Math.round(h * 0.65);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 0.5) continue;
        const v = hash(x + dx, cy + dy, 11);
        // Bare in winter: a few twigs where the crown was.
        if (k === 2 && v > 0.35) continue;
        px(leaves[Math.floor((v + t.salt) * 7) % leaves.length], x + dx, cy + dy);
      }
    }
  }
};

/** The land as last painted, for which key. */
let land: { key: string; r: Raster } | null = null;

/** Smoke over the ruins after the blast, thinning away over the first minutes. */
const paintSmoke = (pen: Pen, w: World, since: number, day: number) => {
  const thick = 1 - smooth((since - 30) / 300);
  if (thick <= 0) return;
  for (const [i, s] of w.stumps.entries()) {
    if (hash(i, 9, w.seed) > 0.35) continue;
    for (let k = 0; k < 10; k++) {
      const age = (since * 0.6 + k * 0.1 + hash(i, k)) % 1;
      const x = s.x + s.w / 2 + Math.sin(since * 0.8 + k) * 2 + age * 10;
      const y = HORIZON - s.h * s.keep - age * 30;
      const c = mix("#2a2a2c", "#7a7a7e", day);
      fillFaded(pen, c, thick * (1 - age) * 0.6, x, y, 2 + Math.round(age * 3), 2);
    }
  }
};

/** The sky over the outside, scene px: down to the horizon, where the land takes it. */
const SKY = { x: 0, y: 0, w: SCENE_W, h: HORIZON };
/** How wide the sun and the moon are, px. */
const BODY_PX = 7;
/** The storm after the blast: overhead as friday begins, going off downwind, gone by now. */
const BLOWN_S = STORM_S + 30;

const summer = stormsOf(FRIDAY);

/** Friday's storms: the one after the blast, then summer's thunderstorms in their spells. */
const stormAt = (since: number): Storm | null => {
  if (since >= SEASONS_FROM) return summer(since);
  if (since >= BLOWN_S) return null;
  return { strength: 1 - smooth(ramp(since, STORM_S / 2, BLOWN_S)), along: (since / BLOWN_S) * 10 };
};

const stormSpec = (seed: number): StormSpec => ({ seed, dir: fridayAir(seed).dir });

/** How much of the sky is cloud, 0..1, and how far a spell's deck has come over and gone: the
 *  storm's deck as the wood comes in, clearing after its rain; then the year's (korpi's). */
const cloudOf = (since: number, seed: number): { cover: number; pass: DeckPass } => {
  const year = cloudCover(FRIDAY, since, { seed });
  if (since >= SEASONS_FROM) return { cover: year, pass: deckAt(FRIDAY, since) };
  const gone = smooth(ramp(since, 160, 230));
  return { cover: 1 - (1 - year) * gone, pass: { come: 1, gone } };
};

/** The open sky's flash from lightning `since` seconds into friday, 0..1; none for less
 *  motion. */
export const lightningAt = (since: number, seed: number) =>
  prefersReducedMotion() ? 0 : flashAt(stormSpec(seed), stormAt, since);

/** The sky `since` seconds into friday (korpi's): its colours for the time of day and the
 *  cloud, the stars, the sun and the moon on their arcs, the clouds, a storm's lightning. */
const paintHeavens = (pen: Pen, sky: SkyInput, since: number, seed: number) => {
  const { cover, pass } = cloudOf(since, seed);
  const storm = stormAt(since);
  const strikes = prefersReducedMotion() ? [] : strikesAt(stormSpec(seed), stormAt, since);
  // The storm's night before the first dawn.
  const day: Day =
    since < STORM_S ? { progress: sky.progress, sun: null, moon: null } : dayAt(since);
  paintSky(pen, SKY, day, {
    grey: since < STORM_S ? 1 : greyOf(cover),
    clouds: cloudsAt({ seed, speed: 2 * fridayAir(seed).dir }, SKY, since, cover, pass),
    storm: storm?.strength ?? 0,
    strikes,
    seed,
    t: since,
    body: BODY_PX,
    d: -SKY_Z,
  });
};

/**
 * The outside `since` seconds into friday under `sky`, into `scene` far behind the wall: the sky
 * giving its own light, the smoke, and the land, which takes the sun and the moon as they go
 * down behind the ridge.
 */
export const paintOutside = (scene: Raster, sky: SkyInput, since: number, seed: number) => {
  const w = worldOf(seed);
  const day = daylight(sky.progress);
  const heavens = lit(rasterPen(scene));
  paintHeavens(heavens, sky, since, seed);
  paintSmoke(shifted(heavens, { dd: -SKY_Z }), w, since, day);
  const { k, p } = seasonAt(since);
  const key = `${seed}|${Math.round(healAt(since) * 40)}|${k}|${Math.round(p * 12)}|${snowStep(since)}`;
  if (!land || land.key !== key) {
    const r = land?.r ?? raster(SCENE_W, DEPTH);
    r.px.fill(0);
    r.depth.fill(Infinity);
    paintLand(rasterPen(r), w, since);
    land = { key, r };
  }
  stamp(scene, land.r, 0, 0, { d: -OUTSIDE_Z });
};
