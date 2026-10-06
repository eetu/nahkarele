// Friday's wind: korpi's air over the room, its mean the storm after the blast blowing itself
// out as the wood grows in, then the year's. The room is 8 m wide; a gust crosses it in four
// seconds. Strength is unitless, about 0..2, + blowing to the right; whatever moves in it
// scales it to scene px.

import {
  type Air,
  airOf,
  feltBy,
  historyOf,
  LAG_S,
  LAGS,
  seasonalWind,
  springOf,
  windDir,
} from "@anarkisti/korpi/motion";

import { prefersReducedMotion } from "$lib/keys";
import { smooth } from "$lib/scene/pixel";

import { SCENE_W } from "../engine";
import { FRIDAY, SEASONS_FROM, STORM_S } from "./seasons";

export { feltBy, historyOf, LAG_S, LAGS, springOf, windDir };

/** Scene px to the metre. */
const PX_M = 40;
/** The storm's mean, and how long it takes to blow itself out once it ends. */
const STORM = 1.1;
const CALMING_S = 70;

const year = seasonalWind(FRIDAY);

const meanAt = (since: number) => {
  if (since < STORM_S) return STORM;
  if (since < SEASONS_FROM)
    return STORM + (year(since) - STORM) * smooth((since - STORM_S) / CALMING_S);
  return year(since);
};

/** Each wood's air, by its seed. */
const airs = new Map<number, Air>();
export const fridayAir = (seed: number): Air => {
  const known = airs.get(seed);
  if (known) return known;
  const air = airOf({ seed, mean: meanAt, span: { x0: 0, x1: SCENE_W / PX_M }, front: 2 });
  airs.set(seed, air);
  return air;
};

export type Wind = (t: number, x: number) => number;

const felt = new Map<string, Wind>();

/** Friday's wind as what grows feels it: strength at a time and a world x, m. Asked for less
 *  motion, it stirs rather than tosses. One function a seed, so a pose asked again is the same. */
export const plantWind = (seed: number): Wind => {
  const calm = prefersReducedMotion() ? 0.3 : 1;
  const key = `${seed}|${calm}`;
  const known = felt.get(key);
  if (known) return known;
  const air = fridayAir(seed);
  const wind: Wind = calm === 1 ? air.wind : (t, x) => air.wind(t, x) * calm;
  felt.set(key, wind);
  if (felt.size > 16) felt.delete(felt.keys().next().value as string);
  return wind;
};

/** The wind at `x` (scene px) across the room, `since` seconds into friday. */
export const windAt = (since: number, seed: number, x = SCENE_W / 2): number =>
  fridayAir(seed).wind(since, x / PX_M);

/** How far the wind has carried something at `x` (scene px) from `from` to `to`, in
 *  strength-seconds. */
export const driftOf = (from: number, to: number, seed: number, x: number): number =>
  fridayAir(seed).drift(from, to, x / PX_M);
