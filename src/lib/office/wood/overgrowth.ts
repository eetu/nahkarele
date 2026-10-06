// The room going back to nature: cracks in the floor, moss out from them, grass in them,
// climbers up the walls, creeper over the AIs. The plants are korpi's; where they come up, and
// when, is the room's.

import { line, type Pen, shifted } from "@anarkisti/korpi/paint";
import {
  type Climber,
  type ClimberPlan,
  type GrassPlan,
  planClimber,
  planCurtain,
  planGrass,
  reachIn,
  rustleOf,
} from "@anarkisti/korpi/plants";
import { paintClimberParts, paintGrassParts, posePx } from "@anarkisti/korpi/plants/paint";

import { colourOf } from "$lib/scene/pen";
import { hash, shuffled, smooth } from "$lib/scene/pixel";

import { FLAT, floorZ, grounded, onFloor, PX_M } from "../depth";
import { FLOOR_Y } from "../engine";
import { drawMoss as drawFloorMoss } from "./moss";
import { drawPosed, type Painter } from "./posed";
import { lookAt, SEASON_S, seasonAt, SEASONS_FROM } from "./seasons";
import { plantWind } from "./wind";

const CRACK = "#23262c";

/** Cracks across the floor, as runs of points, scene px. */
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

/** A tuft: where it comes up, scene px, and when, s. */
type Tuft = { x: number; y: number; delay: number };

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

/** The cracks, a pixel wide, point to point, in the floor. */
export const drawCracks = (pen: Pen) => {
  const c = colourOf(CRACK);
  const floor = onFloor(pen, FLAT.cracks);
  for (const run of CRACKS) {
    for (let i = 1; i < run.length; i++) line(floor, c, ...run[i - 1], ...run[i]);
  }
};

/** Moss spreads from the cracks and the climbers' roots until it carpets the floor. */
export const drawMoss = (pen: Pen, since: number, seed: number) =>
  drawFloorMoss(onFloor(pen, FLAT.moss), since, seed, [
    ...CRACKS.flat(),
    ...VINES.map((v) => [v.x, FLOOR_Y] as const),
  ]);

/** A soft plant rooted at scene (`x`, `y`): korpi's painting in its own pixels, moved there,
 *  rustling in friday's wind. */
const drawSoft = (
  pen: Pen,
  name: string,
  key: string,
  root: { x: number; y: number },
  plan: GrassPlan | ClimberPlan,
  paint: Painter,
  since: number,
  seed: number,
) => {
  const look = lookAt(since);
  const moves = rustleOf(plan, 1, look, since, plantWind(seed), root.x / PX_M);
  drawPosed(shifted(pen, { dx: root.x, dy: root.y }), name, key, paint, posePx(moves, PX_M));
};

// --- Grass ------------------------------------------------------------------------------

/** Seconds a tuft takes to come up. */
const TUFT_S = 30;

/** How far tuft `t` has come up `since` seconds into friday, 0..1. */
const tuftGrowth = (t: Tuft, since: number) => smooth((since - t.delay) / TUFT_S);

let patches: { seed: number; plans: GrassPlan[] } | null = null;

/** Each crack's patch, rooted at its first tuft. */
const patchesOf = (seed: number) => {
  if (patches?.seed !== seed) {
    const plans = TUFTS.map((tufts, i) => {
      const [root] = tufts;
      const local = tufts.map((t) => ({ x: (t.x - root.x) / PX_M, y: (root.y - t.y) / PX_M }));
      return planGrass(Math.floor(hash(seed, i, 23) * 2 ** 31), local, 1 / PX_M);
    });
    patches = { seed, plans };
  }
  return patches.plans;
};

/** `paint` (of `plan`, rooted on scene row `root`) with each blade at the depth of the floor
 *  where it comes up, and its seed head with it. */
const footed =
  (plan: GrassPlan, root: number, paint: Painter): Painter =>
  (rec, part) => {
    const at = { d: 0 };
    const pen: Pen = {
      fill: (c, x, y, w, h) => rec.fill(c, x, y, w, h, at.d),
      span: (c, x0, x1, y) => rec.span(c, x0, x1, y, at.d),
    };
    paint(pen, (p) => {
      const stem =
        p.kind === "wood" ? plan.pieces[p.i].stem : p.kind === "fruit" ? plan.fruit[p.i].stem : -1;
      const blade = plan.blades[stem];
      if (blade) at.d = -floorZ(root + Math.round(-blade.base.y * PX_M));
      part(p);
    });
  };

/** Grass in the cracks, a patch along each, every blade standing where it comes up. */
export const drawGrass = (pen: Pen, since: number, seed: number) => {
  const look = lookAt(since);
  patchesOf(seed).forEach((plan, i) => {
    const tufts = TUFTS[i];
    const grown = tufts.map((t) => tuftGrowth(t, since));
    const steps = grown.map((g) => Math.round(g * 12));
    if (steps.every((g) => g <= 0)) return;
    const key = `${seed}|${steps.join(",")}|${look.k}|${Math.round(look.p * 24)}`;
    const paint: Painter = (rec, part) => paintGrassParts(rec, plan, grown, look, part, PX_M);
    const root = tufts[0];
    const standing = footed(plan, root.y, paint);
    drawSoft(grounded(pen), `grass${seed}:${i}`, key, root, plan, standing, since, seed);
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
    const plans = VINES.map((_, i) =>
      planClimber(
        Math.floor(hash(seed, i, 24) * 2 ** 31),
        (HEIGHT[kinds[i]] * (0.9 + 0.1 * hash(seed, i, 22))) / PX_M,
        kinds[i],
      ),
    );
    climbers = { seed, plans };
  }
  return climbers.plans;
};

/**
 * How far a climber has reached, 0..1: up the wall as it grows. The hop grows up through the
 * first summer as it first grew, and from then on dies back to the floor each winter.
 */
const reachOf = (plan: ClimberPlan, since: number, delay: number) => {
  const grown = Math.min(1, Math.max(0, ((since - delay) * CLIMB_PX_S) / (plan.height * PX_M)));
  return since < SEASONS_FROM + SEASON_S
    ? reachIn(plan.kind, grown)
    : reachIn(plan.kind, grown, seasonAt(since));
};

const drawClimber = (
  pen: Pen,
  name: string,
  plan: ClimberPlan,
  root: { x: number; y: number },
  reach: number,
  since: number,
  seed: number,
) => {
  if (reach <= 0) return;
  const look = lookAt(since);
  const key = `${seed}|${Math.round(reach * 60)}|${look.k}|${Math.round(look.p * 24)}`;
  const paint: Painter = (rec, part) => paintClimberParts(rec, plan, reach, look, part, PX_M);
  drawSoft(pen, name, key, root, plan, paint, since, seed);
};

/** Climbers up the walls. */
export const drawVines = (pen: Pen, since: number, seed: number) =>
  climbersOf(seed).forEach((plan, i) => {
    const { x, delay } = VINES[i];
    const reach = reachOf(plan, since, delay);
    drawClimber(pen, `vine${seed}:${i}`, plan, { x, y: FLOOR_Y }, reach, since, seed);
  });

// --- Creeper over the machines ------------------------------------------------------------

const OVERGROWN_FROM = 360;
/** Seconds until the slabs are covered. */
const OVERGROWN_S = 540;

/** How far the creeper has got over the AIs, 0..1. Their lights and their arc go with it. */
export const overgrown = (since: number) => smooth((since - OVERGROWN_FROM) / OVERGROWN_S);

const curtains = new Map<string, ClimberPlan>();

/** Creeper up one AI's face: `x`..`x+w`, from `bottom` towards `top`, scene px. */
export const drawCreeperOver = (
  pen: Pen,
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
    plan = planCurtain(Math.floor(hash(seed, x, 25) * 2 ** 31), w / PX_M, (bottom - top) / PX_M);
    curtains.set(id, plan);
  }
  const root = { x: x + w / 2, y: bottom };
  drawClimber(pen, `curtain${seed}:${x}`, plan, root, cover, since, seed);
};
