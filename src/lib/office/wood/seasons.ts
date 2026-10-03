// Friday's clock: the storm after the blast, the wood growing in, then the year turning,
// and what the year is doing: leaves, snow, litter.

import { ramp } from "$lib/scene/pixel";

import type { Look } from "./trees";

/** How long the storm after the blast lasts. */
export const STORM_S = 90;
/** The wood is grown; from here the year turns. */
export const SEASONS_FROM = 320;
/** Seconds per season. */
export const SEASON_S = 150;

export type Season = {
  /** 0 summer, 1 autumn, 2 winter, 3 spring. */
  k: 0 | 1 | 2 | 3;
  /** How far through it, 0..1. */
  p: number;
};

export const seasonAt = (since: number): Season => {
  if (since < SEASONS_FROM) return { k: 0, p: 0 };
  const t = (since - SEASONS_FROM) / SEASON_S;
  return { k: (Math.floor(t) % 4) as Season["k"], p: t % 1 };
};

/** How much of the crown is leaf, 0..1: bare in winter, back in spring. */
export const foliage = ({ k, p }: Season) =>
  k === 0 ? 1 : k === 1 ? 1 - ramp(p, 0.35, 1) : k === 2 ? 0 : ramp(p, 0.3, 0.9);

/** Snow on the ground and the ledges, 0..1. */
export const snowCover = (since: number) => {
  const { k, p } = seasonAt(since);
  return k === 2 ? ramp(p, 0.1, 0.7) : k === 3 ? 1 - ramp(p, 0, 0.4) : 0;
};

/** Fallen leaves on the floor, 0..1: they pile in autumn and the moss has them by spring. */
export const litter = ({ k, p }: Season) =>
  k === 1 ? ramp(p, 0.35, 1) : k === 2 ? 1 : k === 3 ? 1 - ramp(p, 0, 0.5) : 0;

/** How the trees look at `since`: the season, its leaves and its snow. */
export const lookAt = (since: number): Look => {
  const season = seasonAt(since);
  return { k: season.k, p: season.p, leaves: foliage(season), snow: snowCover(since) };
};
