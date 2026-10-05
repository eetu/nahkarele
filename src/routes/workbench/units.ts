// The workbench's units: each piece of the rooms that draws itself, behind one small
// interface, so it can be looked at alone, at any setting, side by side with its variants.
// An adapter here only sets the stage; the drawing is the unit's own code from $lib.

import { sfx } from "$lib/audio/sfx.svelte";
import { BOX, drawCharger, PAD as DOCK } from "$lib/office/charger";
import { FLOOR_Y, SCENE_H, SCENE_W } from "$lib/office/engine";
import {
  type Climber,
  type ClimberPlan,
  CLIMBERS,
  paintClimberParts,
  planClimber,
} from "$lib/office/wood/climbers";
import {
  annual,
  conkKey,
  type ConkKind,
  CONKS,
  conksOn,
  drawConk,
  tallOf,
} from "$lib/office/wood/conks";
import {
  closes,
  type Flower,
  type FlowerPlan,
  FLOWERS,
  paintFlowerParts,
  planFlowers,
} from "$lib/office/wood/flowers";
import { type GrassPlan, paintGrassParts, planGrass } from "$lib/office/wood/grass";
import { archOf, fruitAt, lifespanOf, planAt } from "$lib/office/wood/growth";
import { drawSpider } from "$lib/office/wood/life";
import { drawFlowers } from "$lib/office/wood/meadow";
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
import droneSprite from "$lib/sprites/drone.json";
import { drawSprite, frameOf, type Sprite } from "$lib/sprites/sprite";

import { clock, px, share, years } from "./show";
import { stoneUnit, wallSim } from "./wallSim";

export type Param = {
  key: string;
  /** What it sets, as a fact: its unit, what its ends mean. Shown under the control. */
  hint?: string;
  /** Folded away under this heading until opened: knobs for tuning, not for looking. */
  group?: string;
} & (
  | {
      kind: "range";
      min: number;
      max: number;
      step: number;
      /** How the value reads beside the slider. */
      show?: (v: number) => string;
    }
  | { kind: "select"; options: readonly string[] }
  | { kind: "seed" }
  | { kind: "text" }
  /** On or off: a checkbox, its value 1 or 0. */
  | { kind: "toggle" }
);

export type Values = Record<string, number | string>;

export type Unit = {
  name: string;
  /** What it shows, in a line, and what a tap on it does. */
  about: string;
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

/** The season to dress for, and how far into it. */
const SEASON: Param[] = [
  { kind: "select", key: "season", options: SEASONS },
  { kind: "range", key: "through", min: 0, max: 0.99, step: 0.01, show: share },
];
/** The bench's wind, in friday's strength. */
const WIND: Param[] = [
  {
    kind: "range",
    key: "wind",
    min: -2,
    max: 2,
    step: 0.1,
    hint: "1 a stiff breeze; below 0 it blows to the left",
  },
  { kind: "select", key: "gusts", options: ["steady", "gusty"], hint: "gusty: a gust every 8 s" },
];
const SEASON_WIND = [...SEASON, ...WIND];

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
  about: "one tree at an age, in the wind as on friday",
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
    {
      kind: "range",
      key: "age",
      min: 0,
      max: 40,
      step: 0.25,
      show: years,
      hint: "the first wood is 5 when the year starts turning",
    },
    {
      kind: "select",
      key: "room",
      options: ["room", "whole"],
      hint: "room: cut at the room's 180 px; whole: all of it",
    },
    ...SEASON_WIND,
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
    // It dies at its kind's middling age: older than that, it stands dead, conks and all.
    const died = Math.round(lifespanOf(species, 0.5));
    const dead = age > died ? Math.min(1, (age - died) / 1.5) : 0;
    const plan = planFor(seed, species, Math.min(age, died), tall);
    const seen = dead ? { ...look, dead } : look;
    const arch = archOf(seed, { x: 130, y: h - 27 }, species, 41);
    const through = (k + num(v, "through")) / 4;
    const conks = conksOn(arch, plan, {
      age: Math.floor(age) + through,
      died,
      year: Math.floor(age),
      phase: through,
      snow: look.snow,
    });
    const pose = poseOf(plan, 1, seen, t, (_, ago) => blowing(v, t - ago));
    const key = `${seed}|${species}|${age}|${tall}|${look.k}|${look.p}|${conkKey(conks)}`;
    drawPosed(
      ctx,
      `tree${seed}`,
      key,
      (rec, part) => paintTreeParts(rec, plan, 1, seen, part, conks),
      pose,
    );
    if (!dead) paintFruit(ctx, plan, 1, look, pose.fruit);
  },
};

/** One conk on a strip of trunk, at any size, age and season. */
const conk: Unit = {
  name: "conk",
  about: "one bracket fungus on a strip of trunk",
  defaults: {
    kind: "tinder",
    seed: 1,
    reach: 5,
    years: 3,
    side: "right",
    season: "summer",
    through: 0.5,
    withered: 0,
    snow: 0,
  },
  params: () => [
    { kind: "select", key: "kind", options: CONKS },
    { kind: "seed", key: "seed" },
    {
      kind: "range",
      key: "reach",
      min: 1,
      max: 9,
      step: 1,
      show: px,
      hint: "how far it stands out from the bark",
    },
    { kind: "range", key: "years", min: 0, max: 10, step: 1, hint: "bands grown, one a year" },
    { kind: "select", key: "side", options: ["right", "left"] },
    ...SEASON,
    {
      kind: "range",
      key: "withered",
      min: 0,
      max: 1,
      step: 0.05,
      show: share,
      hint: "how far an annual has gone over; perennials keep",
    },
    { kind: "toggle", key: "snow", hint: "a cap of snow (chaga takes none)" },
  ],
  size: () => ({ w: 40, h: 36 }),
  draw: (ctx, v) => {
    office(ctx, 40, 36, 32);
    // A trunk 8 px across, its bark plain.
    ctx.fillStyle = "#6a5848";
    ctx.fillRect(16, 0, 8, 32);
    ctx.fillStyle = "#857060";
    ctx.fillRect(16, 0, 1, 32);
    const kind = str(v, "kind") as ConkKind;
    const side = str(v, "side") === "left" ? -1 : 1;
    const reach = num(v, "reach");
    const k = SEASONS.indexOf(str(v, "season") as (typeof SEASONS)[number]);
    const phase = (k + num(v, "through")) / 4;
    const withered = annual(kind) ? num(v, "withered") : 0;
    drawConk(ctx, side > 0 ? 24 : 15, 12, {
      kind,
      side,
      reach,
      tall: tallOf(kind, reach),
      bands: 1 + num(v, "years"),
      fresh: annual(kind) ? withered === 0 : phase < 0.3 || phase > 0.85,
      withered,
      snow: num(v, "snow") > 0 && kind !== "chaga",
      seed: num(v, "seed"),
    });
  },
};

/** One shrub in the wind, rustling as on friday. */
const shrub: Unit = {
  name: "shrub",
  about: "one shrub, rustling as on friday",
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
    {
      kind: "range",
      key: "growth",
      min: 0,
      max: 1,
      step: 0.025,
      show: share,
      hint: "0 a shoot, 1 full grown",
    },
    ...SEASON,
    {
      kind: "range",
      key: "height",
      min: 4,
      max: 40,
      step: 1,
      show: px,
      hint: "full grown, at 40 px to the metre",
    },
    ...WIND,
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
  about: "one climber up a wall, as far as it has reached",
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
    {
      kind: "range",
      key: "reach",
      min: 0,
      max: 1,
      step: 0.02,
      show: share,
      hint: "how far up its full height it has got",
    },
    ...SEASON,
    { kind: "range", key: "height", min: 30, max: 140, step: 5, show: px, hint: "its full height" },
    ...WIND,
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
  about: "a patch of three tufts, waving as on friday",
  animated: true,
  defaults: { seed: 1, growth: 1, season: "summer", through: 0.7, wind: 0.8, gusts: "gusty" },
  params: () => [
    { kind: "seed", key: "seed" },
    {
      kind: "range",
      key: "growth",
      min: 0,
      max: 1,
      step: 0.05,
      show: share,
      hint: "how far the tufts are up",
    },
    ...SEASON_WIND,
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

/** A patch of one kind of flower in the wind, through its year; `night` closes those that
 *  close, `room` caps how tall it stands. */
const flower: Unit = {
  name: "flower",
  about: "a patch of one kind of flower through its year",
  animated: true,
  defaults: {
    kind: "fireweed",
    seed: 1,
    growth: 1,
    season: "summer",
    through: 0.6,
    night: 0,
    room: 60,
    wind: 0.8,
    gusts: "gusty",
  },
  params: () => [
    { kind: "select", key: "kind", options: FLOWERS },
    { kind: "seed", key: "seed" },
    {
      kind: "range",
      key: "growth",
      min: 0,
      max: 1,
      step: 0.05,
      show: share,
      hint: "how far the patch has come in, or withered",
    },
    ...SEASON,
    { kind: "toggle", key: "night", hint: "closes the kinds that close at night" },
    {
      kind: "range",
      key: "room",
      min: 2,
      max: 60,
      step: 1,
      show: px,
      hint: "the most it may stand; in front of the desk there is little",
    },
    ...WIND,
  ],
  size: () => ({ w: 40, h: 64 }),
  draw: (ctx, v, t) => {
    const k = SEASONS.indexOf(str(v, "season") as (typeof SEASONS)[number]);
    const look = lookAt(SEASONS_FROM + (k + num(v, "through")) * SEASON_S);
    office(ctx, 40, 64, 56);
    if (look.snow > 0) {
      ctx.globalAlpha = look.snow;
      ctx.fillStyle = "#f4f7fa";
      ctx.fillRect(0, 56, 40, 8);
      ctx.globalAlpha = 1;
    }
    const seed = num(v, "seed");
    const kind = str(v, "kind") as Flower;
    const key = `${seed}|${kind}|${num(v, "room")}`;
    let plan = flowerPlans.get(key);
    if (!plan) {
      plan = planFlowers(seed, kind, { x: 20, y: 60 }, num(v, "room"));
      flowerPlans.set(key, plan);
    }
    const g = num(v, "growth");
    const shut = num(v, "night") > 0 && closes(kind);
    const pose = rustleOf(plan, g, look, t, (_, ago) => blowing(v, t - ago));
    const it = plan;
    drawPosed(
      ctx,
      `flower${seed}`,
      `${key}|${g}|${look.k}|${look.p}|${shut}`,
      (rec, part) => paintFlowerParts(rec, it, g, look, shut, part),
      pose,
    );
  },
};
const flowerPlans = new Map<string, FlowerPlan>();

/** The spider on its thread in the wind, `length` of it let out, climbing up and down it as in
 *  the room when `climbs`. */
const spider: Unit = {
  name: "spider",
  about: "the spider on its thread, swung by the wind as a pendulum",
  animated: true,
  defaults: { length: 34, climbs: 1, wind: 0.8, gusts: "gusty" },
  params: () => [
    {
      kind: "range",
      key: "length",
      min: 4,
      max: 60,
      step: 1,
      show: px,
      hint: "thread let out; the longer, the slower it swings",
    },
    {
      kind: "toggle",
      key: "climbs",
      hint: "up and down its thread, 12 px each way, as in the room",
    },
    ...WIND,
  ],
  size: () => ({ w: 60, h: 80 }),
  draw: (ctx, v, t) => {
    office(ctx, 60, 80, 76);
    const len = num(v, "length") + (num(v, "climbs") ? Math.sin(t * 0.6) * 12 : 0);
    drawSpider(ctx, 30, 0, len, t, (ago) => blowing(v, t - ago));
  },
};

/** Apples shaken down on the bench, per seed of wood. */
const benchKnocks = new Map<number, Knocks>();
const knocksOf = (seed: number): Knocks => {
  const known = benchKnocks.get(seed);
  if (known) return known;
  const fresh: Knocks = {};
  benchKnocks.set(seed, fresh);
  return fresh;
};

/** Friday's stand as the room grows it, `since` plus the bench's clock, and the flowers
 *  under it. Tap the apple tree while it has ripe apples to shake one down; it starts in late
 *  summer, when they are. */
const wood: Unit = {
  name: "wood",
  about: "friday's stand and flowers as the room grows them; tap the apple tree for an apple",
  defaults: { seed: 1, since: SEASONS_FROM + 0.85 * SEASON_S },
  params: () => [
    { kind: "seed", key: "seed" },
    {
      kind: "range",
      key: "since",
      min: 0,
      max: SEASONS_FROM + 80 * SEASON_S,
      step: 5,
      show: clock,
      hint: "into friday, plus the bench's clock; the year turns from 0:05:20, 10 min a year",
    },
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
    sheetScope(`wood${seed}:`);
    drawFlowers(ctx, since, seed);
    sheetScope("");
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
/** No variant: the sprite's own palette. */
const OWN = "own colours";
const PAD = 3;

/** Any dab sprite: every frame side by side, or one animation playing, in any variant. */
const sprite: Unit = {
  name: "sprite",
  about: "any dab sprite: its frames side by side, or one animation playing",
  defaults: { sprite: "deer", animation: ALL_FRAMES, variant: OWN, fps: 6 },
  params: (v) => {
    const s = SPRITES[str(v, "sprite")];
    return [
      { kind: "select", key: "sprite", options: Object.keys(SPRITES).sort() },
      {
        kind: "select",
        key: "animation",
        options: [ALL_FRAMES, ...Object.keys(s.animations ?? {})],
      },
      {
        kind: "select",
        key: "variant",
        options: [OWN, ...Object.keys(s.variants ?? {})],
        hint: "a palette variant drawn in dab",
      },
      { kind: "range", key: "fps", min: 1, max: 16, step: 1, hint: "frames a second, playing" },
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
    const variant = str(v, "variant") === OWN ? undefined : str(v, "variant");
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
  about: "the wall calendar, the day and what is left of it",
  defaults: { day: "monday", count: 24 },
  params: () => [
    { kind: "select", key: "day", options: DAYS },
    {
      kind: "range",
      key: "count",
      min: -1,
      max: 120,
      step: 1,
      hint: "messages left; -1 for none, as on friday",
    },
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
  about: "the 5×7 face the rooms write in",
  defaults: { text: "belt 1.0  5.68€", ink: "readout", scale: 1 },
  params: () => [
    { kind: "text", key: "text" },
    { kind: "select", key: "ink", options: Object.keys(INKS), hint: "one of the rooms' readouts" },
    { kind: "range", key: "scale", min: 1, max: 4, step: 1, hint: "px to a pixel of the face" },
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

/** The drone's charger on its box at the desk's end: coming out of it, its panel to the sun,
 *  the drone asleep on it. */
const SUNS: Record<string, { tilt: number; up: boolean }> = {
  morning: { tilt: -2, up: true },
  noon: { tilt: 0, up: true },
  evening: { tilt: 2, up: true },
  night: { tilt: 0, up: false },
};
const charger: Unit = {
  name: "charger",
  about: "the drone's solar charger on its box at the desk's end",
  animated: true,
  defaults: { open: 1, sun: "noon", docked: 0 },
  params: () => [
    {
      kind: "range",
      key: "open",
      min: 0,
      max: 1,
      step: 0.05,
      show: share,
      hint: "how far it has come up out of the box",
    },
    { kind: "select", key: "sun", options: Object.keys(SUNS), hint: "the panel turns to it" },
    { kind: "toggle", key: "docked", hint: "the drone asleep on it" },
  ],
  size: () => ({ w: 44, h: 36 }),
  draw: (ctx, v, t) => {
    const { tilt, up } = SUNS[str(v, "sun")];
    const docked = num(v, "docked");
    ctx.fillStyle = up ? "#b9c0c4" : "#4a5058";
    ctx.fillRect(0, 0, 44, 36);
    ctx.save();
    ctx.translate(-(BOX.x - 15), -(BOX.y - 28));
    ctx.fillStyle = "#8a6a4a";
    ctx.fillRect(BOX.x - 15, BOX.y + BOX.h, 44, 4);
    drawCharger(ctx, num(v, "open"), tilt, up, docked, t);
    const frame = frameOf(
      droneSprite as Sprite,
      docked ? "charge" : "hover",
      docked ? t * 2 : t * 16,
    );
    const y = docked ? DOCK.y : DOCK.y - 14 + Math.sin(t * 3) * 1.5;
    drawSprite(ctx, droneSprite as Sprite, DOCK.x - 7, Math.round(y), { frame });
    ctx.restore();
  },
};

export const UNITS: Unit[] = [
  tree,
  conk,
  shrub,
  climber,
  grass,
  flower,
  spider,
  wood,
  wallSim,
  stoneUnit,
  sprite,
  calendar,
  charger,
  text,
];
