// Friday's clock: the storm after the blast, the wood growing in, then the year turning, as
// korpi's calendar; and what the year is doing to the wood: leaves, snow, litter.

import { type Calendar, type Season, seasonAt as seasonOf } from "@anarkisti/korpi/clock";
import { snowCover as coverOf } from "@anarkisti/korpi/sky";

import { ramp } from "$lib/scene/pixel";

import type { Look } from "./trees";

/** How long the storm after the blast lasts. */
export const STORM_S = 90;
/** The wood is grown; from here the year turns. */
export const SEASONS_FROM = 320;
/** Seconds per season. */
export const SEASON_S = 150;

/** Friday's year: it turns once the wood has grown in, a day is a minute and a month eight of
 *  them, and the first day dawns as the storm clears. */
export const FRIDAY: Calendar = {
  from: SEASONS_FROM,
  season: SEASON_S,
  day: 60,
  month: 480,
  dawn: STORM_S,
};

export type { Season };

export const seasonAt = (since: number): Season => seasonOf(FRIDAY, since);

/** How much of the crown is leaf, 0..1: bare in winter, back in spring. */
export const foliage = ({ k, p }: Season) =>
  k === 0 ? 1 : k === 1 ? 1 - ramp(p, 0.35, 1) : k === 2 ? 0 : ramp(p, 0.3, 0.9);

/** Snow on the ground and the ledges, 0..1. */
export const snowCover = (since: number) => coverOf(FRIDAY, since);

/** Fallen leaves on the floor, 0..1: they pile in autumn and the moss has them by spring. */
export const litter = ({ k, p }: Season) =>
  k === 1 ? ramp(p, 0.35, 1) : k === 2 ? 1 : k === 3 ? 1 - ramp(p, 0, 0.5) : 0;

/** How the trees look at `since`: the season, its leaves and its snow. */
export const lookAt = (since: number): Look => {
  const season = seasonAt(since);
  return { k: season.k, p: season.p, leaves: foliage(season), snow: snowCover(since) };
};
