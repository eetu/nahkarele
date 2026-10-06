// Friday's shrubs: two tall ones beside the desk at the trees' feet, three low ones along the
// near edge of the floor, each kind and shape from the seed (korpi's `planShrub`). They come up
// after the moss.

import { type Pen, shifted } from "@anarkisti/korpi/paint";
import {
  planShrub,
  rustleOf,
  type Shrub,
  type ShrubPlan,
  underSnow,
} from "@anarkisti/korpi/plants";
import { paintShrubParts, posePx } from "@anarkisti/korpi/plants/paint";

import { hash, shuffled, smooth } from "$lib/scene/pixel";

import { footAt, PX_M } from "../depth";
import { FLOOR_Y } from "../engine";
import { drawPosed } from "./posed";
import { lookAt } from "./seasons";
import { plantWind } from "./wind";

/**
 * Where shrubs come up, scene px, and when. At the back only in the gaps between the desk and
 * the AIs, clear of the furniture; along the near edge, anywhere.
 */
const BACK = [
  { x: 80, y: FLOOR_Y + 5, start: 70 },
  { x: 244, y: FLOOR_Y + 5, start: 95 },
];
const FRONT = [
  { x: 292, y: FLOOR_Y + 13, start: 85 },
  { x: 28, y: FLOOR_Y + 15, start: 55 },
  // Off to the side of where the exit sign lands, so it does not grow over it.
  { x: 122, y: FLOOR_Y + 23, start: 110 },
];
const TALL: Shrub[] = ["lilac", "raspberry", "juniper"];
const LOW: Shrub[] = ["bilberry", "juniper", "raspberry"];
/** How tall each kind stands behind the desk, and in front of it, px. */
const HEIGHT: Record<Shrub, [number, number]> = {
  lilac: [38, 26],
  raspberry: [22, 16],
  juniper: [30, 15],
  bilberry: [7, 7],
};
/** Seconds from a shoot to a full shrub, drawn in this many steps. */
const GROW_S = 100;
const GROW_STEPS = 30;

type Placed = { plan: ShrubPlan; x: number; y: number; start: number };

let bushes: { seed: number; back: Placed[]; front: Placed[] } | null = null;

const bushesOf = (seed: number) => {
  if (bushes?.seed === seed) return bushes;
  const place = (slots: typeof BACK, kinds: Shrub[], tall: 0 | 1, salt: number) =>
    slots.map(({ x, y, start }, i) => {
      const kind = kinds[i];
      const h = HEIGHT[kind][tall] * (0.85 + 0.3 * hash(seed, i, salt));
      const plan = planShrub(Math.floor(hash(seed, i, salt + 1) * 2 ** 31), h / PX_M, kind);
      return { plan, x, y, start };
    });
  bushes = {
    seed,
    back: place(BACK, shuffled(TALL, seed, 11), 0, 13),
    front: place(FRONT, shuffled(LOW, seed, 12), 1, 15),
  };
  return bushes;
};

const drawShrub = (pen: Pen, name: string, bush: Placed, since: number, seed: number) => {
  const { plan, start } = bush;
  const g = smooth((since - start) / GROW_S);
  if (g <= 0) return;
  const look = lookAt(since);
  // The bilberry goes under the snow.
  if (underSnow(plan.kind, look)) return;
  const step = Math.round(g * GROW_STEPS) / GROW_STEPS;
  const key = `${seed}|${step}|${look.k}|${Math.round(look.p * 24)}`;
  const moves = rustleOf(plan, step, look, since, plantWind(seed), bush.x / PX_M);
  drawPosed(
    shifted(footAt(pen, bush.y), { dx: bush.x, dy: bush.y }),
    name,
    key,
    (rec, part) => paintShrubParts(rec, plan, step, look, part, PX_M),
    posePx(moves, PX_M),
  );
};

/** The shrubs, the tall ones at the back and the low ones along the near edge, each at its
 *  foot's depth. */
export const drawShrubs = (pen: Pen, since: number, seed: number) => {
  const { back, front } = bushesOf(seed);
  back.forEach((b, i) => drawShrub(pen, `shrub-back${seed}:${i}`, b, since, seed));
  front.forEach((b, i) => drawShrub(pen, `shrub-front${seed}:${i}`, b, since, seed));
};
