// Friday's shrubs: two tall ones behind the desk at the trees' feet, three low ones along the
// near edge of the floor, each kind and shape from the seed. They come up after the moss.

import { prefersReducedMotion } from "$lib/keys";
import { hash, smooth } from "$lib/scene/pixel";

import { FLOOR_Y } from "../engine";
import { drawPosed } from "./posed";
import { rustleOf } from "./rustle";
import { lookAt, snowCover } from "./seasons";
import { paintShrubParts, planShrub, type Shrub, type ShrubPlan } from "./shrubs";
import { shuffled } from "./stand";
import { windAt } from "./wind";

/**
 * Where shrubs come up, and when. Behind the desk only in the gaps between it and the AIs,
 * where nothing stands in front; along the near edge, anywhere.
 */
const BACK = [
  { x: 80, y: FLOOR_Y + 5, start: 70 },
  { x: 244, y: FLOOR_Y + 5, start: 95 },
];
const FRONT = [
  { x: 292, y: FLOOR_Y + 13, start: 85 },
  { x: 28, y: FLOOR_Y + 15, start: 55 },
  { x: 160, y: FLOOR_Y + 23, start: 110 },
];
const TALL: Shrub[] = ["lilac", "raspberry", "juniper"];
const LOW: Shrub[] = ["bilberry", "juniper", "raspberry"];
/** How tall each kind stands behind the desk, and in front of it. */
const HEIGHT: Record<Shrub, [number, number]> = {
  lilac: [38, 26],
  raspberry: [22, 16],
  juniper: [30, 15],
  bilberry: [7, 7],
};
/** Seconds from a shoot to a full shrub, drawn in this many steps. */
const GROW_S = 100;
const GROW_STEPS = 30;

type Placed = { plan: ShrubPlan; start: number };

let bushes: { seed: number; back: Placed[]; front: Placed[] } | null = null;

const bushesOf = (seed: number) => {
  if (bushes?.seed === seed) return bushes;
  const place = (slots: typeof BACK, kinds: Shrub[], tall: 0 | 1, salt: number) =>
    slots.map((slot, i) => {
      const kind = kinds[i];
      const h = HEIGHT[kind][tall] * (0.85 + 0.3 * hash(seed, i, salt));
      const plan = planShrub(Math.floor(hash(seed, i, salt + 1) * 2 ** 31), slot, h, kind);
      return { plan, start: slot.start };
    });
  bushes = {
    seed,
    back: place(BACK, shuffled(TALL, seed, 11), 0, 13),
    front: place(FRONT, shuffled(LOW, seed, 12), 1, 15),
  };
  return bushes;
};

const drawShrub = (
  ctx: CanvasRenderingContext2D,
  name: string,
  { plan, start }: Placed,
  since: number,
  seed: number,
) => {
  const g = smooth((since - start) / GROW_S);
  if (g <= 0) return;
  // The bilberry goes under the snow.
  if (plan.kind === "bilberry" && snowCover(since) > 0.45) return;
  const step = Math.round(g * GROW_STEPS) / GROW_STEPS;
  const look = lookAt(since);
  const key = `${seed}|${step}|${look.k}|${Math.round(look.p * 24)}`;
  const calm = prefersReducedMotion() ? 0.3 : 1;
  const pose = rustleOf(plan, step, look, since, (x, ago) => windAt(since - ago, seed, x) * calm);
  drawPosed(ctx, name, key, (rec, part) => paintShrubParts(rec, plan, step, look, part), pose);
};

/** The tall shrubs, behind the desk. */
export const drawBackShrubs = (ctx: CanvasRenderingContext2D, since: number, seed: number) =>
  bushesOf(seed).back.forEach((b, i) => drawShrub(ctx, `shrub-back${i}`, b, since, seed));

/** The low shrubs along the near edge, back to front. */
export const drawFrontShrubs = (ctx: CanvasRenderingContext2D, since: number, seed: number) =>
  bushesOf(seed).front.forEach((b, i) => drawShrub(ctx, `shrub-front${i}`, b, since, seed));
