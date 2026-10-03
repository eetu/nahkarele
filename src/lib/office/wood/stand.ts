// Friday's stand: always an apple tree and five others, each kind and shape from the seed,
// growing in at the cracks. A slot keeps a tree for good: one lives its years, dies standing,
// goes over and lies rotting into the floor, and a sapling of another kind comes up in the
// gap (an apple tree's gap grows an apple tree). Their poses in the wind, and the apples.

import { prefersReducedMotion } from "$lib/keys";
import { hash, smooth } from "$lib/scene/pixel";

import { FLOOR_Y, SCENE_W } from "../engine";
import { mossesAt } from "./moss";
import { drawPosed, type Painter, type Pose, type Pt, type Room } from "./posed";
import { lookAt, SEASON_S, SEASONS_FROM } from "./seasons";
import { poseOf, type TreePose } from "./sway";
import {
  appleOnTree,
  drawApple,
  grownAt,
  type Look,
  paintRootPlate,
  paintTreeParts,
  type Plan,
  planTree,
  SPECIES,
  type Species,
} from "./trees";
import { windAt } from "./wind";

/**
 * Where the trees come up, at the cracks, and when; their kind and shape come from the seed.
 * Those clear of the desk stand in `front` of the furniture (their feet are nearer than the
 * slabs' and the desk's); those behind the desk keep behind it, so the desk still reads.
 */
const SLOTS = [
  { x: 62, h: 134, start: 60, front: true },
  { x: 100, h: 142, start: 40, front: false },
  { x: 140, h: 138, start: 95, front: false },
  { x: 190, h: 124, start: 75, front: false },
  { x: 232, h: 114, start: 55, front: true },
  { x: 262, h: 98, start: 120, front: true },
];

/** Whether `life` stands in front of the furniture or behind it. */
const inLane = (life: Life, front: boolean) => SLOTS[life.slot].front === front;
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
/** Seconds from sapling to full crown: the first wood grows in fast, what comes after slowly. */
const GROW_S = 180;
const REGROW_S = 900;
/** Growth is drawn in this many steps; a tree is re-baked when it reaches the next one. */
const GROW_STEPS = 40;

const YEAR_S = 4 * SEASON_S;
/** A tree lives this long at least, s, and up to `LIVES_S` more. */
const LIFE_S = 1500;
const LIVES_S = 1500;
/** Dead, it stands this long at least, s, and up to `SNAG_S` more, dropping its twigs. */
const DEAD_S = 300;
const SNAG_S = 600;
/** Going over takes this long, s; it bounces once where it lands. */
const FALL_S = 2.4;
const BOUNCE_S = 0.4;
/** Down, it rots away in this long at least, s, and up to `ROTS_S` more. */
const ROT_S = 900;
const ROTS_S = 600;
/** The gap stands empty this long at least, s, and up to `GAP_S` more. */
const EMPTY_S = 60;
const GAP_S = 240;

/** One tree of a slot, seed to dust. Times are seconds into friday. */
export type Life = {
  plan: Plan;
  slot: number;
  /** Which of the slot's trees: 0 the first. */
  n: number;
  born: number;
  /** Seconds from sapling to full crown. */
  grows: number;
  /** Its last spring: it does not come into leaf, and stands dead from then. */
  dies: number;
  /** When it goes over, and which way (+1 to the right). */
  falls: number;
  side: 1 | -1;
  /** Seconds it lies before nothing is left of it. */
  rots: number;
};

/** The first spring at or after `t`: a tree dies over a winter and stays bare. */
const springAfter = (t: number) => {
  const first = SEASONS_FROM + 3 * SEASON_S;
  return first + Math.max(0, Math.ceil((t - first) / YEAR_S)) * YEAR_S;
};

/** `items` in an order the seed picks. */
export const shuffled = <T>(items: T[], seed: number, salt: number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(hash(seed, i, salt) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Tree `n` of `slot`, a `species` coming up at `x` at `born`. */
const lifeOf = (
  seed: number,
  slot: number,
  n: number,
  born: number,
  species: Species,
  x: number,
  order = 0,
): Life => {
  const h = (salt: number) => hash(seed, slot + 16 * n, salt);
  const plan = planTree(
    Math.floor(h(9) * 2 ** 31),
    { x, y: FLOOR_Y + 3 },
    SLOTS[slot].h * SIZE[species] * (0.9 + 0.2 * h(5)),
    species,
  );
  const grows = n === 0 ? GROW_S : REGROW_S * (0.8 + 0.4 * h(20));
  // The first wood dies a tree a spring, in an order of the seed's; after that, as it may.
  const dies = springAfter(born + LIFE_S + (n === 0 ? YEAR_S * order : LIVES_S * h(21)));
  // Most go over toward the middle of the room, where there is space to lie.
  const inward = x < SCENE_W / 2 ? 1 : -1;
  const side: Life["side"] = h(23) < 0.75 ? inward : inward === 1 ? -1 : 1;
  return {
    plan,
    slot,
    n,
    born,
    grows,
    dies,
    falls: dies + DEAD_S + SNAG_S * h(22),
    side,
    rots: ROT_S + ROTS_S * h(24),
  };
};

/** The tree that comes up in `life`'s gap once it has gone over. */
const nextOf = (seed: number, life: Life): Life => {
  const h = (salt: number) => hash(seed, life.slot + 16 * life.n, salt);
  const was = life.plan.species;
  const others = SPECIES.filter((k) => k !== "apple" && k !== was);
  return lifeOf(
    seed,
    life.slot,
    life.n + 1,
    life.falls + FALL_S + EMPTY_S + GAP_S * h(25),
    was === "apple" ? "apple" : others[Math.floor(h(27) * others.length)],
    SLOTS[life.slot].x + Math.round((h(26) - 0.5) * 14),
  );
};

let stand: { seed: number; slots: Life[][] } | null = null;

/** Each slot's trees, from the first up to the one that stands (or will) after `since`. */
const slotsTo = (seed: number, since: number): Life[][] => {
  if (stand?.seed !== seed) {
    const rest = SPECIES.filter((k) => k !== "apple");
    const others = shuffled<Species>(rest, seed, 2).slice(0, SLOTS.length - 1);
    const kinds = shuffled<Species>(["apple", ...others], seed, 3);
    const order = shuffled(
      SLOTS.map((_, i) => i),
      seed,
      4,
    );
    stand = {
      seed,
      slots: SLOTS.map((slot, i) => [
        lifeOf(seed, i, 0, slot.start, kinds[i], slot.x, order.indexOf(i)),
      ]),
    };
  }
  for (const lives of stand.slots) {
    while (lives[lives.length - 1].falls <= since)
      lives.push(nextOf(seed, lives[lives.length - 1]));
  }
  return stand.slots;
};

/** What stands `since` seconds into friday, alive or dead, at most one a slot, left to right. */
export const standing = (seed: number, since: number): Life[] =>
  slotsTo(seed, since).flatMap((lives) =>
    lives.filter((l) => l.born < since && since < l.falls).slice(-1),
  );

/** What is going over or lying where it fell. */
export const fallen = (seed: number, since: number): Life[] =>
  slotsTo(seed, since).flatMap((lives) =>
    lives.filter((l) => l.falls <= since && since < l.falls + FALL_S + l.rots),
  );

/** How grown `life` is, 0..1; a dead tree grows no more. */
export const growth = (life: Life, since: number) =>
  smooth((Math.min(since, life.dies) - life.born) / life.grows);
/** Growth as drawn: in steps, so a tree is painted afresh only now and then. */
export const grownStep = (life: Life, since: number) =>
  Math.round(growth(life, since) * GROW_STEPS) / GROW_STEPS;

/** How long dead, 0 alive to 1 about to go over. */
const deadness = (life: Life, since: number) =>
  since < life.dies ? 0 : Math.min(1, (since - life.dies) / (life.falls - life.dies));

/** How `life` looks at `since`: the year's look, dead if it is. */
const lookOf = (life: Life, since: number): Look => {
  const dead = deadness(life, since);
  return dead > 0 ? { ...lookAt(since), dead } : lookAt(since);
};

/** The last pose of each tree, so the apples and the owl ride the branches the frame drew. */
const poses = new Map<string, { since: number; pose: TreePose }>();

/** How long a tap pushes the apple tree, s. */
const SHAKE_S = 0.6;

/** `life` in friday's wind at the growth step it is drawn at; a tap shakes the apple tree. */
export const poseAt = (life: Life, since: number, seed: number, knocks: Knocks): TreePose => {
  const id = `${life.slot}:${life.n}`;
  const hit = poses.get(id);
  if (hit && hit.since === since) return hit.pose;
  const { plan } = life;
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
    grownStep(life, since),
    lookOf(life, since),
    since,
    (x, ago) => (windAt(since - ago, seed, x) + shake(since - ago)) * calm,
  );
  poses.set(id, { since, pose });
  return pose;
};

/** Down, a tree is dead wood: no leaves, no twigs, no snow (the fall shook it off). */
const DOWN: Look = { k: 0, p: 0, leaves: 0, snow: 0, dead: 1 };

const rests = new WeakMap<Plan, Pose>();
/** `plan` as it lies: nothing moved. */
const restOf = (plan: Plan): Pose => {
  const known = rests.get(plan);
  if (known) return known;
  const none = (n: number) => Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  const rest = {
    a: none(plan.limbs.length),
    b: none(plan.limbs.length),
    clumps: none(plan.clumps.length),
    fruit: none(plan.fruit.length),
  };
  rests.set(plan, rest);
  return rest;
};

/** Where a tree goes over: the edge of its trunk on the side it falls to, on the ground. */
const pivotOf = ({ plan, side }: Life): Pt => {
  // The trunk is the thickest wood there is.
  const trunk = Math.max(1, ...plan.limbs.map((l) => l.w));
  return { x: plan.root.x + side * (trunk / 2 + 0.5), y: plan.root.y };
};

const rooms = new WeakMap<Plan, Room>();
/** All the room a tree sweeps through as it goes over, and some for its sway. */
const roomOf = (life: Life, about: Pt): Room => {
  const known = rooms.get(life.plan);
  if (known) return known;
  const { limbs, clumps } = life.plan;
  const points = [
    ...limbs.flatMap((l) => [l.a, l.b]),
    ...clumps.flatMap((c) => [
      { x: c.x - c.r, y: c.y - c.r },
      { x: c.x + c.r, y: c.y - c.r },
    ]),
  ];
  let [x0, y0, x1] = [Infinity, Infinity, -Infinity];
  for (let k = 0; k <= 8; k++) {
    const turn = (life.side * Math.PI * k) / 16;
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    for (const q of points) {
      const dx = q.x - about.x;
      const dy = q.y - about.y;
      const x = about.x + dx * c - dy * s;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, about.y + dx * s + dy * c);
    }
  }
  const pad = 12;
  const room = {
    x: Math.floor(x0 - pad),
    y: Math.floor(y0 - pad),
    w: Math.ceil(x1 - x0 + 2 * pad) + 1,
    h: Math.ceil(about.y - y0 + pad) + 2,
  };
  rooms.set(life.plan, room);
  return room;
};

/** Down, a tree lies flat. A slot has one down at a time: the next falls long after. */
const LIE = Math.PI / 2;

/** A tree going over, then lying where it fell, mossing over and rotting into the floor. */
const drawDown = (
  ctx: CanvasRenderingContext2D,
  life: Life,
  since: number,
  seed: number,
  knocks: Knocks,
) => {
  const t = since - life.falls;
  const about = pivotOf(life);
  const step = grownStep(life, life.dies);
  const paint: Painter = (rec, part) => {
    paintTreeParts(rec, life.plan, step, DOWN, part);
    part({ kind: "still" });
    paintRootPlate(rec, life.plan);
  };
  const key = `${seed}|${life.n}|${step}`;
  const room = roomOf(life, about);
  const over = { about, sunk: 0, moss: 0, gone: 0, mosses: mossesAt(since) };
  if (t < FALL_S) {
    // Slowly at first, then all at once; the wind has it until it lands.
    const u = t / FALL_S;
    const pose = poseAt(life, since, seed, knocks);
    drawPosed(
      ctx,
      `down${life.slot}`,
      key,
      paint,
      { ...pose, over: { ...over, angle: life.side * LIE * u * u } },
      room,
    );
    return;
  }
  const v = (t - FALL_S) / BOUNCE_S;
  const bounce = v < 1 ? 0.06 * Math.sin(Math.PI * v) : 0;
  const age = t - FALL_S;
  const rot = age / life.rots;
  const lying = {
    ...over,
    angle: life.side * (LIE - bounce),
    // Moss has it first; then what sticks up crumbles, and the trunk sinks as it goes.
    moss: 1.1 * smooth((age - 10) / (life.rots * 0.45)),
    gone: 1.05 * smooth((rot - 0.25) / 0.75),
    sunk: Math.round(3 * smooth((rot - 0.4) / 0.6)),
  };
  const still =
    v < 1
      ? undefined
      : `${lying.sunk}|${Math.round(lying.moss * 40)}|${Math.round(lying.gone * 40)}|${lying.mosses.join()}`;
  drawPosed(
    ctx,
    `down${life.slot}`,
    key,
    paint,
    { ...restOf(life.plan), over: lying, still },
    room,
  );
};

/** The trees in one lane, behind the furniture or in `front` of it. */
export const drawTrees = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  knocks: Knocks,
  front: boolean,
) => {
  // What has come down lies behind what stands.
  for (const life of fallen(seed, since)) {
    if (inLane(life, front)) drawDown(ctx, life, since, seed, knocks);
  }
  for (const life of standing(seed, since)) {
    if (!inLane(life, front)) continue;
    const step = grownStep(life, since);
    const look = lookOf(life, since);
    const dead = look.dead ? Math.ceil(look.dead * 12) : 0;
    const key = `${seed}|${life.n}|${step}|${look.k}|${Math.round(look.p * 24)}|${dead}`;
    const paint: Painter = (rec, part) => paintTreeParts(rec, life.plan, step, look, part);
    drawPosed(ctx, `tree${life.slot}`, key, paint, poseAt(life, since, seed, knocks));
  }
};

/** A tree giving way at its foot, or landing, at scene x. */
type Fell = { x: number; kind: "crack" | "crash" };

/** Trees cracking at the foot and going over, and hitting the floor, between two moments of
 *  friday: where, for the sound. */
export const fellCue = (from: number, to: number, seed: number): Fell[] => {
  if (to <= from) return [];
  return slotsTo(seed, to).flatMap((lives) =>
    lives.flatMap((l): Fell[] => {
      const { root, height } = l.plan;
      if (l.falls > from && l.falls <= to) return [{ x: root.x, kind: "crack" }];
      const lands = l.falls + FALL_S;
      if (lands > from && lands <= to) {
        return [{ x: root.x + l.side * height * 0.6, kind: "crash" }];
      }
      return [];
    }),
  );
};

/** Apples knocked down early by a shake, by `year:apple`, at the moment of the shake. */
export type Knocks = Record<string, number>;

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

/** The apple tree that bears at `since`: alive, and grown enough to. */
const appleTree = (seed: number, since: number) =>
  standing(seed, since).find(
    (l) => l.plan.species === "apple" && since < l.dies && growth(l, since) >= 0.9,
  ) ?? null;

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
  front: boolean,
) => {
  const tree = appleTree(seed, since);
  const y = yearOf(since);
  if (!tree || y < 0 || !inLane(tree, front)) return;
  const look = lookAt(since);
  const on = appleOnTree(look);
  const at = grownAt(tree.plan, grownStep(tree, since));
  const moved = poseAt(tree, since, seed, knocks).fruit;
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
  const tree = appleTree(seed, to);
  const y = yearOf(to);
  if (!tree || y < 0 || to <= from) return [];
  const at = grownAt(tree.plan, growth(tree, to));
  return tree.plan.fruit.flatMap((f, j) => {
    const landed = dropAt(y, j, knocks) + APPLE_FALL_S;
    return landed > from && landed <= to ? [groundOf(at(f), y, j).x] : [];
  });
};

/** The ripe apples still hanging, soonest to fall first. */
const ripeHanging = (since: number, seed: number, knocks: Knocks) => {
  const tree = appleTree(seed, since);
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
  const tree = appleTree(seed, since);
  if (!tree || !ripeHanging(since, seed, knocks).length) return null;
  const at = grownAt(tree.plan, growth(tree, since));
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
