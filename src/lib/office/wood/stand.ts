// Friday's stand: always an apple tree and five others, each kind and shape from the seed,
// growing in at the cracks; their poses in the wind, and the apples.

import { prefersReducedMotion } from "$lib/keys";
import { hash, smooth } from "$lib/scene/pixel";

import { FLOOR_Y, SCENE_W } from "../engine";
import { drawPosed, type Painter } from "./posed";
import { lookAt, SEASON_S, SEASONS_FROM } from "./seasons";
import { poseOf, type TreePose } from "./sway";
import {
  appleOnTree,
  drawApple,
  grownAt,
  paintTreeParts,
  type Plan,
  planTree,
  SPECIES,
  type Species,
} from "./trees";
import { windAt } from "./wind";

/** Where the trees come up, at the cracks, and when; their kind and shape come from the seed. */
const SLOTS = [
  { x: 62, h: 134, start: 60 },
  { x: 100, h: 142, start: 40 },
  { x: 140, h: 138, start: 95 },
  { x: 190, h: 124, start: 75 },
  { x: 232, h: 114, start: 55 },
  { x: 262, h: 98, start: 120 },
];
/** How tall each kind stands against its slot. */
const SIZE: Record<Species, number> = {
  birch: 1,
  rowan: 0.8,
  apple: 0.72,
  oak: 1,
  maple: 1,
  cherry: 0.72,
  plum: 0.75,
  spruce: 1.05,
  pine: 1.15,
};
/** Seconds from sapling to full crown. */
const GROW_S = 180;
/** Growth is drawn in this many steps; a tree is re-baked when it reaches the next one. */
const GROW_STEPS = 40;

export const growth = (i: number, since: number) => smooth((since - SLOTS[i].start) / GROW_S);
/** Growth as drawn: in steps, so a tree is painted afresh only now and then. */
export const grownStep = (i: number, since: number) =>
  Math.round(growth(i, since) * GROW_STEPS) / GROW_STEPS;

let stand: { seed: number; plans: Plan[] } | null = null;

/** `items` in an order the seed picks. */
export const shuffled = <T>(items: T[], seed: number, salt: number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(hash(seed, i, salt) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Friday's trees: always the apple tree, and five of the other kinds, each shaped by the seed. */
export const standOf = (seed: number): Plan[] => {
  if (stand?.seed === seed) return stand.plans;
  const rest = SPECIES.filter((k) => k !== "apple");
  const others = shuffled<Species>(rest, seed, 2).slice(0, SLOTS.length - 1);
  const kinds = shuffled<Species>(["apple", ...others], seed, 3);
  const plans = SLOTS.map((slot, i) =>
    planTree(
      Math.floor(hash(seed, i, 9) * 2 ** 31),
      { x: slot.x, y: FLOOR_Y + 3 },
      slot.h * SIZE[kinds[i]] * (0.9 + 0.2 * hash(seed, i, 5)),
      kinds[i],
    ),
  );
  stand = { seed, plans };
  return plans;
};

/** The last pose of each tree, so the apples and the owl ride the branches the frame drew. */
const poses = new Map<number, { since: number; pose: TreePose }>();

/** How long a tap pushes the apple tree, s. */
const SHAKE_S = 0.6;

/** Tree `i` in friday's wind at the growth step it is drawn at; a tap shakes the apple tree. */
export const poseAt = (i: number, since: number, seed: number, knocks: Knocks): TreePose => {
  const hit = poses.get(i);
  if (hit && hit.since === since) return hit.pose;
  const plan = standOf(seed)[i];
  // A tap is a hard push for a moment; the branches answer it with their own wobble.
  const tapped = plan.species === "apple" ? Math.max(-Infinity, ...Object.values(knocks)) : -1;
  const shake = (time: number) => {
    const d = time - tapped;
    return d >= 0 && d < SHAKE_S ? 3 * Math.sin((Math.PI * d) / SHAKE_S) ** 2 : 0;
  };
  // Asked for less motion, the trees stir rather than toss.
  const calm = prefersReducedMotion() ? 0.3 : 1;
  const pose = poseOf(
    plan,
    grownStep(i, since),
    lookAt(since),
    since,
    (x, ago) => (windAt(since - ago, seed, x) + shake(since - ago)) * calm,
  );
  poses.set(i, { since, pose });
  return pose;
};

export const drawTrees = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  knocks: Knocks,
) => {
  const look = lookAt(since);
  standOf(seed).forEach((plan, i) => {
    const g = growth(i, since);
    if (g <= 0) return;
    const step = grownStep(i, since);
    const key = `${seed}|${step}|${look.k}|${Math.round(look.p * 24)}`;
    const paint: Painter = (rec, part) => paintTreeParts(rec, plan, step, look, part);
    drawPosed(ctx, `tree${i}`, key, paint, poseAt(i, since, seed, knocks));
  });
};

/** Apples knocked down early by a shake, by `year:apple`, at the moment of the shake. */
export type Knocks = Record<string, number>;

const YEAR_S = 4 * SEASON_S;
const APPLE_FALL_S = 0.6;

/** The apple year `since` is in, counted from the first summer of the seasons; -1 before. */
const yearOf = (since: number) =>
  since < SEASONS_FROM ? -1 : Math.floor((since - SEASONS_FROM) / YEAR_S);

const autumnOfYear = (y: number) => SEASONS_FROM + y * YEAR_S + SEASON_S;

/** When apple `j` lets go: some time in the autumn, or when a shake knocked it down. */
const dropAt = (y: number, j: number, knocks: Knocks) =>
  Math.min(
    autumnOfYear(y) + (0.05 + 0.75 * hash(j, y, 61)) * SEASON_S,
    knocks[`${y}:${j}`] ?? Infinity,
  );

/** By then the fallen apples are under the snow. */
const buriedAt = (y: number) => SEASONS_FROM + y * YEAR_S + 2.3 * SEASON_S;

/** The apple tree and its slot. */
const appleTree = (seed: number) => {
  const plans = standOf(seed);
  const i = plans.findIndex((p) => p.species === "apple");
  return i < 0 ? null : { plan: plans[i], i };
};

/** Where apple `j` comes to rest, in the grass below where it hung. */
const groundOf = (hang: { x: number }, y: number, j: number) => ({
  x: Math.min(SCENE_W - 3, Math.max(2, hang.x + (hash(j, y, 62) - 0.5) * 10)),
  y: FLOOR_Y + 2 + Math.floor(hash(j, y, 63) * 16),
});

/** The apples, hanging, falling, and lying in the grass. Drawn with the trees, behind the desk. */
export const drawApples = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  knocks: Knocks,
) => {
  const tree = appleTree(seed);
  const y = yearOf(since);
  if (!tree || y < 0) return;
  const look = lookAt(since);
  const on = appleOnTree(look);
  const at = grownAt(tree.plan, grownStep(tree.i, since));
  const moved = poseAt(tree.i, since, seed, knocks).fruit;
  tree.plan.fruit.forEach((f, j) => {
    const rest = at(f);
    const hang = { x: Math.round(rest.x + moved[j].x), y: Math.round(rest.y + moved[j].y) };
    const drop = dropAt(y, j, knocks);
    if (since < drop) {
      if (on) drawApple(ctx, hang.x, hang.y, on.size, on.ripe, j);
      return;
    }
    if (since >= buriedAt(y)) return;
    const ground = groundOf(rest, y, j);
    const u = Math.min(1, (since - drop) / APPLE_FALL_S);
    const fx = hang.x + (ground.x - hang.x) * u;
    const fy = hang.y + (ground.y - hang.y) * u * u;
    drawApple(ctx, fx, fy, 2, true, j);
  });
};

/** Where apples came down in the grass between two moments of friday: for the thud. */
export const appleCue = (from: number, to: number, seed: number, knocks: Knocks): number[] => {
  const tree = appleTree(seed);
  const y = yearOf(to);
  if (!tree || y < 0 || to <= from) return [];
  const at = grownAt(tree.plan, growth(tree.i, to));
  return tree.plan.fruit.flatMap((f, j) => {
    const landed = dropAt(y, j, knocks) + APPLE_FALL_S;
    return landed > from && landed <= to ? [groundOf(at(f), y, j).x] : [];
  });
};

/** The ripe apples still hanging, soonest to fall first. */
const ripeHanging = (since: number, seed: number, knocks: Knocks) => {
  const tree = appleTree(seed);
  const y = yearOf(since);
  if (!tree || y < 0 || !appleOnTree(lookAt(since))?.ripe) return [];
  return tree.plan.fruit
    .map((_, j) => ({ j, drop: dropAt(y, j, knocks) }))
    .filter((a) => a.drop > since)
    .sort((a, b) => a.drop - b.drop)
    .map((a) => `${y}:${a.j}`);
};

/** Where to tap to shake the apple tree, while it has ripe apples to give: its crown. */
export const appleTreeAt = (since: number, seed: number, knocks: Knocks) => {
  const tree = appleTree(seed);
  if (!tree || !ripeHanging(since, seed, knocks).length) return null;
  const at = grownAt(tree.plan, growth(tree.i, since));
  const { clumps } = tree.plan;
  const left = Math.min(...clumps.map((c) => at({ x: c.x - c.r, y: c.y }).x));
  const right = Math.max(...clumps.map((c) => at({ x: c.x + c.r, y: c.y }).x));
  const top = Math.min(...clumps.map((c) => at({ x: c.x, y: c.y - c.r }).y));
  const bottom = Math.max(...clumps.map((c) => at({ x: c.x, y: c.y + c.r }).y));
  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(right - left),
    h: Math.round(bottom - top),
  };
};

/** A shake: the next ripe apple comes down now. The key to record in the knocks, or null. */
export const shakeApple = (since: number, seed: number, knocks: Knocks): string | null =>
  ripeHanging(since, seed, knocks)[0] ?? null;

/** Once the first apple of the year is down, the hedgehog has one on its spines. */
export const hedgehogApple = (since: number) => {
  const y = yearOf(since);
  return y >= 0 && since > autumnOfYear(y) + 0.1 * SEASON_S;
};
