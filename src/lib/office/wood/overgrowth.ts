// The room going back to nature: cracks in the floor, moss out from them, grass in them,
// climbers up the walls, creeper over the AIs.

import { prefersReducedMotion } from "$lib/keys";
import { hash, ramp, smooth } from "$lib/scene/pixel";

import { FLOOR_Y } from "../engine";
import {
  type Climber,
  type ClimberPlan,
  paintClimberParts,
  planClimber,
  planCurtain,
} from "./climbers";
import { type GrassPlan, paintGrassParts, planGrass, type Tuft, tuftGrowth } from "./grass";
import { drawMoss as drawFloorMoss } from "./moss";
import { drawPosed, type Painter } from "./posed";
import { rustleOf } from "./rustle";
import { lookAt, SEASON_S, seasonAt, SEASONS_FROM } from "./seasons";
import { shuffled } from "./stand";
import { windAt } from "./wind";

const CRACK = "#23262c";

/** Cracks across the floor, as runs of points. */
const CRACKS: [number, number][][] = [
  [
    [60, 152],
    [72, 158],
    [70, 166],
    [84, 174],
    [88, 180],
  ],
  [
    [140, 154],
    [132, 162],
    [138, 170],
    [128, 180],
  ],
  [
    [204, 151],
    [214, 160],
    [230, 163],
    [238, 172],
  ],
  [
    [262, 156],
    [252, 166],
    [258, 180],
  ],
];
/** A tuft of grass at each point of a crack but the first; one patch per crack. */
const TUFTS: Tuft[][] = CRACKS.map((c, i) =>
  c.slice(1).map(([x, y], j) => ({ x, y, delay: 4 + i * 3 + j * 5 })),
);
const VINES = [
  { x: 58, delay: 10 },
  { x: 104, delay: 22 },
  { x: 218, delay: 16 },
  { x: 262, delay: 30 },
];

export const drawCracks = (ctx: CanvasRenderingContext2D) => {
  ctx.strokeStyle = CRACK;
  ctx.lineWidth = 1;
  for (const c of CRACKS) {
    ctx.beginPath();
    ctx.moveTo(c[0][0] + 0.5, c[0][1] + 0.5);
    for (const [x, y] of c.slice(1)) ctx.lineTo(x + 0.5, y + 0.5);
    ctx.stroke();
  }
};

/** Moss spreads from the cracks and the climbers' roots until it carpets the floor. */
export const drawMoss = (ctx: CanvasRenderingContext2D, since: number) =>
  drawFloorMoss(ctx, since, [
    ...CRACKS.flat(),
    ...VINES.map((v) => [v.x, FLOOR_Y] as [number, number]),
  ]);

/** How the room's soft plants take the wind; asked for less motion, they stir rather than toss. */
const blowing = (since: number, seed: number) => {
  const calm = prefersReducedMotion() ? 0.3 : 1;
  return (x: number, ago: number) => windAt(since - ago, seed, x) * calm;
};

// --- Grass ------------------------------------------------------------------------------

let patches: { seed: number; plans: GrassPlan[] } | null = null;

const patchesOf = (seed: number) => {
  if (patches?.seed !== seed) {
    const plans = TUFTS.map((tufts, i) =>
      planGrass(Math.floor(hash(seed, i, 23) * 2 ** 31), tufts),
    );
    patches = { seed, plans };
  }
  return patches.plans;
};

/** Grass in the cracks, a patch along each. */
export const drawGrass = (ctx: CanvasRenderingContext2D, since: number, seed: number) => {
  const look = lookAt(since);
  patchesOf(seed).forEach((plan, i) => {
    const grown = plan.tufts.map((t) => Math.round(tuftGrowth(t, since) * 12));
    if (grown.every((g) => g <= 0)) return;
    const key = `${seed}|${grown.join(",")}|${look.k}|${Math.round(look.p * 24)}`;
    const pose = rustleOf(plan, 1, look, since, blowing(since, seed));
    const paint: Painter = (rec, part) => paintGrassParts(rec, plan, since, look, part);
    drawPosed(ctx, `grass${i}`, key, paint, pose);
  });
};

// --- Climbers ---------------------------------------------------------------------------

/** How high each kind reaches up the wall, scene px. */
const HEIGHT: Record<Climber, number> = { creeper: FLOOR_Y - 18, hop: 100, clematis: 70 };
/** How fast a climber reaches up, scene px/s. */
const CLIMB_PX_S = 1.6;

let climbers: { seed: number; plans: ClimberPlan[] } | null = null;

const climbersOf = (seed: number) => {
  if (climbers?.seed !== seed) {
    const kinds = shuffled<Climber>(["creeper", "hop", "clematis", "creeper"], seed, 21);
    const plans = VINES.map((v, i) =>
      planClimber(
        Math.floor(hash(seed, i, 24) * 2 ** 31),
        { x: v.x, y: FLOOR_Y },
        HEIGHT[kinds[i]] * (0.9 + 0.1 * hash(seed, i, 22)),
        kinds[i],
      ),
    );
    climbers = { seed, plans };
  }
  return climbers.plans;
};

/**
 * How far a climber has reached, 0..1: up the wall as it grows. The hop dies back to the floor
 * in early winter and comes up again through the spring, its full height by midsummer.
 */
const reachOf = (plan: ClimberPlan, since: number, delay: number) => {
  const grown = Math.min(1, Math.max(0, ((since - delay) * CLIMB_PX_S) / plan.height));
  if (plan.kind !== "hop" || since < SEASONS_FROM) return grown;
  const { k, p } = seasonAt(since);
  const year = Math.floor((since - SEASONS_FROM) / (4 * SEASON_S));
  if (k === 0) return year === 0 ? grown : 0.8 + 0.2 * ramp(p, 0, 0.3);
  if (k === 1) return 1;
  if (k === 2) return 1 - ramp(p, 0, 0.3);
  return 0.8 * ramp(p, 0.1, 1);
};

const drawClimber = (
  ctx: CanvasRenderingContext2D,
  name: string,
  plan: ClimberPlan,
  reach: number,
  since: number,
  seed: number,
) => {
  if (reach <= 0) return;
  const look = lookAt(since);
  const key = `${seed}|${Math.round(reach * 60)}|${look.k}|${Math.round(look.p * 24)}`;
  const pose = rustleOf(plan, 1, look, since, blowing(since, seed));
  const paint: Painter = (rec, part) => paintClimberParts(rec, plan, reach, look, part);
  drawPosed(ctx, name, key, paint, pose);
};

/** Climbers up the walls. */
export const drawVines = (ctx: CanvasRenderingContext2D, since: number, seed: number) =>
  climbersOf(seed).forEach((plan, i) =>
    drawClimber(ctx, `vine${i}`, plan, reachOf(plan, since, VINES[i].delay), since, seed),
  );

// --- Creeper over the machines ------------------------------------------------------------

const OVERGROWN_FROM = 360;
/** Seconds until the slabs are covered. */
const OVERGROWN_S = 540;

/** How far the creeper has got over the AIs, 0..1. Their lights and their arc go with it. */
export const overgrown = (since: number) => smooth((since - OVERGROWN_FROM) / OVERGROWN_S);

const curtains = new Map<string, ClimberPlan>();

/** Creeper up one AI's face: `x`..`x+w`, from `bottom` towards `top`. */
export const drawCreeperOver = (
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
  bottom: number,
  w: number,
  since: number,
  seed: number,
) => {
  const cover = overgrown(since);
  if (cover <= 0) return;
  const id = `${seed}|${x}`;
  let plan = curtains.get(id);
  if (!plan) {
    plan = planCurtain(Math.floor(hash(seed, x, 25) * 2 ** 31), x, top, bottom, w);
    curtains.set(id, plan);
  }
  drawClimber(ctx, `curtain${x}`, plan, cover, since, seed);
};
