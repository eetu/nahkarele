// Friday's wind, a function of time like everything on friday: a mean that follows the year
// (the storm, calm summers, autumn gales), gusts on top, and a little turbulence. Each gust
// crosses the room from the upwind side, so the trees take it one after another.
//
// Strength is unitless, about 0..2 (1 a stiff breeze); its sign is the direction, + blowing
// to the right. Whatever moves in it scales it to scene px.

import { SCENE_W } from "./engine";
import { hash, smooth } from "./pixel";
import { seasonAt, SEASONS_FROM, STORM_S } from "./seasons";

/** The mean wind per season: summer, autumn, winter, spring. */
const MEAN = [0.12, 0.55, 0.4, 0.3];
/** The storm's mean, and how long it takes to blow itself out once it ends. */
const STORM = 1.1;
const CALMING_S = 70;
/** One gust at most per slot of this many seconds. */
const GUST_S = 6;
/** How fast a gust crosses the room, scene px/s: about four seconds wall to wall. */
const FRONT_PX_S = 80;

const meanAt = (since: number) => {
  if (since < STORM_S) return STORM;
  if (since < SEASONS_FROM)
    return STORM + (MEAN[0] - STORM) * smooth((since - STORM_S) / CALMING_S);
  const { k, p } = seasonAt(since);
  return MEAN[k] + (MEAN[(k + 1) % 4] - MEAN[k]) * smooth((p - 0.7) / 0.3);
};

/** Up quickly, down slowly, over 0..1. */
const bump = (u: number) => (u < 0.25 ? smooth(u / 0.25) : 1 - smooth((u - 0.25) / 0.75));

/** The gust in slot `n`, if the slot has one: windier weather has more and stronger gusts. */
const gustAt = (t: number, seed: number) => {
  const n = Math.floor(t / GUST_S);
  const mean = meanAt(n * GUST_S);
  if (hash(seed, n, 81) > 0.25 + 0.6 * Math.min(1, mean)) return 0;
  const start = n * GUST_S + hash(seed, n, 82) * 1.5;
  const dur = 2.5 + hash(seed, n, 83) * 2.5;
  const u = (t - start) / dur;
  if (u <= 0 || u >= 1) return 0;
  return (0.35 + 0.65 * hash(seed, n, 84)) * (0.25 + 0.75 * mean) * bump(u);
};

const strength = (t: number, seed: number) => {
  const mean = meanAt(t);
  const turbulence =
    (0.06 * Math.sin(0.7 * t) + 0.05 * Math.sin(1.6 * t + 1.1) + 0.03 * Math.sin(3.1 * t + 2.3)) *
    (0.4 + mean);
  return Math.max(0, mean + gustAt(t, seed) + turbulence);
};

/** Which way this wood's wind blows, mostly from the left: +1 to the right. */
export const windDir = (seed: number): 1 | -1 => (hash(seed, 80) < 0.7 ? 1 : -1);

/** The wind at `x` across the room, `since` seconds into friday. */
export const windAt = (since: number, seed: number, x = SCENE_W / 2): number => {
  const dir = windDir(seed);
  const upwind = dir > 0 ? x : SCENE_W - x;
  return dir * strength(Math.max(0, since - upwind / FRONT_PX_S), seed);
};

/**
 * How far the wind has carried something at `x` from `from` to `to`, in strength-seconds:
 * Simpson's rule over six steps. Particles use it instead of the wind now, so a gust moves a
 * flake the same distance whether it has been falling one second or ten.
 */
export const driftOf = (from: number, to: number, seed: number, x: number): number => {
  if (to <= from) return 0;
  const h = (to - from) / 6;
  let sum = windAt(from, seed, x) + windAt(to, seed, x);
  for (let i = 1; i < 6; i++) sum += (i % 2 ? 4 : 2) * windAt(from + i * h, seed, x);
  return (sum * h) / 3;
};
