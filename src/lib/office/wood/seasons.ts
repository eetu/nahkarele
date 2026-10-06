// Friday's clock: the storm after the blast, the wood growing in, then the year turning, as
// korpi's calendar; and what the year is doing to the wood (korpi's `lookAt`): leaves, snow,
// litter.

import { type Calendar, type Season, seasonAt as seasonOf } from "@anarkisti/korpi/clock";
import { type Look, lookAt as lookOf } from "@anarkisti/korpi/plants";
import { snowCover as coverOf } from "@anarkisti/korpi/sky";

export { litter } from "@anarkisti/korpi/plants";

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

/** Snow on the ground and the ledges, 0..1. */
export const snowCover = (since: number) => coverOf(FRIDAY, since);

/** How the wood looks at `since`: the season, its leaves and its snow. */
export const lookAt = (since: number): Look => lookOf(FRIDAY, since);
