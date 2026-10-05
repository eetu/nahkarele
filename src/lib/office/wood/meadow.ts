// Friday's flowers: where they come up, and which kind holds each spot as the years go. Bare
// floor after the blast is the pioneers': coltsfoot and dandelions in the cracks first, and
// fireweed wherever it has room to stand; the meadow's kinds once the ground has settled. As
// the trees close over, the light goes and the wood's own flowers take over: wood anemone,
// which flowers before the leaves are out, lily of the valley, wood sorrel in the deepest
// shade. A tree that dies or comes down lets the light back in, and the pioneers with it.
// Worked out a step at a time, the grow-in in short steps and then a year a step, each turn
// taken under the winter's snow, from the seed and the stand alone.

import { prefersReducedMotion } from "$lib/keys";
import { hash, smooth } from "$lib/scene/pixel";

import { FLOOR_Y, SCENE_H, SCENE_W } from "../engine";
import { dayAt } from "./daylight";
import {
  closes,
  type Flower,
  type FlowerPlan,
  FLOWERS,
  paintFlowerParts,
  phaseOf,
  planFlowers,
  shortest,
  showing,
  tallestOf,
} from "./flowers";
import { planAt } from "./growth";
import { drawPosed, drawSheet, type Pt, sheetOf } from "./posed";
import { rustleOf } from "./rustle";
import { lookAt, SEASON_S, SEASONS_FROM } from "./seasons";
import { ageAt, type Life, standing } from "./stand";
import type { Species } from "./trees";
import { windAt } from "./wind";

/** A spot on the floor that can take a patch of flowers: the most room over it, px, and when
 *  there is soil enough there, s. */
type Spot = Pt & { room: number; at: number };

/** What stands on the floor in front of the wall: the AIs and the desk, by their columns. A
 *  flower in front of one must keep below its foot, or be drawn over by it. */
const FURNITURE: [number, number][] = [
  [5, 51],
  [103, 217],
  [269, 315],
];

/** Clear of the trees' feet, the shrubs, and where the exit sign comes down; soonest along
 *  the cracks, where the moss starts. */
const SPOTS: Spot[] = (
  [
    [2, 158, 150],
    [8, 174, 130],
    [54, 158, 70],
    [66, 170, 30],
    [76, 162, 25],
    [92, 176, 40],
    [96, 160, 110],
    [106, 168, 140],
    [136, 158, 35],
    [142, 173, 50],
    [160, 177, 160],
    [182, 158, 170],
    [196, 170, 150],
    [210, 158, 30],
    [224, 167, 35],
    [238, 176, 45],
    [250, 162, 40],
    [258, 173, 55],
    [267, 165, 120],
    [312, 170, 160],
    [318, 157, 180],
  ] as const
)
  .map(([x, y, at]) => ({
    x,
    y,
    at,
    room: FURNITURE.some(([a, b]) => x >= a && x <= b) ? y - FLOOR_Y - 1 : SCENE_H,
  }))
  .sort((a, b) => a.y - b.y);

// --- The light under the trees ------------------------------------------------------------

/** How much light each kind's crown stops in summer, and in spring before its leaves. */
const SHADE: Record<Species, [number, number]> = {
  birch: [0.4, 0.08],
  rowan: [0.45, 0.08],
  apple: [0.5, 0.1],
  oak: [0.6, 0.1],
  maple: [0.7, 0.1],
  cherry: [0.45, 0.08],
  plum: [0.45, 0.08],
  spruce: [0.85, 0.85],
  pine: [0.4, 0.4],
};
/** What reaches the floor whatever stands over it: the sky through the broken walls. */
const SKY = 0.12;
/** How far past its crown's edge a tree's shade reaches, px. */
const PENUMBRA = 10;
/** A tree this tall shades as much as its kind does, px (4 m). */
const SHADES_AT = 160;

type Crown = { x0: number; x1: number; height: number };
const crowns = new WeakMap<Life, Map<number, Crown>>();

/** `life`'s crown at `t`, the part above the room too: how far across it spreads, how tall. */
const crownOf = (life: Life, t: number): Crown => {
  const age = Math.round(ageAt(life, t) * 2) / 2;
  let byAge = crowns.get(life);
  if (!byAge) crowns.set(life, (byAge = new Map()));
  let crown = byAge.get(age);
  if (!crown) {
    const plan = planAt(life.arch, age, false);
    let [x0, x1] = [plan.root.x, plan.root.x];
    for (const c of plan.clumps) {
      x0 = Math.min(x0, c.x - c.r);
      x1 = Math.max(x1, c.x + c.r);
    }
    crown = { x0, x1, height: plan.height };
    byAge.set(age, crown);
  }
  return crown;
};

export type Shade = { summer: number; spring: number };

/** The shade on the floor across the room `t` seconds into friday, 0 open sky to 1 none: the
 *  living trees' crowns, each full under it and fading past its edge, and the sky between. */
export const shadeAt = (seed: number, t: number): ((x: number) => Shade) => {
  const over = standing(seed, t)
    .filter((l) => t < l.dies)
    .map((l) => ({ crown: crownOf(l, t), cast: SHADE[l.arch.species] }));
  return (x) => {
    let [summer, spring] = [1, 1];
    for (const { crown, cast } of over) {
      const past = Math.max(crown.x0 - x, x - crown.x1, 0);
      const f = Math.max(0, 1 - past / PENUMBRA) * smooth(crown.height / SHADES_AT);
      summer *= 1 - cast[0] * f;
      spring *= 1 - cast[1] * f;
    }
    return { summer: (1 - summer) * (1 - SKY), spring: (1 - spring) * (1 - SKY) };
  };
};

// --- Which kind holds a spot --------------------------------------------------------------

type Span = [number, number];

/**
 * Where each kind comes in: the summer's shade it takes, the spring's (under bare branches)
 * for the anemone, and how many years the spot must have been open to the sky, or shaded, or
 * at most for a pioneer.
 */
type Niche = { shade: Span; spring?: Span; open?: Span; shut?: Span };
const NICHE: Record<Flower, Niche> = {
  coltsfoot: { shade: [0, 0.3], open: [0, 2] },
  dandelion: { shade: [0, 0.45], open: [0, 8] },
  fireweed: { shade: [0, 0.35], open: [0, 4] },
  oxeye: { shade: [0, 0.3], open: [1, Infinity] },
  harebell: { shade: [0, 0.4], open: [1, Infinity] },
  anemone: { shade: [0.35, 0.8], spring: [0, 0.45] },
  lily: { shade: [0.4, 0.75], shut: [1, Infinity] },
  sorrel: { shade: [0.6, 1], shut: [0.5, Infinity] },
};
/** A kind already there holds on this far past where it would come in: shade, and years. */
const HOLD = { shade: 0.1, years: 2 };
/** Shade under this is open to the sky; over it, shaded. */
const LIGHT = 0.4;
/** How likely a kind is to reach a spot that suits it in a year: the pioneers' seed is on the
 *  wind, the wood's flowers creep in by the root. */
const SPREAD: Record<Flower, number> = {
  coltsfoot: 0.6,
  dandelion: 0.6,
  fireweed: 0.5,
  oxeye: 0.4,
  harebell: 0.4,
  anemone: 0.45,
  lily: 0.35,
  sorrel: 0.35,
};

type Ground = { shade: number; spring: number; open: number; shut: number };

const fits = (kind: Flower, at: Ground, room: number, held: boolean) => {
  const n = NICHE[kind];
  const ds = held ? HOLD.shade : 0;
  const dy = held ? HOLD.years : 0;
  const inside = (v: number, s: Span | undefined, d: number) =>
    !s || (v >= s[0] - d && v < s[1] + d);
  return (
    room >= shortest(kind) &&
    inside(at.shade, n.shade, ds) &&
    inside(at.spring, n.spring, ds) &&
    inside(at.open, n.open, dy) &&
    inside(at.shut, n.shut, dy)
  );
};

const YEAR_S = 4 * SEASON_S;
/** The first wood's years over the grow-in, as the stand counts them. */
const GROWIN_Y = 5;
/** The grow-in in this many steps, this long; then a step a year. */
const GROWIN_STEPS = 7;
const GROWIN_STEP_S = 40;
/** When in the year the flowers turn over: deep in the winter, under the snow. */
const TURN = 2.85 * SEASON_S;

const stepAt = (n: number) =>
  n < GROWIN_STEPS ? (n + 1) * GROWIN_STEP_S : SEASONS_FROM + (n - GROWIN_STEPS) * YEAR_S + TURN;
/** The light a step goes by: the one it comes up into, spring's, after any tree that dies. */
const lightOf = (n: number) => (n < GROWIN_STEPS ? stepAt(n) : stepAt(n) + 0.5 * SEASON_S);
const yearsAt = (t: number) =>
  t < SEASONS_FROM ? (GROWIN_Y * t) / SEASONS_FROM : GROWIN_Y + (t - SEASONS_FROM) / YEAR_S;

/** A kind holding a spot from one moment until another (or for good), its patch's seed. */
type Tenancy = { kind: Flower; from: number; to: number; seed: number; plan?: FlowerPlan };
type Plot = { lit: boolean | null; open: number; shut: number; held: Tenancy[] };

let meadow: { seed: number; steps: number; plots: Plot[] } | null = null;

/** Step `n` for every spot: how its light has gone, and whether its kind holds or gives way. */
const turn = (seed: number, plots: Plot[], n: number) => {
  const t = stepAt(n);
  const dt = n ? yearsAt(t) - yearsAt(stepAt(n - 1)) : 0;
  const shade = shadeAt(seed, lightOf(n));
  SPOTS.forEach((spot, i) => {
    if (t < spot.at) return;
    const plot = plots[i];
    const { summer, spring } = shade(spot.x);
    const lit = summer < LIGHT;
    if (plot.lit !== lit) [plot.open, plot.shut] = [0, 0];
    else if (lit) plot.open += dt;
    else plot.shut += dt;
    plot.lit = lit;
    const ground = { shade: summer, spring, open: plot.open, shut: plot.shut };
    const last = plot.held.at(-1);
    const here = last && last.to === Infinity ? last : null;
    if (here && fits(here.kind, ground, spot.room, true)) return;
    if (here) here.to = t;
    const comes = FLOWERS.map((kind, j) => ({ kind, j, order: hash(seed, i, n, j, 41) }))
      .filter(({ kind }) => fits(kind, ground, spot.room, false))
      .sort((a, b) => a.order - b.order)
      .find(({ kind, j }) => hash(seed, i, n, j, 42) < 1 - (1 - SPREAD[kind]) ** Math.max(dt, 0.5));
    if (comes) {
      const patch = Math.floor(hash(seed, i, n, 43) * 2 ** 31);
      plot.held.push({ kind: comes.kind, from: t, to: Infinity, seed: patch });
    }
  });
};

/** Every spot's history up to `since`. */
const plotsTo = (seed: number, since: number): Plot[] => {
  if (meadow?.seed !== seed) {
    const plots = SPOTS.map((): Plot => ({ lit: null, open: 0, shut: 0, held: [] }));
    meadow = { seed, steps: 0, plots };
  }
  while (stepAt(meadow.steps) <= since) turn(seed, meadow.plots, meadow.steps++);
  return meadow.plots;
};

/** Seconds a patch takes to come up, and to wither once another kind has the spot. */
const GROW_S = 30;
const WITHER_S = 20;

/** How far `held` is up `since` seconds into friday, 0..1. */
const grownOf = (held: Tenancy, since: number) =>
  smooth((since - held.from) / GROW_S) * (1 - smooth((since - held.to) / WITHER_S));

/** What holds each spot `since` seconds into friday, if anything: for the tests. */
export const flowersAt = (seed: number, since: number) =>
  plotsTo(seed, since).map((plot, i) => {
    const held = plot.held.find((h) => h.from <= since && since < h.to);
    return held ? { x: SPOTS[i].x, y: SPOTS[i].y, kind: held.kind } : null;
  });

/** The flowers on the floor, back to front, in friday's wind: one sheet, drawn once. */
export const drawFlowers = (ctx: CanvasRenderingContext2D, since: number, seed: number) => {
  const plots = plotsTo(seed, since);
  const look = lookAt(since);
  const night = dayAt(since).sun === null;
  const calm = prefersReducedMotion() ? 0.3 : 1;
  const wind = (x: number, ago: number) => windAt(since - ago, seed, x) * calm;
  const sheet = sheetOf("flowers", SCENE_W, SCENE_H);
  plots.forEach((plot, i) => {
    for (const held of plot.held) {
      if (held.from > since || since >= held.to + WITHER_S) continue;
      const g = grownOf(held, since);
      const phase = phaseOf(held.kind, look);
      if (g <= 0 || !showing(phase)) continue;
      const spot = SPOTS[i];
      const plan = (held.plan ??= planFlowers(held.seed, held.kind, spot, spot.room));
      if (look.snow * 6 >= tallestOf(plan)) continue;
      const shut = night && closes(held.kind);
      const key = `${held.seed}|${look.k}|${Math.round(look.p * 24)}|${shut}|${Math.round(g * 12)}|${Math.round(look.snow * 6)}`;
      const pose = rustleOf(plan, g * Math.max(0.3, phase.up), look, since, wind);
      // One name for what holds the spot and one for what withers there, so each keeps its
      // painting while the other changes.
      const name = `flowers${i}${held.to === Infinity ? "" : "-was"}`;
      const paint = (rec: CanvasRenderingContext2D, part: Parameters<typeof paintFlowerParts>[5]) =>
        paintFlowerParts(rec, plan, g, look, shut, part);
      drawPosed(ctx, name, key, paint, pose, undefined, sheet);
    }
  });
  drawSheet(ctx, sheet);
};
