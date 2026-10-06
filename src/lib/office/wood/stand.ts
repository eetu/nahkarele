// Friday's stand: always an apple tree and five others, each kind and shape from the seed,
// growing in at the cracks (korpi's `standOf`). The first wood comes in fast, five years in a few
// minutes; from then on a year is a year of friday's, and the trees grow as trees do, past the
// top of the room in time. A slot keeps a tree for good: one lives its years, dies standing,
// goes over and lies rotting into the floor, and a sapling of another kind comes up in the gap
// (an apple tree's gap grows an apple tree). This is the room's side of it: where the slots
// are, what the room's view cuts off, which trees stand in front of the furniture, and the
// apple tree's tap.

import { lru } from "@anarkisti/korpi/core";
import type { Pen } from "@anarkisti/korpi/paint";
import { type Life, type Pt, type Slot, type Stand, standOf } from "@anarkisti/korpi/plants";
import { standPainterOf, type Taken } from "@anarkisti/korpi/plants/paint";

import { floorZ, grounded, PX_M, ROOM_VIEW } from "../depth";
import { FLOOR_Y, SCENE_W } from "../engine";
import { FRIDAY, SEASON_S, SEASONS_FROM } from "./seasons";
import { plantWind } from "./wind";

export type { Life, Taken };

/** Apples shaken down early, by `year:apple`, at the moment of the shake: friday records one
 *  as it happens. */
export type Knocks = Record<string, number>;

/** Where the trees are rooted, scene row: behind the furniture a little out from the wall, in
 *  front of it out past the desk's front. The room's height over the trees is the first's. */
export const ROOT_Y = FLOOR_Y + 3;
export const FRONT_ROOT_Y = FLOOR_Y + 6;

/**
 * Where the trees come up, at the cracks, world m, and when, s; their kind and shape come from
 * the seed. Those clear of the desk stand in `front` of the furniture (their feet are nearer
 * than the slabs' and the desk's); those behind the desk keep behind it, so the desk still
 * reads.
 */
const SLOTS: (Slot & { front: boolean })[] = [
  { x: 1.55, start: 60, front: true },
  { x: 2.5, start: 40, front: false },
  { x: 3.5, start: 95, front: false },
  { x: 4.75, start: 75, front: false },
  { x: 5.8, start: 55, front: true },
  { x: 6.55, start: 120, front: true },
].map((s) => ({ ...s, z: floorZ(s.front ? FRONT_ROOT_Y : ROOT_Y) }));

/** Whether `life` stands in front of the furniture or behind it. */
export const inLane = (life: Life, front: boolean) => SLOTS[life.slot].front === front;

const stands = lru<number, Stand>(8);

/** `seed`'s wood. */
export const standFor = (seed: number): Stand =>
  stands.get(seed, () =>
    standOf({
      seed,
      cal: FRIDAY,
      slots: SLOTS,
      always: "apple",
      keeps: ["apple"],
      growIn: { years: 5, by: SEASONS_FROM },
      // Most go over toward the middle of the room, where there is space to lie; a sapling
      // comes up within 7 px of its slot.
      toward: SCENE_W / 2 / PX_M,
      spread: 7 / PX_M,
      plan: {
        // A metre over the room's top; an owl's branch from 0.75 m up to 0.7 m under it.
        cull: (ROOT_Y + 40) / PX_M,
        perch: [30 / PX_M, (ROOT_Y - 28) / PX_M],
      },
      // Fruit from 0.15 m up to 0.2 m under the room's top.
      fruit: [6 / PX_M, (ROOT_Y - 8) / PX_M],
      bounds: [0, SCENE_W / PX_M],
      apples: { ground: { x: [2 / PX_M, (SCENE_W - 3) / PX_M], z: [0.2, 1.7] } },
    }),
  );

/** What stands `since` seconds into friday, alive or dead, at most one a slot, left to right. */
export const standing = (seed: number, since: number): Life[] => standFor(seed).standing(since);

/** What is going over or lying where it fell. */
export const fallen = (seed: number, since: number): Life[] => standFor(seed).fallen(since);

/** Every tree there has been by `since`, and the next of each slot. */
export const livesTo = (seed: number, since: number): Life[] => standFor(seed).lives(since);

/** A point of `life`'s own (m, y up from its root) in scene px. */
export const sceneOf = (life: Life, p: Pt): Pt => {
  const at = ROOM_VIEW.project({ x: life.x + p.x, y: p.y, z: life.z });
  return { x: at.sx, y: at.sy };
};

/** How far a point of `life` has moved in the wind, m (y up), in scene px. */
export const movedPx = (d: Pt): Pt => ({ x: d.x * PX_M, y: -d.y * PX_M });

/** `life` posed in friday's wind; a tap shakes the apple tree. */
export const poseAt = (seed: number, life: Life, since: number, knocks: Knocks) =>
  standFor(seed).poseAt(life, since, plantWind(seed), knocks);

const painter = standPainterOf({ pxPerM: PX_M, max: 128 });

/** The trees, standing and down, each at its root's depth. */
export const drawTrees = (pen: Pen, since: number, seed: number, knocks: Knocks) =>
  painter.trees(grounded(pen), standFor(seed), ROOM_VIEW, since, plantWind(seed), knocks);

/** The apples, hanging, falling, and lying in the grass where they came down; what was `taken`
 *  stays away. */
export const drawApples = (pen: Pen, since: number, seed: number, knocks: Knocks, taken?: Taken) =>
  painter.apples(grounded(pen), standFor(seed), ROOM_VIEW, since, plantWind(seed), knocks, taken);

/** A tree giving way at its foot, or landing, at scene x. */
type Fell = { x: number; kind: "crack" | "crash" };

/** Trees cracking at the foot and going over, and hitting the floor, between two moments of
 *  friday: where, for the sound. */
export const fellCue = (from: number, to: number, seed: number): Fell[] =>
  standFor(seed)
    .fellCues(from, to)
    .map((c) => ({ x: c.p.x * PX_M, kind: c.kind === "crack" ? "crack" : "crash" }));

/** An apple lying in the grass: its knock key, where (scene px), and from when until the snow
 *  has it. */
export type Lying = { key: string; j: number; x: number; y: number; landed: number; gone: number };

/** The apples lying in the grass `since` s into friday. */
export const applesDown = (since: number, seed: number, knocks: Knocks): Lying[] =>
  standFor(seed)
    .applesDown(since, knocks)
    .map(({ key, j, ground, landed, gone }) => {
      const at = ROOM_VIEW.project({ x: ground.x, y: 0, z: ground.z });
      return { key, j, x: at.sx, y: Math.round(at.sy), landed, gone };
    });

/** Where apples came down in the grass between two moments of friday, scene x: for the thud. */
export const appleCue = (from: number, to: number, seed: number, knocks: Knocks): number[] =>
  standFor(seed)
    .appleCues(from, to, knocks)
    .map((c) => c.p.x * PX_M);

/** Where to tap to shake the apple tree, scene px, while it has ripe apples to give: its crown
 *  as far as it is in the room. */
export const appleTreeAt = (since: number, seed: number, knocks: Knocks) => {
  const stand = standFor(seed);
  const tree = stand.fruitTree(since);
  if (!tree || stand.nextShake(since, knocks) === null) return null;
  const clumps = stand
    .planOf(tree, since)
    .clumps.map((c) => ({ ...sceneOf(tree, c), r: c.r * PX_M }))
    .filter((c) => c.y > 0);
  if (!clumps.length) return null;
  const left = Math.min(...clumps.map((c) => c.x - c.r));
  const right = Math.max(...clumps.map((c) => c.x + c.r));
  const top = Math.max(0, Math.min(...clumps.map((c) => c.y - c.r)));
  const bottom = Math.max(...clumps.map((c) => c.y + c.r));
  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(right - left),
    h: Math.round(bottom - top),
  };
};

/** A shake: the next ripe apple comes down now. The key to record in the knocks, or null. */
export const shakeApple = (since: number, seed: number, knocks: Knocks): string | null =>
  standFor(seed).nextShake(since, knocks);

/** Once the first apple of the year is down, the hedgehog has one on its spines. */
export const hedgehogApple = (since: number) => {
  if (since < SEASONS_FROM) return false;
  const year = Math.floor((since - SEASONS_FROM) / (4 * SEASON_S));
  return since > SEASONS_FROM + year * 4 * SEASON_S + 1.1 * SEASON_S;
};
