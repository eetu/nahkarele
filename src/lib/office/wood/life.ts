// What lives in the wood: bugs, a deer, a rabbit, a fox, a hedgehog in the autumn litter,
// butterflies, an owl, fireflies. Each comes and goes by the clock, and is painted where it is:
// on the floor at the depth of its feet, on the wall, on its tree's branch, or in the air.

import { flipped, type Pen, shifted } from "@anarkisti/korpi/paint";
import { drawApple } from "@anarkisti/korpi/plants/paint";

import { prefersReducedMotion } from "$lib/keys";
import { fadedPen, fill, fillFaded } from "$lib/scene/pen";
import { hash, ramp } from "$lib/scene/pixel";
import butterfly from "$lib/sprites/butterfly.json";
import deer from "$lib/sprites/deer.json";
import fox from "$lib/sprites/fox.json";
import hedgehog from "$lib/sprites/hedgehog.json";
import owl from "$lib/sprites/owl.json";
import rabbit from "$lib/sprites/rabbit.json";
import { frameOf, paintSprite, type Sprite } from "$lib/sprites/sprite";

import { at, footAt, Z } from "../depth";
import { FLOOR_Y, G, SCENE_W } from "../engine";
import { type Season, seasonAt, snowCover } from "./seasons";
import { hedgehogApple, type Knocks, movedPx, poseAt, sceneOf, standFor, standing } from "./stand";
import { feltBy, historyOf, springOf, windAt } from "./wind";

const S = {
  rabbit: rabbit as Sprite,
  butterfly: butterfly as Sprite,
  owl: owl as Sprite,
  fox: fox as Sprite,
  hedgehog: hedgehog as Sprite,
  deer: deer as Sprite,
};

/** How high up the wall a climber at `x` can get on its way to `y`: no higher than it stands. */
export type Climb = (x: number, y: number) => number;

/** `pen` with its origin at (x, y), the top-left of a `w` px wide animal; facing left
 *  (`face` -1), mirrored across the animal's middle. */
const facing = (pen: Pen, x: number, y: number, w: number, face: 1 | -1): Pen => {
  const at = shifted(pen, { dx: x, dy: y });
  return face < 0 ? flipped(at, w / 2) : at;
};

/** Things that move in once nobody is looking: ants and ladybugs on the floor, a snail on the
 *  wall. */
const drawCritters = (pen: Pen, since: number, climb: Climb) => {
  const step = Math.floor(since * 8);
  // The floor's small life goes under as the snow comes, and back out as it melts.
  const bare = Math.max(0, 1 - snowCover(since) * 1.6);
  // Ants, a few more every so often, in both directions along the floor.
  const ants = Math.floor(Math.min(14, Math.floor((since - 8) / 5)) * bare);
  for (let i = 0; i < ants; i++) {
    const dir = i % 2 ? -1 : 1;
    const speed = 9 + (i % 4) * 3;
    const span = SCENE_W + 20;
    const along = (((since * speed + i * 53) % span) + span) % span;
    const x = Math.round(dir > 0 ? along - 10 : SCENE_W + 10 - along);
    const y = FLOOR_Y + 3 + ((i * 7) % 24);
    const ant = footAt(pen, y + 1);
    fill(ant, "#15120f", x, y, 3, 1);
    const legs = (step + i) % 2;
    fill(ant, "#15120f", x + legs, y + 1, 1, 1);
    fill(ant, "#15120f", x + 2 - legs, y - 1, 1, 1);
  }
  // Ladybugs, dawdling on the moss.
  for (let i = 0; i < Math.floor(Math.min(4, Math.floor((since - 20) / 12)) * bare); i++) {
    const x = Math.round(40 + i * 70 + Math.sin(since * 0.25 + i * 2) * 26);
    const y = Math.round(FLOOR_Y + 6 + i * 5 + Math.sin(since * 0.4 + i) * 3);
    const bug = footAt(pen, y + 1);
    fill(bug, "#d0342c", x, y, 3, 2);
    fill(bug, "#15120f", x + 1, y, 1, 2);
    fill(bug, "#15120f", x + (Math.sin(since * 0.25 + i * 2) > 0 ? 3 : -1), y, 1, 1);
  }
  // A snail, climbing the wall by the window at snail speed, as far as there is wall to climb.
  if (since > 15) {
    const x = 96;
    const want = Math.round(Math.max(64, FLOOR_Y - 4 - (since - 15) * 0.8));
    const y = Math.max(want, climb(x + 1, want - 1) + 1);
    const snail = at(pen, Z.onWall);
    fill(snail, "#8a6a4a", x, y, 3, 3);
    fill(snail, "#5e4726", x + 1, y + 1, 1, 1);
    fill(snail, "#c8b89a", x - 1, y + 3, 5, 1);
    fill(snail, "#c8b89a", x - 1, y - 1, 1, 1);
  }
};

/** Where the spider's thread hangs from. */
const SPIDER_X = 118;
/** How far the wind pushes the spider aside, per unit of it and px of thread; and how far a
 *  pendulum can go, as a share of its length. */
const SWING = 0.35;
const SWING_MAX = 0.6;
/** How the thread rings once pushed: a pendulum, its pace set by its length, hardly damped. */
const swings = new Map<number, Float64Array>();
const swingOf = (len: number) => {
  let spring = swings.get(len);
  if (!spring) {
    spring = springOf(Math.sqrt(G / len) / (2 * Math.PI), 0.12);
    swings.set(len, spring);
  }
  return spring;
};

/**
 * A spider on `len` px of thread hung from `x0`, `top`, swung by `wind` (its strength `ago`
 * seconds back, + to the right) as a pendulum is: the longer the thread, the slower the swing.
 * Swung aside, it rises on the arc, and the thread bows downwind on its way down to it. `t`
 * works its legs.
 */
export const drawSpider = (
  pen: Pen,
  x0: number,
  top: number,
  len: number,
  t: number,
  wind: (ago: number) => number,
) => {
  const length = Math.max(1, Math.round(len));
  const history = historyOf((_, ago) => wind(ago), x0);
  const reach = SWING_MAX * length;
  const swing = SWING * length * feltBy(swingOf(length), history);
  const dx = Math.max(-reach, Math.min(reach, swing));
  const drop = Math.round(Math.sqrt(length * length - dx * dx));
  const bow = 0.15 * dx;
  for (let ty = 0; ty < drop; ty++) {
    const u = ty / drop;
    fillFaded(pen, "#d8dde2", 0.6, x0 + dx * u + bow * 4 * u * (1 - u), top + ty);
  }
  const x = Math.round(x0 + dx);
  const y = top + drop;
  fill(pen, "#15120f", x - 1, y, 3, 2);
  const kick = Math.floor(t * 8) % 2;
  fill(pen, "#15120f", x - 2, y + kick, 1, 1);
  fill(pen, "#15120f", x + 2, y + 1 - kick, 1, 1);
};

/** How long the room's spider lets its thread out, px, and how far it climbs up and down it. */
const SPIDER_LEN = 34;
const SPIDER_CLIMB = 12;

/** The room's spider, from the ceiling once things have moved in, in friday's wind. */
const drawRoomSpider = (pen: Pen, since: number, seed: number) => {
  if (since <= 25) return;
  const calm = prefersReducedMotion() ? 0.3 : 1;
  const len = SPIDER_LEN + Math.sin(since * 0.6) * SPIDER_CLIMB;
  const wind = (ago: number) => windAt(since - ago, seed, SPIDER_X) * calm;
  drawSpider(at(pen, Z.spider), SPIDER_X, 0, len, since, wind);
};

/**
 * Once the moss is in, a roe buck wanders through every so often: in from one side, two
 * stops to graze, out the other. Each visit's direction and pace come from its index. From
 * mid-autumn to mid-spring it is grey-brown, its antlers in velvet.
 */
const DEER_FROM = 40;
const DEER_CYCLE = 75;
const DEER_SPEED = 16;
/** Scene px the deer covers in one pass through its walk frames. */
const DEER_STRIDE = 22;
/** The row its hooves are on: well out on the floor. */
const DEER_FOOT = FLOOR_Y + 25;

export const drawDeer = (pen: Pen, since: number) => {
  if (since < DEER_FROM) return;
  const n = Math.floor((since - DEER_FROM) / DEER_CYCLE);
  const c = (since - DEER_FROM) % DEER_CYCLE;
  const h = (Math.imul(n + 1, 2654435761) >>> 0) / 4294967296;
  const face: 1 | -1 = h < 0.5 ? 1 : -1;
  const stops = [70 + h * 40, 180 + ((h * 97) % 1) * 50];
  const graze = [5, 7];
  const w = S.deer.w;
  // Walk to each stop, graze there, then walk off: distance along the path by time.
  let t = c;
  let along = 0;
  let grazing = false;
  let prev = -w;
  for (const [i, stop] of stops.entries()) {
    const walk = (stop - prev) / DEER_SPEED;
    if (t < walk) {
      along = prev + t * DEER_SPEED;
      t = -1;
      break;
    }
    t -= walk;
    if (t < graze[i]) {
      along = stop;
      grazing = true;
      t = -1;
      break;
    }
    t -= graze[i];
    prev = stop;
  }
  if (t >= 0) along = prev + t * DEER_SPEED;
  if (along > SCENE_W + w) return;
  const x = face > 0 ? along : SCENE_W - along - w;
  // The walk frames are one stride, stepped by distance so the hooves plant instead of sliding.
  const frame = grazing
    ? frameOf(S.deer, "graze", since * 3)
    : frameOf(S.deer, "walk", (along / DEER_STRIDE) * (S.deer.animations?.walk.length ?? 1));
  const at = facing(footAt(pen, DEER_FOOT), Math.round(x), DEER_FOOT + 1 - S.deer.h, w, face);
  const { k, p } = seasonAt(since);
  const grey = k === 2 || (k === 1 && p > 0.4) || (k === 3 && p < 0.6);
  paintSprite(at, S.deer, 0, 0, { frame, variant: grey ? "winter" : undefined });
};

// --- Butterflies ----------------------------------------------------------------------

const BUTTERFLIES_FROM = 70;
/** Where the vines flower; a butterfly keeps to one of them. */
const FLOWER_X = [58, 104, 218, 262];
const WINGS = [undefined, "white", "blue", "violet"];

const drawButterflies = (pen: Pen, since: number, season: Season, seed: number) => {
  // Summer, and late spring.
  const on = season.k === 0 ? 1 : season.k === 3 ? ramp(season.p, 0.5, 0.8) : 0;
  const n = Math.round(Math.min(5, Math.floor((since - BUTTERFLIES_FROM) / 18)) * on);
  for (let i = 0; i < n; i++) {
    const ax = FLOWER_X[i % FLOWER_X.length];
    const x0 = ax + Math.sin(since * 0.35 + i) * 18 + Math.sin(since * 0.9 + i * 2) * 4;
    const x = x0 + windAt(since, seed, x0) * 10;
    const y = FLOOR_Y - 52 + Math.sin(since * 0.5 + i * 1.7) * 22 + Math.sin(since * 2.1 + i) * 2;
    paintSprite(at(pen, Z.fliers), S.butterfly, x, y, {
      frame: frameOf(S.butterfly, "flap", since * 9 + i),
      variant: WINGS[i % WINGS.length],
    });
  }
};

// --- Passers-by: in from one side, stops, out the other ------------------------------

type Visit = { x: number; still: boolean; done: boolean };

/** Where along its path a visitor is `c` seconds in, at `speed` px/s, in path coordinates. */
const visit = (c: number, w: number, speed: number, stops: number[], waits: number[]): Visit => {
  let t = c;
  let prev = -w;
  for (const [i, stop] of stops.entries()) {
    const walk = (stop - prev) / speed;
    if (t < walk) return { x: prev + t * speed, still: false, done: false };
    t -= walk;
    if (t < waits[i]) return { x: stop, still: true, done: false };
    t -= waits[i];
    prev = stop;
  }
  const x = prev + t * speed;
  return { x, still: false, done: x > SCENE_W + w };
};

// --- The fox --------------------------------------------------------------------------

const FOX_FROM = 480;
const FOX_CYCLE = 140;
const FOX_SPEED = 44;
/** How far a trot cycle carries the fox, px: what a paw on the ground sweeps through its
 *  stance in the sprite, so the paws stay put while it passes over them. */
const FOX_STRIDE = 16.8;
/** The row its paws are on. */
const FOX_FOOT = FLOOR_Y + 5;

/** The fox's place this moment and how far it has come, or null while it is away. */
const foxAt = (since: number): { x: number; along: number; face: 1 | -1 } | null => {
  if (since < FOX_FROM) return null;
  const n = Math.floor((since - FOX_FROM) / FOX_CYCLE);
  const c = (since - FOX_FROM) % FOX_CYCLE;
  const w = S.fox.w;
  const face: 1 | -1 = hash(n, 71) < 0.5 ? 1 : -1;
  const v = visit(c, w, FOX_SPEED, [], []);
  if (v.done) return null;
  return { x: face > 0 ? v.x : SCENE_W - v.x - w, along: v.x, face };
};

const drawFox = (pen: Pen, since: number) => {
  const f = foxAt(since);
  if (!f) return;
  const w = S.fox.w;
  const body = facing(footAt(pen, FOX_FOOT), Math.round(f.x), FOX_FOOT + 1 - S.fox.h, w, f.face);
  const trot = S.fox.animations?.trot.length ?? 1;
  paintSprite(body, S.fox, 0, 0, { frame: frameOf(S.fox, "trot", (f.along / FOX_STRIDE) * trot) });
};

// --- The rabbit -----------------------------------------------------------------------

const RABBIT_FROM = 100;
const RABBIT_CYCLE = 58;
const RABBIT_SPEED = 26;
/** Scene px per hop, and how high it goes. */
const HOP = 9;
const LEAP = 3;
/** Grass tufts worth stopping at. */
const TUFT_X = [72, 138, 214, 252];
/** The row its feet come down on, hopping or not: just out from the wall. */
const RABBIT_FOOT = FLOOR_Y + 3;

const drawRabbit = (pen: Pen, since: number, season: Season) => {
  // It keeps out of the fox's way.
  if (since < RABBIT_FROM || foxAt(since)) return;
  const n = Math.floor((since - RABBIT_FROM) / RABBIT_CYCLE);
  const c = (since - RABBIT_FROM) % RABBIT_CYCLE;
  const h = hash(n, 7);
  const face: 1 | -1 = h < 0.5 ? 1 : -1;
  const w = S.rabbit.w;
  const picks = [TUFT_X[Math.floor(h * 2)], TUFT_X[2 + Math.floor(hash(n, 8) * 2)]];
  const stops = face > 0 ? picks : picks.map((x) => SCENE_W - x).reverse();
  const v = visit(c, w, RABBIT_SPEED, stops, [4, 5]);
  if (v.done) return;
  const x = face > 0 ? v.x : SCENE_W - v.x - w;
  const air = v.still ? 0 : Math.abs(Math.sin((v.x / HOP) * Math.PI)) * LEAP;
  const frame = v.still
    ? frameOf(S.rabbit, "nibble", since * 3)
    : frameOf(S.rabbit, air > 1 ? "hop" : "sit", 0);
  const white = season.k === 2 ? season.p > 0.2 : season.k === 3 && season.p < 0.2;
  const top = RABBIT_FOOT + 1 - S.rabbit.h - air;
  const body = facing(footAt(pen, RABBIT_FOOT), Math.round(x), top, w, face);
  paintSprite(body, S.rabbit, 0, 0, { frame, variant: white ? "winter" : undefined });
};

// --- The hedgehog ---------------------------------------------------------------------

/** The row its feet are on. */
const HEDGEHOG_FOOT = FLOOR_Y + 7;

/** Shuffles about the leaf litter in autumn; asleep somewhere the rest of the year. */
const drawHedgehog = (pen: Pen, since: number, season: Season) => {
  const on =
    season.k === 1 ? ramp(season.p, 0.4, 0.5) : season.k === 2 ? 1 - ramp(season.p, 0, 0.08) : 0;
  if (on <= 0) return;
  const w = S.hedgehog.w;
  const x = 60 + 190 * (0.5 + 0.5 * Math.sin(since * 0.05));
  const face: 1 | -1 = Math.cos(since * 0.05) > 0 ? 1 : -1;
  const into = fadedPen(footAt(pen, HEDGEHOG_FOOT), on);
  const body = facing(into, Math.round(x), HEDGEHOG_FOOT + 1 - S.hedgehog.h, w, face);
  paintSprite(body, S.hedgehog, 0, 0, { frame: frameOf(S.hedgehog, "shuffle", since * 3) });
  if (hedgehogApple(since)) drawApple(body, 4, -1, 2, true, 1);
};

// --- The owl --------------------------------------------------------------------------

const OWL_FROM = 200;
/** The owl keeps to the tree in this slot, on a branch three fifths of the way up; while
 *  that is down or growing, to the tallest that stands. */
const OWL_TREE = 4;
const HOOT_CYCLE = 23;
const HOOT_S = 1.2;
/** How far in front of its tree it sits, m. */
const OWL_DZ = 0.01;

/** The owl's tree: its own while that has a branch in the room to sit on, else the tallest
 *  that has. */
const owlTree = (seed: number, since: number) => {
  const { planOf } = standFor(seed);
  const perched = standing(seed, since).filter((l) => planOf(l, since).perch);
  return (
    perched.find((l) => l.slot === OWL_TREE) ??
    perched.sort((a, b) => planOf(b, since).height - planOf(a, since).height)[0] ??
    null
  );
};

const drawOwl = (pen: Pen, since: number, seed: number, knocks: Knocks) => {
  const tree = since < OWL_FROM ? null : owlTree(seed, since);
  if (!tree) return;
  const branch = standFor(seed).planOf(tree, since).perch;
  if (!branch) return;
  const spot = sceneOf(tree, branch);
  const moved = movedPx(poseAt(seed, tree, since, knocks).perch);
  const perch = { x: Math.round(spot.x + moved.x), y: Math.round(spot.y + moved.y) };
  const c = (since - OWL_FROM) % HOOT_CYCLE;
  const frame =
    c < HOOT_S ? frameOf(S.owl, "hoot", (c / HOOT_S) * 3) : frameOf(S.owl, "perch", since * 0.7);
  // It looks about: the head turns now and then.
  const flip = Math.floor(since / 9) % 3 === 0 ? "h" : undefined;
  // A hair in front of its tree.
  const into = at(pen, tree.z + OWL_DZ);
  paintSprite(into, S.owl, perch.x - 4, perch.y - S.owl.h + 1, { frame, flip });
};

/** What the owl says between two moments of friday, if anything. */
export const owlCue = (from: number, to: number, seed: number): "hoot" | null => {
  if (to <= from || to < OWL_FROM || !owlTree(seed, to)) return null;
  const a = (from - OWL_FROM) % HOOT_CYCLE;
  const b = (to - OWL_FROM) % HOOT_CYCLE;
  return b < a ? "hoot" : null;
};

// --- Fireflies ------------------------------------------------------------------------

const FIREFLIES_FROM = 300;

/** The fireflies showing `since` s into friday: each one's centre, scene px, and how bright
 *  it is, 0..1. */
export const firefliesAt = (
  since: number,
  seed: number,
): { x: number; y: number; glow: number }[] => {
  // A summer thing, lingering into early autumn.
  const season = seasonAt(since);
  const on = season.k === 0 ? 1 : season.k === 1 ? 1 - ramp(season.p, 0, 0.3) : 0;
  if (on <= 0) return [];
  const out: { x: number; y: number; glow: number }[] = [];
  const n = Math.min(12, Math.floor((since - FIREFLIES_FROM) / 10));
  for (let i = 0; i < n; i++) {
    const glow = Math.max(0, Math.sin(since * 1.3 + i * 2.1)) ** 4 * on;
    if (glow < 0.05) continue;
    const x0 = 20 + hash(i, 1) * (SCENE_W - 40) + Math.sin(since * 0.3 + i) * 12;
    const x = Math.round(x0 + windAt(since, seed, x0) * 6);
    const y = Math.round(40 + hash(i, 2) * (FLOOR_Y - 50) + Math.sin(since * 0.45 + i * 3) * 6);
    out.push({ x, y, glow });
  }
  return out;
};

const drawFireflies = (pen: Pen, since: number, seed: number) => {
  const air = at(pen, Z.fireflies);
  for (const { x, y, glow } of firefliesAt(since, seed)) {
    fillFaded(air, "#e8ff7a", glow * 0.35, x - 2, y - 2, 5, 5);
    fillFaded(air, "#f4ffb0", glow, x - 1, y - 1, 2, 2);
  }
};

/** The small life, each at its own depth: bugs on the floor and the snail on the wall, the
 *  spider, the rabbit, the fox, the hedgehog. */
export const drawSmallLife = (
  pen: Pen,
  since: number,
  seed: number,
  climb: Climb = (_x, y) => y,
) => {
  const season = seasonAt(since);
  drawCritters(pen, since, climb);
  drawRoomSpider(pen, since, seed);
  drawRabbit(pen, since, season);
  drawFox(pen, since);
  drawHedgehog(pen, since, season);
};

/** What flies: butterflies, the owl on its branch. */
export const drawFliers = (pen: Pen, since: number, seed: number, knocks: Knocks) => {
  const season = seasonAt(since);
  drawButterflies(pen, since, season, seed);
  drawOwl(pen, since, seed, knocks);
};

/** What gives its own light, for a glowing pen: the fireflies. */
export const drawGlowing = (pen: Pen, since: number, seed: number) =>
  drawFireflies(pen, since, seed);
