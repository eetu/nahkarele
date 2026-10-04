// Friday's stand: always an apple tree and five others, each kind and shape from the seed,
// growing in at the cracks. The first wood comes in fast, five years in a few minutes; from
// then on a year is a year of friday's, and the trees grow as trees do (`growth.ts`), past the
// top of the room in time. A slot keeps a tree for good: one lives its years, dies standing,
// goes over and lies rotting into the floor, and a sapling of another kind comes up in the
// gap (an apple tree's gap grows an apple tree). Their poses in the wind, and the apples.

import { prefersReducedMotion } from "$lib/keys";
import { hash, smooth } from "$lib/scene/pixel";

import { FLOOR_Y, SCENE_H, SCENE_W } from "../engine";
import { type Arch, archOf, fruitAt, lifespanOf, planAt } from "./growth";
import { mossesAt } from "./moss";
import {
  drawPosed,
  drawSheet,
  type Painter,
  type Pose,
  type Pt,
  type Room,
  sheetOf,
} from "./posed";
import { lookAt, SEASON_S, SEASONS_FROM } from "./seasons";
import { poseOf, type TreePose } from "./sway";
import {
  appleOnTree,
  drawApple,
  FRUIT,
  type Look,
  paintRootPlate,
  paintTreeParts,
  type Plan,
  SPECIES,
  type Species,
} from "./trees";
import { windAt } from "./wind";

/** Where every tree is rooted, scene y: a little out from the wall. */
export const ROOT_Y = FLOOR_Y + 3;

/**
 * Where the trees come up, at the cracks, and when; their kind and shape come from the seed.
 * Those clear of the desk stand in `front` of the furniture (their feet are nearer than the
 * slabs' and the desk's); those behind the desk keep behind it, so the desk still reads.
 */
const SLOTS = [
  { x: 62, start: 60, front: true },
  { x: 100, start: 40, front: false },
  { x: 140, start: 95, front: false },
  { x: 190, start: 75, front: false },
  { x: 232, start: 55, front: true },
  { x: 262, start: 120, front: true },
];

/** Whether `life` stands in front of the furniture or behind it. */
export const inLane = (life: Life, front: boolean) => SLOTS[life.slot].front === front;
/** The first wood is this many years old when the year starts turning. */
const GROWIN_Y = 5;
/** A tree is drawn at this many steps a year: about a pixel of growth each. */
const AGE_STEPS = 24;
/** A tree is laid down this many years past its death, for what it grows while it stands dead. */
const LAID_PAST = 1;

const YEAR_S = 4 * SEASON_S;
/** Some trees are crowded out early: this share, at this share of their years. */
const CROWDED = 0.25;
const CROWDED_AT: [number, number] = [0.4, 0.7];
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
  /** Its whole growth, laid down from the seed (`growth.ts`). */
  arch: Arch;
  slot: number;
  /** Which of the slot's trees: 0 the first. */
  n: number;
  born: number;
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

/** When a tree of the `n`th generation born at `born` is `age` years old: the first wood
 *  grows in over its first five years before the year starts turning. */
const timeAt = (n: number, born: number, age: number) =>
  n > 0
    ? born + age * YEAR_S
    : age <= GROWIN_Y
      ? born + (age / GROWIN_Y) * (SEASONS_FROM - born)
      : SEASONS_FROM + (age - GROWIN_Y) * YEAR_S;

/** When `life` is `age` years old, s into friday. */
export const timeOf = (life: Life, age: number) => timeAt(life.n, life.born, age);

/** `life`'s age `since` seconds into friday, years; a dead tree grows no more. */
export const ageAt = (life: Life, since: number) => {
  const t = Math.min(since, life.dies);
  if (t <= life.born) return 0;
  if (life.n > 0) return (t - life.born) / YEAR_S;
  return t < SEASONS_FROM
    ? (GROWIN_Y * (t - life.born)) / (SEASONS_FROM - life.born)
    : GROWIN_Y + (t - SEASONS_FROM) / YEAR_S;
};
/** Age as drawn: in steps, so a tree is painted afresh only now and then. */
export const ageStep = (life: Life, since: number) =>
  Math.floor(ageAt(life, since) * AGE_STEPS) / AGE_STEPS;

/** Tree `n` of `slot`, a `species` coming up at `x` at `born`. */
const lifeOf = (
  seed: number,
  slot: number,
  n: number,
  born: number,
  species: Species,
  x: number,
): Life => {
  const h = (salt: number) => hash(seed, slot + 16 * n, salt);
  // Its kind's years, or fewer if it is crowded out.
  let years = lifespanOf(species, h(21));
  if (h(28) < CROWDED) years *= CROWDED_AT[0] + (CROWDED_AT[1] - CROWDED_AT[0]) * h(29);
  const dies = springAfter(timeAt(n, born, years));
  const arch = archOf(
    Math.floor(h(9) * 2 ** 31),
    { x, y: ROOT_Y },
    species,
    Math.ceil(years) + LAID_PAST,
    0.85 + 0.3 * h(5),
  );
  // Most go over toward the middle of the room, where there is space to lie.
  const inward = x < SCENE_W / 2 ? 1 : -1;
  const side: Life["side"] = h(23) < 0.75 ? inward : inward === 1 ? -1 : 1;
  return {
    arch,
    slot,
    n,
    born,
    dies,
    falls: dies + DEAD_S + SNAG_S * h(22),
    side,
    rots: ROT_S + ROTS_S * h(24),
  };
};

/** The tree that comes up in `life`'s gap once it has gone over. */
const nextOf = (seed: number, life: Life): Life => {
  const h = (salt: number) => hash(seed, life.slot + 16 * life.n, salt);
  const was = life.arch.species;
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
    const first = SLOTS.map((slot, i) => lifeOf(seed, i, 0, slot.start, kinds[i], slot.x));
    // The first wood dies a tree a spring at most: one that would share a spring waits a year.
    const taken = new Set<number>();
    for (const life of [...first].sort((a, b) => a.dies - b.dies)) {
      while (taken.has(life.dies)) {
        life.dies += YEAR_S;
        life.falls += YEAR_S;
      }
      taken.add(life.dies);
    }
    stand = { seed, slots: first.map((life) => [life]) };
  }
  for (const lives of stand.slots) {
    while (lives[lives.length - 1].falls <= since)
      lives.push(nextOf(seed, lives[lives.length - 1]));
  }
  return stand.slots;
};

/** Every tree there has been, or is, by `since`. */
export const livesTo = (seed: number, since: number): Life[] => slotsTo(seed, since).flat();

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

/** The calendar year `since` is in, counted from the first summer of the seasons; -1 before. */
const yearOf = (since: number) =>
  since < SEASONS_FROM ? -1 : Math.floor((since - SEASONS_FROM) / YEAR_S);

const fruited = new WeakMap<Plan, Map<number, Plan>>();

/**
 * `life` as drawn `since` seconds into friday: its plan at its age step, with this calendar
 * year's fruit on it. The fruit is placed from the tree as it was at the year's start, so it
 * hangs still (and keeps its numbers for the knocks) while the tree grows on.
 */
export const planOf = (life: Life, since: number): Plan => {
  const plan = planAt(life.arch, ageStep(life, since));
  const count = FRUIT[life.arch.species] ?? 0;
  const year = yearOf(since);
  if (!count || year < 0) return plan;
  let byYear = fruited.get(plan);
  if (!byYear) fruited.set(plan, (byYear = new Map()));
  let withFruit = byYear.get(year);
  if (!withFruit) {
    const start = Math.max(life.born, SEASONS_FROM + year * YEAR_S);
    const age = ageStep(life, start);
    withFruit = { ...plan, fruit: fruitAt(planAt(life.arch, age), year, count, age) };
    byYear.set(year, withFruit);
  }
  return withFruit;
};

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
  const plan = planOf(life, since);
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
    1,
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

/** The whole of `life` as it stood when it died, the part above the room too: it may fall
 *  into the room. */
const downOf = (life: Life) => planAt(life.arch, ageStep(life, life.dies), false);

/** Where a tree goes over: the edge of its trunk on the side it falls to, on the ground. */
const pivotOf = (plan: Plan, side: number): Pt => {
  // The trunk is the thickest wood there is.
  const trunk = Math.max(1, ...plan.limbs.map((l) => l.w));
  return { x: plan.root.x + side * (trunk / 2 + 0.5), y: plan.root.y };
};

/** Past the room's edges, a falling tree needs no room: nothing there is ever seen. */
const BEYOND = 24;

const rooms = new WeakMap<Plan, Room>();
/** All the room a tree sweeps through as it goes over, and some for its sway, within the
 *  scene. */
const roomOf = (plan: Plan, side: number, about: Pt): Room => {
  const known = rooms.get(plan);
  if (known) return known;
  const { limbs, clumps } = plan;
  const points = [
    ...limbs.flatMap((l) => [l.a, l.b]),
    ...clumps.flatMap((c) => [
      { x: c.x - c.r, y: c.y - c.r },
      { x: c.x + c.r, y: c.y - c.r },
    ]),
  ];
  let [x0, y0, x1] = [Infinity, Infinity, -Infinity];
  for (let k = 0; k <= 8; k++) {
    const turn = (side * Math.PI * k) / 16;
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
  const left = Math.max(-BEYOND, Math.floor(x0 - pad));
  const top = Math.max(-BEYOND, Math.floor(y0 - pad));
  const right = Math.min(SCENE_W + BEYOND, Math.ceil(x1 + pad));
  const room = { x: left, y: top, w: right - left + 1, h: Math.ceil(about.y - top) + 2 };
  rooms.set(plan, room);
  return room;
};

/** Down, a tree lies flat. A slot has one down at a time: the next falls long after. */
const LIE = Math.PI / 2;

/** A tree going over, then lying where it fell, mossing over and rotting into the floor. */
const drawDown = (ctx: CanvasRenderingContext2D, life: Life, since: number, seed: number) => {
  const t = since - life.falls;
  const plan = downOf(life);
  const about = pivotOf(plan, life.side);
  const paint: Painter = (rec, part) => {
    paintTreeParts(rec, plan, 1, DOWN, part);
    part({ kind: "still" });
    paintRootPlate(rec, plan);
  };
  const key = `${seed}|${life.n}|down`;
  const room = roomOf(plan, life.side, about);
  const over = { about, sunk: 0, moss: 0, gone: 0, mosses: mossesAt(since) };
  if (t < FALL_S) {
    // Slowly at first, then all at once; the wind has it until it lands.
    const u = t / FALL_S;
    const calm = prefersReducedMotion() ? 0.3 : 1;
    const pose = poseOf(plan, 1, DOWN, since, (x, ago) => windAt(since - ago, seed, x) * calm);
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
  drawPosed(ctx, `down${life.slot}`, key, paint, { ...restOf(plan), over: lying, still }, room);
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
    if (inLane(life, front)) drawDown(ctx, life, since, seed);
  }
  // The lane's standing trees share one sheet: one blit for all of them.
  const sheet = sheetOf(`trees${front}`, SCENE_W, SCENE_H);
  for (const life of standing(seed, since)) {
    if (!inLane(life, front)) continue;
    const plan = planOf(life, since);
    const look = lookOf(life, since);
    const dead = look.dead ? Math.ceil(look.dead * 12) : 0;
    const when = `${ageStep(life, since)}|${yearOf(since)}`;
    const key = `${seed}|${life.n}|${when}|${look.k}|${Math.round(look.p * 24)}|${dead}`;
    const paint: Painter = (rec, part) => paintTreeParts(rec, plan, 1, look, part);
    drawPosed(
      ctx,
      `tree${life.slot}`,
      key,
      paint,
      poseAt(life, since, seed, knocks),
      undefined,
      sheet,
    );
  }
  drawSheet(ctx, sheet);
};

/** A tree giving way at its foot, or landing, at scene x. */
type Fell = { x: number; kind: "crack" | "crash" };

/** Trees cracking at the foot and going over, and hitting the floor, between two moments of
 *  friday: where, for the sound. */
export const fellCue = (from: number, to: number, seed: number): Fell[] => {
  if (to <= from) return [];
  return slotsTo(seed, to).flatMap((lives) =>
    lives.flatMap((l): Fell[] => {
      const { root } = l.arch;
      if (l.falls > from && l.falls <= to) return [{ x: root.x, kind: "crack" }];
      const lands = l.falls + FALL_S;
      if (lands > from && lands <= to) {
        // Where the crown comes down, as far as the room goes.
        const reach = root.x + l.side * downOf(l).height * 0.6;
        return [{ x: Math.max(0, Math.min(SCENE_W, reach)), kind: "crash" }];
      }
      return [];
    }),
  );
};

/** Apples knocked down early by a shake, by `year:apple`, at the moment of the shake. */
export type Knocks = Record<string, number>;

const APPLE_FALL_S = 0.6;

const autumnOfYear = (y: number) => SEASONS_FROM + y * YEAR_S + SEASON_S;

/** When apple `j` lets go: some time in the autumn, or when a shake knocked it down. */
const dropAt = (y: number, j: number, knocks: Knocks) =>
  Math.min(
    autumnOfYear(y) + (0.05 + 0.75 * hash(j, y, 61)) * SEASON_S,
    knocks[`${y}:${j}`] ?? Infinity,
  );

/** By then the fallen apples are under the snow. */
const buriedAt = (y: number) => SEASONS_FROM + y * YEAR_S + 2.3 * SEASON_S;

/** The apple tree that bears at `since`: alive, and old enough to. */
const appleTree = (seed: number, since: number) =>
  standing(seed, since).find(
    (l) => l.arch.species === "apple" && since < l.dies && ageAt(l, since) >= 3,
  ) ?? null;

/** Where apple `j` comes to rest, in the grass below where it hung. */
const groundOf = (hang: { x: number }, y: number, j: number) => ({
  x: Math.min(SCENE_W - 3, Math.max(2, hang.x + (hash(j, y, 62) - 0.5) * 10)),
  y: FLOOR_Y + 2 + Math.floor(hash(j, y, 63) * 16),
});

/** The apples, hanging, falling, and lying in the grass. Drawn with the trees, behind the desk. */
/** When each fallen apple was carried off, by `year:apple`, or nothing. */
export type Taken = (key: string) => number | undefined;

export const drawApples = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  knocks: Knocks,
  front: boolean,
  taken: Taken = () => undefined,
) => {
  const tree = appleTree(seed, since);
  const y = yearOf(since);
  if (!tree || y < 0 || !inLane(tree, front)) return;
  const look = lookAt(since);
  const on = appleOnTree(look);
  const moved = poseAt(tree, since, seed, knocks).fruit;
  planOf(tree, since).fruit.forEach((rest, j) => {
    const hang = { x: Math.round(rest.x + moved[j].x), y: Math.round(rest.y + moved[j].y) };
    const drop = dropAt(y, j, knocks);
    if (since < drop) {
      if (on) drawApple(ctx, hang.x, hang.y, on.size, on.ripe, j);
      return;
    }
    if (since >= buriedAt(y) || since >= (taken(`${y}:${j}`) ?? Infinity)) return;
    const ground = groundOf(rest, y, j);
    const u = Math.min(1, (since - drop) / APPLE_FALL_S);
    const fx = hang.x + (ground.x - hang.x) * u;
    const fy = hang.y + (ground.y - hang.y) * u * u;
    drawApple(ctx, fx, fy, 2, true, j);
  });
};

/** An apple lying in the grass: its knock key, where, and from when until the snow has it. */
export type Lying = { key: string; j: number; x: number; y: number; landed: number; gone: number };

/** The apples lying in the grass `since` s into friday. */
export const applesDown = (since: number, seed: number, knocks: Knocks): Lying[] => {
  const tree = appleTree(seed, since);
  const y = yearOf(since);
  if (!tree || y < 0) return [];
  return planOf(tree, since).fruit.flatMap((rest, j) => {
    const landed = dropAt(y, j, knocks) + APPLE_FALL_S;
    const gone = buriedAt(y);
    if (since < landed || since >= gone) return [];
    return [{ key: `${y}:${j}`, j, ...groundOf(rest, y, j), landed, gone }];
  });
};

/** Where apples came down in the grass between two moments of friday: for the thud. */
export const appleCue = (from: number, to: number, seed: number, knocks: Knocks): number[] => {
  const tree = appleTree(seed, to);
  const y = yearOf(to);
  if (!tree || y < 0 || to <= from) return [];
  return planOf(tree, to).fruit.flatMap((f, j) => {
    const landed = dropAt(y, j, knocks) + APPLE_FALL_S;
    return landed > from && landed <= to ? [groundOf(f, y, j).x] : [];
  });
};

/** The ripe apples still hanging, soonest to fall first. */
const ripeHanging = (since: number, seed: number, knocks: Knocks) => {
  const tree = appleTree(seed, since);
  const y = yearOf(since);
  if (!tree || y < 0 || !appleOnTree(lookAt(since))?.ripe) return [];
  return planOf(tree, since)
    .fruit.map((_, j) => ({ j, drop: dropAt(y, j, knocks) }))
    .filter((a) => a.drop > since)
    .sort((a, b) => a.drop - b.drop)
    .map((a) => `${y}:${a.j}`);
};

/** Where to tap to shake the apple tree, while it has ripe apples to give: its crown. */
export const appleTreeAt = (since: number, seed: number, knocks: Knocks) => {
  const tree = appleTree(seed, since);
  if (!tree || !ripeHanging(since, seed, knocks).length) return null;
  // The crown as far as it is in the room.
  const clumps = planOf(tree, since).clumps.filter((c) => c.y > 0);
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
  ripeHanging(since, seed, knocks)[0] ?? null;

/** Once the first apple of the year is down, the hedgehog has one on its spines. */
export const hedgehogApple = (since: number) => {
  const y = yearOf(since);
  return y >= 0 && since > autumnOfYear(y) + 0.1 * SEASON_S;
};
