// The workbench's units: each piece of the rooms that draws itself, behind one small
// interface, so it can be looked at alone, at any setting, side by side with its variants.
// An adapter here only sets the stage; the drawing is the unit's own code from $lib.

import { sfx } from "$lib/audio/sfx.svelte";
import { FLOOR_Y, SCENE_H, SCENE_W } from "$lib/office/engine";
import {
  type Climber,
  type ClimberPlan,
  CLIMBERS,
  paintClimberParts,
  planClimber,
} from "$lib/office/wood/climbers";
import { type GrassPlan, paintGrassParts, planGrass } from "$lib/office/wood/grass";
import { archOf, fruitAt, planAt } from "$lib/office/wood/growth";
import { drawPosed, sheetScope } from "$lib/office/wood/posed";
import { rustleOf } from "$lib/office/wood/rustle";
import { lookAt, SEASON_S, SEASONS_FROM } from "$lib/office/wood/seasons";
import {
  paintShrubParts,
  planShrub,
  type Shrub,
  type ShrubPlan,
  SHRUBS,
} from "$lib/office/wood/shrubs";
import {
  appleTreeAt,
  drawApples,
  drawTrees,
  type Knocks,
  shakeApple,
} from "$lib/office/wood/stand";
import { poseOf } from "$lib/office/wood/sway";
import {
  FRUIT,
  paintFruit,
  paintTreeParts,
  type Plan,
  SPECIES,
  type Species,
} from "$lib/office/wood/trees";
import { drawGround } from "$lib/office/wood/weather";
import { CALENDAR, drawCalendar } from "$lib/scene/calendar";
import { drawPixelText, pixelTextWidth } from "$lib/scene/pixelfont";
import { drawSprite, frameOf, type Sprite } from "$lib/sprites/sprite";

import { stoneUnit, wallSim } from "./wallSim";

export type Param =
  | { kind: "range"; key: string; min: number; max: number; step: number }
  | { kind: "select"; key: string; options: readonly string[] }
  | { kind: "seed"; key: string }
  | { kind: "text"; key: string }
  /** On or off: a checkbox, its value 1 or 0. */
  | { kind: "toggle"; key: string };

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

/** The bench's wind: `wind`, steady (stirring a little, as friday's does) or with a gust
 *  every eight seconds. */
const blowing = (v: Values, time: number) =>
  num(v, "wind") *
  (1 +
    0.12 * Math.sin(0.7 * time) +
    0.08 * Math.sin(1.6 * time + 1.1) +
    (str(v, "gusts") === "gusty" ? 0.8 * Math.max(0, Math.sin(time * 0.8)) ** 3 : 0));

/** The bench's trees at an age, with that year's fruit, so a moving tree is planned once. */
const plans = new Map<string, Plan>();
const planFor = (seed: number, species: Species, age: number, tall: boolean) => {
  const key = `${seed}|${species}|${age}|${tall}`;
  let plan = plans.get(key);
  if (!plan) {
    const h = tall ? TALL_H : SCENE_H;
    const base = planAt(archOf(seed, { x: 130, y: h - 27 }, species, 41), age, false);
    plan = { ...base, fruit: fruitAt(base, 0, FRUIT[species] ?? 0, age) };
    plans.set(key, plan);
  }
  return plan;
};
/** A bench tall enough to see a grown tree whole. */
const TALL_H = 640;

/** One tree at an age, in a wind of `wind` (friday's strength), steady or in gusts, moving as
 *  on friday. `room` shows it as the room would (180 px high) or whole. */
const tree: Unit = {
  name: "tree",
  animated: true,
  defaults: {
    species: "birch",
    seed: 1,
    age: 5,
    room: "room",
    season: "summer",
    through: 0.5,
    wind: 0.5,
    gusts: "gusty",
  },
  params: () => [
    { kind: "select", key: "species", options: SPECIES },
    { kind: "seed", key: "seed" },
    { kind: "range", key: "age", min: 0, max: 40, step: 0.25 },
    { kind: "select", key: "room", options: ["room", "whole"] },
    { kind: "select", key: "season", options: SEASONS },
    { kind: "range", key: "through", min: 0, max: 0.99, step: 0.01 },
    { kind: "range", key: "wind", min: -2, max: 2, step: 0.1 },
    { kind: "select", key: "gusts", options: ["steady", "gusty"] },
  ],
  size: (v) => ({ w: 260, h: str(v, "room") === "whole" ? TALL_H : SCENE_H }),
  draw: (ctx, v, t) => {
    const tall = str(v, "room") === "whole";
    const h = tall ? TALL_H : SCENE_H;
    const k = SEASONS.indexOf(str(v, "season") as (typeof SEASONS)[number]);
    const look = lookAt(SEASONS_FROM + (k + num(v, "through")) * SEASON_S);
    office(ctx, 260, h, h - 29);
    if (look.snow > 0) {
      ctx.globalAlpha = look.snow;
      ctx.fillStyle = "#f4f7fa";
      ctx.fillRect(0, h - 29, 260, 9);
      ctx.globalAlpha = 1;
    }
    const seed = num(v, "seed");
    const species = str(v, "species") as Species;
    const age = num(v, "age");
    const plan = planFor(seed, species, age, tall);
    const pose = poseOf(plan, 1, look, t, (_, ago) => blowing(v, t - ago));
    const key = `${seed}|${species}|${age}|${tall}|${look.k}|${look.p}`;
    drawPosed(
      ctx,
      `tree${seed}`,
      key,
      (rec, part) => paintTreeParts(rec, plan, 1, look, part),
      pose,
    );
    paintFruit(ctx, plan, 1, look, pose.fruit);
  },
};

/** One shrub in the wind, rustling as on friday. */
const shrub: Unit = {
  name: "shrub",
  animated: true,
  defaults: {
    kind: "raspberry",
    seed: 1,
    growth: 1,
    season: "summer",
    through: 0.7,
    height: 18,
    wind: 0.8,
    gusts: "gusty",
  },
  params: () => [
    { kind: "select", key: "kind", options: SHRUBS },
    { kind: "seed", key: "seed" },
    { kind: "range", key: "growth", min: 0, max: 1, step: 0.025 },
    { kind: "select", key: "season", options: SEASONS },
    { kind: "range", key: "through", min: 0, max: 0.99, step: 0.01 },
    { kind: "range", key: "height", min: 4, max: 40, step: 1 },
    { kind: "range", key: "wind", min: -2, max: 2, step: 0.1 },
    { kind: "select", key: "gusts", options: ["steady", "gusty"] },
  ],
  size: () => ({ w: 60, h: 50 }),
  draw: (ctx, v, t) => {
    const k = SEASONS.indexOf(str(v, "season") as (typeof SEASONS)[number]);
    const look = lookAt(SEASONS_FROM + (k + num(v, "through")) * SEASON_S);
    office(ctx, 60, 50, 42);
    const seed = num(v, "seed");
    const kind = str(v, "kind") as Shrub;
    const key = `${seed}|${num(v, "height")}|${kind}`;
    let plan = shrubPlans.get(key);
    if (!plan) {
      plan = planShrub(seed, { x: 30, y: 44 }, num(v, "height"), kind);
      shrubPlans.set(key, plan);
    }
    const g = num(v, "growth");
    const pose = rustleOf(plan, g, look, t, (_, ago) => blowing(v, t - ago));
    const painted = `${key}|${g}|${look.k}|${look.p}`;
    const it = plan;
    drawPosed(
      ctx,
      `shrub${seed}`,
      painted,
      (rec, part) => paintShrubParts(rec, it, g, look, part),
      pose,
    );
  },
};
const shrubPlans = new Map<string, ShrubPlan>();

/** One climber up a wall, as far as it has reached, rustling as on friday. */
const climber: Unit = {
  name: "climber",
  animated: true,
  defaults: {
    kind: "creeper",
    seed: 1,
    reach: 1,
    season: "summer",
    through: 0.5,
    height: 100,
    wind: 0.8,
    gusts: "gusty",
  },
  params: () => [
    { kind: "select", key: "kind", options: CLIMBERS },
    { kind: "seed", key: "seed" },
    { kind: "range", key: "reach", min: 0, max: 1, step: 0.02 },
    { kind: "select", key: "season", options: SEASONS },
    { kind: "range", key: "through", min: 0, max: 0.99, step: 0.01 },
    { kind: "range", key: "height", min: 30, max: 140, step: 5 },
    { kind: "range", key: "wind", min: -2, max: 2, step: 0.1 },
    { kind: "select", key: "gusts", options: ["steady", "gusty"] },
  ],
  size: () => ({ w: 60, h: 150 }),
  draw: (ctx, v, t) => {
    const k = SEASONS.indexOf(str(v, "season") as (typeof SEASONS)[number]);
    const look = lookAt(SEASONS_FROM + (k + num(v, "through")) * SEASON_S);
    office(ctx, 60, 150, 144);
    const seed = num(v, "seed");
    const kind = str(v, "kind") as Climber;
    const key = `${seed}|${num(v, "height")}|${kind}`;
    let plan = climberPlans.get(key);
    if (!plan) {
      plan = planClimber(seed, { x: 30, y: 144 }, num(v, "height"), kind);
      climberPlans.set(key, plan);
    }
    const reach = num(v, "reach");
    const pose = rustleOf(plan, 1, look, t, (_, ago) => blowing(v, t - ago));
    const it = plan;
    drawPosed(
      ctx,
      `climber${seed}`,
      `${key}|${reach}|${look.k}|${look.p}`,
      (rec, part) => paintClimberParts(rec, it, reach, look, part),
      pose,
    );
  },
};
const climberPlans = new Map<string, ClimberPlan>();

/** A patch of grass, three tufts, waving as on friday. */
const grass: Unit = {
  name: "grass",
  animated: true,
  defaults: { seed: 1, growth: 1, season: "summer", through: 0.7, wind: 0.8, gusts: "gusty" },
  params: () => [
    { kind: "seed", key: "seed" },
    { kind: "range", key: "growth", min: 0, max: 1, step: 0.05 },
    { kind: "select", key: "season", options: SEASONS },
    { kind: "range", key: "through", min: 0, max: 0.99, step: 0.01 },
    { kind: "range", key: "wind", min: -2, max: 2, step: 0.1 },
    { kind: "select", key: "gusts", options: ["steady", "gusty"] },
  ],
  size: () => ({ w: 60, h: 24 }),
  draw: (ctx, v, t) => {
    const k = SEASONS.indexOf(str(v, "season") as (typeof SEASONS)[number]);
    const look = lookAt(SEASONS_FROM + (k + num(v, "through")) * SEASON_S);
    office(ctx, 60, 24, 4);
    if (look.snow > 0) {
      ctx.globalAlpha = look.snow;
      ctx.fillStyle = "#f4f7fa";
      ctx.fillRect(0, 4, 60, 20);
      ctx.globalAlpha = 1;
    }
    const seed = num(v, "seed");
    let plan = grassPlans.get(seed);
    if (!plan) {
      const tufts = [14, 30, 46].map((x, i) => ({ x, y: 18 + (i % 2) * 3, delay: 0 }));
      plan = planGrass(seed, tufts);
      grassPlans.set(seed, plan);
    }
    // A tuft's growth by its clock: a full tuft is GROW_S seconds old.
    const since = num(v, "growth") * 30;
    const pose = rustleOf(plan, 1, look, t, (_, ago) => blowing(v, t - ago));
    const it = plan;
    drawPosed(
      ctx,
      `grass${seed}`,
      `${seed}|${since}|${look.k}|${look.p}`,
      (rec, part) => paintGrassParts(rec, it, since, look, part),
      pose,
    );
  },
};
const grassPlans = new Map<number, GrassPlan>();

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
    { kind: "range", key: "since", min: 0, max: SEASONS_FROM + 80 * SEASON_S, step: 5 },
  ],
  size: () => ({ w: SCENE_W, h: SCENE_H }),
  animated: true,
  draw: (ctx, v, t) => {
    const since = num(v, "since") + t;
    const seed = num(v, "seed");
    const knocks = knocksOf(seed);
    office(ctx, SCENE_W, SCENE_H, FLOOR_Y);
    // Sheets of its own: the tiles of a grid of seeds all draw in one frame.
    sheetScope(`wood${seed}:`);
    drawTrees(ctx, since, seed, knocks, false);
    drawTrees(ctx, since, seed, knocks, true);
    sheetScope("");
    drawGround(ctx, since);
    drawApples(ctx, since, seed, knocks, false);
    drawApples(ctx, since, seed, knocks, true);
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

export const UNITS: Unit[] = [
  tree,
  shrub,
  climber,
  grass,
  wood,
  wallSim,
  stoneUnit,
  sprite,
  calendar,
  text,
];
