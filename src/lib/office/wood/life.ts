// What lives in the wood: bugs, a deer, a rabbit, a fox, a hedgehog in the autumn litter,
// butterflies, an owl, fireflies. Each comes and goes by the clock.

import { hash, ramp, rect } from "$lib/scene/pixel";
import butterfly from "$lib/sprites/butterfly.json";
import deer from "$lib/sprites/deer.json";
import fox from "$lib/sprites/fox.json";
import hedgehog from "$lib/sprites/hedgehog.json";
import owl from "$lib/sprites/owl.json";
import rabbit from "$lib/sprites/rabbit.json";
import { drawSprite, frameOf, type Sprite } from "$lib/sprites/sprite";

import { FLOOR_Y, SCENE_W } from "../engine";
import { type Season, seasonAt, snowCover } from "./seasons";
import { grownStep, growth, hedgehogApple, type Knocks, poseAt, standing } from "./stand";
import { drawApple, perchOf } from "./trees";
import { windAt } from "./wind";

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

/** Things that move in once nobody is looking: ants, ladybugs, a snail, a spider. */
const drawCritters = (ctx: CanvasRenderingContext2D, since: number, climb: Climb) => {
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
    rect(ctx, "#15120f", x, y, 3, 1);
    const legs = (step + i) % 2;
    rect(ctx, "#15120f", x + legs, y + 1, 1, 1);
    rect(ctx, "#15120f", x + 2 - legs, y - 1, 1, 1);
  }
  // Ladybugs, dawdling on the moss.
  for (let i = 0; i < Math.floor(Math.min(4, Math.floor((since - 20) / 12)) * bare); i++) {
    const x = Math.round(40 + i * 70 + Math.sin(since * 0.25 + i * 2) * 26);
    const y = Math.round(FLOOR_Y + 6 + i * 5 + Math.sin(since * 0.4 + i) * 3);
    rect(ctx, "#d0342c", x, y, 3, 2);
    rect(ctx, "#15120f", x + 1, y, 1, 2);
    rect(ctx, "#15120f", x + (Math.sin(since * 0.25 + i * 2) > 0 ? 3 : -1), y, 1, 1);
  }
  // A snail, climbing the wall by the window at snail speed, as far as there is wall to climb.
  if (since > 15) {
    const x = 96;
    const want = Math.round(Math.max(64, FLOOR_Y - 4 - (since - 15) * 0.8));
    const y = Math.max(want, climb(x + 1, want - 1) + 1);
    rect(ctx, "#8a6a4a", x, y, 3, 3);
    rect(ctx, "#5e4726", x + 1, y + 1, 1, 1);
    rect(ctx, "#c8b89a", x - 1, y + 3, 5, 1);
    rect(ctx, "#c8b89a", x - 1, y - 1, 1, 1);
  }
  // A spider on its thread from the ceiling, bobbing.
  if (since > 25) {
    const x = 118;
    const y = Math.round(34 + Math.sin(since * 0.6) * 12);
    ctx.globalAlpha = 0.6;
    rect(ctx, "#d8dde2", x, 0, 1, y);
    ctx.globalAlpha = 1;
    rect(ctx, "#15120f", x - 1, y, 3, 2);
    const kick = step % 2;
    rect(ctx, "#15120f", x - 2, y + kick, 1, 1);
    rect(ctx, "#15120f", x + 2, y + 1 - kick, 1, 1);
  }
};

/**
 * Once the moss is in, a deer wanders through every so often: in from one side, two
 * stops to graze, out the other. Each visit's direction and pace come from its index.
 */
const DEER_FROM = 40;
const DEER_CYCLE = 75;
const DEER_SPEED = 16;
/** Scene px the deer covers in one pass through its walk frames. */
const DEER_STRIDE = 22;

export const drawDeer = (ctx: CanvasRenderingContext2D, since: number) => {
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
  ctx.save();
  ctx.translate(Math.round(x) + (face < 0 ? w : 0), FLOOR_Y + 26 - S.deer.h);
  ctx.scale(face, 1);
  drawSprite(ctx, S.deer, 0, 0, { frame });
  ctx.restore();
};

// --- Butterflies ----------------------------------------------------------------------

const BUTTERFLIES_FROM = 70;
/** Where the vines flower; a butterfly keeps to one of them. */
const FLOWER_X = [58, 104, 218, 262];
const WINGS = [undefined, "white", "blue", "violet"];

const drawButterflies = (
  ctx: CanvasRenderingContext2D,
  since: number,
  season: Season,
  seed: number,
) => {
  // Summer, and late spring.
  const on = season.k === 0 ? 1 : season.k === 3 ? ramp(season.p, 0.5, 0.8) : 0;
  const n = Math.round(Math.min(5, Math.floor((since - BUTTERFLIES_FROM) / 18)) * on);
  for (let i = 0; i < n; i++) {
    const ax = FLOWER_X[i % FLOWER_X.length];
    const x0 = ax + Math.sin(since * 0.35 + i) * 18 + Math.sin(since * 0.9 + i * 2) * 4;
    const x = x0 + windAt(since, seed, x0) * 10;
    const y = FLOOR_Y - 52 + Math.sin(since * 0.5 + i * 1.7) * 22 + Math.sin(since * 2.1 + i) * 2;
    drawSprite(ctx, S.butterfly, x, y, {
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

/** The fox's place this moment, or null while it is away. */
const foxAt = (since: number): { x: number; face: 1 | -1 } | null => {
  if (since < FOX_FROM) return null;
  const n = Math.floor((since - FOX_FROM) / FOX_CYCLE);
  const c = (since - FOX_FROM) % FOX_CYCLE;
  const w = S.fox.w;
  const face: 1 | -1 = hash(n, 71) < 0.5 ? 1 : -1;
  const v = visit(c, w, FOX_SPEED, [], []);
  if (v.done) return null;
  return { x: face > 0 ? v.x : SCENE_W - v.x - w, face };
};

const drawFox = (ctx: CanvasRenderingContext2D, since: number) => {
  const f = foxAt(since);
  if (!f) return;
  const w = S.fox.w;
  ctx.save();
  ctx.translate(Math.round(f.x) + (f.face < 0 ? w : 0), FLOOR_Y + 6 - S.fox.h);
  ctx.scale(f.face, 1);
  drawSprite(ctx, S.fox, 0, 0, { frame: frameOf(S.fox, "trot", since * 8) });
  ctx.restore();
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

const drawRabbit = (ctx: CanvasRenderingContext2D, since: number, season: Season) => {
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
  ctx.save();
  ctx.translate(Math.round(x) + (face < 0 ? w : 0), FLOOR_Y + 4 - S.rabbit.h - air);
  ctx.scale(face, 1);
  drawSprite(ctx, S.rabbit, 0, 0, { frame, variant: white ? "winter" : undefined });
  ctx.restore();
};

// --- The hedgehog ---------------------------------------------------------------------

/** Shuffles about the leaf litter in autumn; asleep somewhere the rest of the year. */
const drawHedgehog = (ctx: CanvasRenderingContext2D, since: number, season: Season) => {
  const on =
    season.k === 1 ? ramp(season.p, 0.4, 0.5) : season.k === 2 ? 1 - ramp(season.p, 0, 0.08) : 0;
  if (on <= 0) return;
  const w = S.hedgehog.w;
  const x = 60 + 190 * (0.5 + 0.5 * Math.sin(since * 0.05));
  const face: 1 | -1 = Math.cos(since * 0.05) > 0 ? 1 : -1;
  ctx.save();
  ctx.globalAlpha = on;
  ctx.translate(Math.round(x) + (face < 0 ? w : 0), FLOOR_Y + 8 - S.hedgehog.h);
  ctx.scale(face, 1);
  drawSprite(ctx, S.hedgehog, 0, 0, { frame: frameOf(S.hedgehog, "shuffle", since * 3) });
  if (hedgehogApple(since)) drawApple(ctx, 4, -1, 2, true, 1);
  ctx.restore();
};

// --- The owl --------------------------------------------------------------------------

const OWL_FROM = 200;
/** The owl keeps to the tree in this slot, on a branch three fifths of the way up; while
 *  that is down or growing, to the tallest that stands. */
const OWL_TREE = 4;
const HOOT_CYCLE = 23;
const HOOT_S = 1.2;

const owlTree = (seed: number, since: number) => {
  const grown = standing(seed, since).filter((l) => growth(l, since) >= 0.8);
  return (
    grown.find((l) => l.slot === OWL_TREE) ??
    grown.sort((a, b) => b.plan.height - a.plan.height)[0] ??
    null
  );
};

const drawOwl = (ctx: CanvasRenderingContext2D, since: number, seed: number, knocks: Knocks) => {
  const tree = since < OWL_FROM ? null : owlTree(seed, since);
  if (!tree) return;
  const branch = perchOf(tree.plan, grownStep(tree, since));
  const moved = poseAt(tree, since, seed, knocks).perch;
  const perch = { x: Math.round(branch.x + moved.x), y: Math.round(branch.y + moved.y) };
  const c = (since - OWL_FROM) % HOOT_CYCLE;
  const frame =
    c < HOOT_S ? frameOf(S.owl, "hoot", (c / HOOT_S) * 3) : frameOf(S.owl, "perch", since * 0.7);
  // It looks about: the head turns now and then.
  const flip = Math.floor(since / 9) % 3 === 0 ? "h" : undefined;
  drawSprite(ctx, S.owl, perch.x - 4, perch.y - S.owl.h + 1, { frame, flip });
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

const drawFireflies = (
  ctx: CanvasRenderingContext2D,
  since: number,
  season: Season,
  seed: number,
) => {
  // A summer thing, lingering into early autumn.
  const on = season.k === 0 ? 1 : season.k === 1 ? 1 - ramp(season.p, 0, 0.3) : 0;
  if (on <= 0) return;
  const n = Math.min(12, Math.floor((since - FIREFLIES_FROM) / 10));
  for (let i = 0; i < n; i++) {
    const glow = Math.max(0, Math.sin(since * 1.3 + i * 2.1)) ** 4 * on;
    if (glow < 0.05) continue;
    const x0 = 20 + hash(i, 1) * (SCENE_W - 40) + Math.sin(since * 0.3 + i) * 12;
    const x = Math.round(x0 + windAt(since, seed, x0) * 6);
    const y = Math.round(40 + hash(i, 2) * (FLOOR_Y - 50) + Math.sin(since * 0.45 + i * 3) * 6);
    ctx.globalAlpha = glow * 0.35;
    rect(ctx, "#e8ff7a", x - 2, y - 2, 5, 5);
    ctx.globalAlpha = glow;
    rect(ctx, "#f4ffb0", x - 1, y - 1, 2, 2);
  }
  ctx.globalAlpha = 1;
};

/** What walks the floor behind the near shrubs, back to front by where its feet are: bugs,
 *  rabbit, fox, hedgehog. The deer walks in front of them (`drawDeer`). */
export const drawSmallLife = (
  ctx: CanvasRenderingContext2D,
  since: number,
  climb: Climb = (_x, y) => y,
) => {
  const season = seasonAt(since);
  drawCritters(ctx, since, climb);
  drawRabbit(ctx, since, season);
  drawFox(ctx, since);
  drawHedgehog(ctx, since, season);
};

/** What flies: butterflies, the owl on its branch. */
export const drawFliers = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  knocks: Knocks,
) => {
  const season = seasonAt(since);
  drawButterflies(ctx, since, season, seed);
  drawOwl(ctx, since, seed, knocks);
};

/** What glows, drawn over the night: the fireflies. */
export const drawGlowing = (ctx: CanvasRenderingContext2D, since: number, seed: number) =>
  drawFireflies(ctx, since, seasonAt(since), seed);
