// Friday's clock: the storm after the blast, the wood growing in, then the year turning.

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
