// The workbench's units: each piece of the rooms that draws itself, behind one small
// interface, so it can be looked at alone, at any setting, side by side with its variants.
// An adapter here only sets the stage; the drawing is the unit's own code from $lib.

import { sfx } from "$lib/audio/sfx.svelte";
import { FLOOR_Y, SCENE_H, SCENE_W } from "$lib/office/engine";
import {
  appleTreeAt,
  drawApples,
  drawGround,
  drawTrees,
  type Knocks,
  lookAt,
  SEASON_S,
  SEASONS_FROM,
  shakeApple,
} from "$lib/office/forest";
import { paintFruit, paintTree, planTree, SPECIES, type Species } from "$lib/office/trees";
import { CALENDAR, drawCalendar } from "$lib/scene/calendar";
import { drawPixelText, pixelTextWidth } from "$lib/scene/pixelfont";
import { drawSprite, frameOf, type Sprite } from "$lib/sprites/sprite";

export type Param =
  | { kind: "range"; key: string; min: number; max: number; step: number }
  | { kind: "select"; key: string; options: readonly string[] }
  | { kind: "seed"; key: string }
  | { kind: "text"; key: string };

export type Values = Record<string, number | string>;

export type Unit = {
  name: string;
  /** Starting values; a unit with a `seed` can be shown as a grid of seeds. */
  defaults: Values;
  /** The controls, which may depend on the current values. */
  params: (v: Values) => Param[];
  /** Scene px of one rendering. */
  size: (v: Values) => { w: number; h: number };
  /** Draw at the origin, `t` seconds into the bench's clock. */
  draw: (ctx: CanvasRenderingContext2D, v: Values, t: number) => void;
  /** Redrawn every frame, on the bench's clock. */
  animated?: boolean;
  /** A click or tap on the rendering, at a scene point. */
  tap?: (v: Values, t: number, at: { x: number; y: number }) => void;
};

const num = (v: Values, key: string) => Number(v[key]);
const str = (v: Values, key: string) => String(v[key]);

const SEASONS = ["summer", "autumn", "winter", "spring"] as const;
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

/** The office wall and a strip of floor, so a tree stands where it would. */
const office = (ctx: CanvasRenderingContext2D, w: number, h: number, floor: number) => {
  ctx.fillStyle = "#8d969c";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#4f7f33";
  ctx.fillRect(0, floor, w, h - floor);
};

const tree: Unit = {
  name: "tree",
  defaults: { species: "birch", seed: 1, growth: 1, season: "summer", through: 0.5, height: 90 },
  params: () => [
    { kind: "select", key: "species", options: SPECIES },
    { kind: "seed", key: "seed" },
    { kind: "range", key: "growth", min: 0, max: 1, step: 0.025 },
    { kind: "select", key: "season", options: SEASONS },
    { kind: "range", key: "through", min: 0, max: 0.99, step: 0.01 },
    { kind: "range", key: "height", min: 30, max: 140, step: 5 },
  ],
  size: () => ({ w: 110, h: 160 }),
  draw: (ctx, v) => {
    const k = SEASONS.indexOf(str(v, "season") as (typeof SEASONS)[number]);
    const look = lookAt(SEASONS_FROM + (k + num(v, "through")) * SEASON_S);
    office(ctx, 110, 160, 151);
    if (look.snow > 0) {
      ctx.globalAlpha = look.snow;
      ctx.fillStyle = "#f4f7fa";
      ctx.fillRect(0, 151, 110, 9);
      ctx.globalAlpha = 1;
    }
    const plan = planTree(
      num(v, "seed"),
      { x: 55, y: 153 },
      num(v, "height"),
      str(v, "species") as Species,
    );
    paintTree(ctx, plan, num(v, "growth"), look);
    paintFruit(ctx, plan, num(v, "growth"), look);
  },
};

/** Friday's stand as the room grows it: four trees and the ground under them. */
/** Apples shaken down on the bench, per seed of wood. */
const benchKnocks = new Map<number, Knocks>();
const knocksOf = (seed: number): Knocks => {
  const known = benchKnocks.get(seed);
  if (known) return known;
  const fresh: Knocks = {};
  benchKnocks.set(seed, fresh);
  return fresh;
};

/** Friday's stand as the room grows it, `since` plus the bench's clock. Tap the apple tree
 *  while it has ripe apples to shake one down; it starts in late summer, when they are. */
const wood: Unit = {
  name: "wood",
  defaults: { seed: 1, since: SEASONS_FROM + 0.85 * SEASON_S },
  params: () => [
    { kind: "seed", key: "seed" },
    { kind: "range", key: "since", min: 0, max: SEASONS_FROM + 4 * SEASON_S, step: 5 },
  ],
  size: () => ({ w: SCENE_W, h: SCENE_H }),
  animated: true,
  draw: (ctx, v, t) => {
    const since = num(v, "since") + t;
    const seed = num(v, "seed");
    const knocks = knocksOf(seed);
    office(ctx, SCENE_W, SCENE_H, FLOOR_Y);
    drawTrees(ctx, since, seed, knocks);
    drawGround(ctx, since);
    drawApples(ctx, since, seed, knocks);
  },
  tap: (v, t, at) => {
    const since = num(v, "since") + t;
    const seed = num(v, "seed");
    const knocks = knocksOf(seed);
    const tree = appleTreeAt(since, seed, knocks);
    if (
      !tree ||
      at.x < tree.x ||
      at.x > tree.x + tree.w ||
      at.y < tree.y ||
      at.y > tree.y + tree.h
    ) {
      return;
    }
    const key = shakeApple(since, seed, knocks);
    if (!key) return;
    knocks[key] = since;
    sfx.rustle();
  },
};

const SPRITES: Record<string, Sprite> = Object.fromEntries(
  Object.values(
    import.meta.glob<Sprite>("/src/lib/sprites/*.json", { eager: true, import: "default" }),
  ).map((s) => [s.name, s]),
);
const ALL_FRAMES = "all frames";
const PAD = 3;

/** Any dab sprite: every frame side by side, or one animation playing, in any variant. */
const sprite: Unit = {
  name: "sprite",
  defaults: { sprite: "deer", animation: ALL_FRAMES, variant: "-", fps: 6 },
  params: (v) => {
    const s = SPRITES[str(v, "sprite")];
    return [
      { kind: "select", key: "sprite", options: Object.keys(SPRITES).sort() },
      {
        kind: "select",
        key: "animation",
        options: [ALL_FRAMES, ...Object.keys(s.animations ?? {})],
      },
      { kind: "select", key: "variant", options: ["-", ...Object.keys(s.variants ?? {})] },
      { kind: "range", key: "fps", min: 1, max: 16, step: 1 },
    ];
  },
  size: (v) => {
    const s = SPRITES[str(v, "sprite")];
    const n = str(v, "animation") === ALL_FRAMES ? s.frames.length : 1;
    return { w: n * (s.w + PAD) + PAD, h: s.h + PAD * 2 };
  },
  animated: true,
  draw: (ctx, v, t) => {
    const s = SPRITES[str(v, "sprite")];
    const variant = str(v, "variant") === "-" ? undefined : str(v, "variant");
    const animation = str(v, "animation");
    if (animation === ALL_FRAMES) {
      s.frames.forEach((_, i) =>
        drawSprite(ctx, s, PAD + i * (s.w + PAD), PAD, { frame: i, variant }),
      );
      return;
    }
    // A stale animation name (another sprite was picked) falls back to frame 0.
    const frame = s.animations?.[animation] ? frameOf(s, animation, t * num(v, "fps")) : 0;
    drawSprite(ctx, s, PAD, PAD, { frame, variant });
  },
};

const calendar: Unit = {
  name: "calendar",
  defaults: { day: "monday", count: 24 },
  params: () => [
    { kind: "select", key: "day", options: DAYS },
    { kind: "range", key: "count", min: -1, max: 120, step: 1 },
  ],
  size: () => ({ w: CALENDAR.w + 8, h: CALENDAR.h + 10 }),
  draw: (ctx, v) => {
    ctx.fillStyle = "#b9c0c4";
    ctx.fillRect(0, 0, CALENDAR.w + 8, CALENDAR.h + 10);
    const count = num(v, "count");
    drawCalendar(ctx, 4, 6, str(v, "day"), count < 0 ? null : count);
  },
};

const INKS: Record<string, { ink: string; ground: string }> = {
  readout: { ink: "#9fcf6a", ground: "#0d1a12" },
  led: { ink: "#ff3b2a", ground: "#140807" },
  counter: { ink: "#e8ecf0", ground: "#15120f" },
  stencil: { ink: "#5e4726", ground: "#8a6a3a" },
};

const text: Unit = {
  name: "pixel text",
  defaults: { text: "belt 1.0  5.68€", ink: "readout", scale: 1 },
  params: () => [
    { kind: "text", key: "text" },
    { kind: "select", key: "ink", options: Object.keys(INKS) },
    { kind: "range", key: "scale", min: 1, max: 4, step: 1 },
  ],
  size: (v) => ({
    w: pixelTextWidth(str(v, "text"), num(v, "scale")) + 6,
    h: 7 * num(v, "scale") + 6,
  }),
  draw: (ctx, v) => {
    const { ink, ground } = INKS[str(v, "ink")];
    const { w, h } = text.size(v);
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, w, h);
    drawPixelText(ctx, str(v, "text"), 3, 3, ink, { scale: num(v, "scale") });
  },
};

export const UNITS: Unit[] = [tree, wood, sprite, calendar, text];
