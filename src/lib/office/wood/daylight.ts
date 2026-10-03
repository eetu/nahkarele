// Friday's days. A day goes by in a minute, shaped by the season as a Finnish day is: in summer
// the sun is up nineteen hours of the twenty-four, high at noon, and the night is a short
// bright dusk; in winter it barely clears the ridge for six, and the night is long and dark.
// The moon crosses the nights, high in winter and low in summer, waxing and waning over a
// month of these days. The first day breaks as the storm after the blast clears.

import { smooth } from "$lib/scene/pixel";

import { seasonAt, SEASONS_FROM, STORM_S } from "./seasons";

/** Seconds in one of friday's days, and in its month. */
export const DAY_S = 60;
const MONTH_S = 8 * DAY_S;

/**
 * By season (summer, autumn, winter, spring), at its middle: how much of the day the sun is
 * up, how high it gets at noon (1 is as high as it goes), how dark the night gets on the
 * sky's scale (0.7 dusk, 1 midnight), and how high the moon rides.
 */
const SEASONS = [
  { day: 0.78, noon: 1, night: 0.76, moon: 0.4 },
  { day: 0.45, noon: 0.5, night: 0.86, moon: 0.7 },
  { day: 0.25, noon: 0.18, night: 0.93, moon: 1 },
  { day: 0.56, noon: 0.62, night: 0.82, moon: 0.6 },
];

/** How long dusk and dawn take, as a share of a day. */
const TWILIGHT = 0.07;

type Shape = (typeof SEASONS)[number];

/** The season's shape at `since`, eased from each season's middle to the next's. */
const shapeAt = (since: number): Shape => {
  if (since < SEASONS_FROM) return SEASONS[0];
  const { k, p } = seasonAt(since);
  const [a, b, u] = p < 0.5 ? [(k + 3) % 4, k, p + 0.5] : [k, (k + 1) % 4, p - 0.5];
  const t = smooth(u);
  const mix = (key: keyof Shape) => SEASONS[a][key] + (SEASONS[b][key] - SEASONS[a][key]) * t;
  return { day: mix("day"), noon: mix("noon"), night: mix("night"), moon: mix("moon") };
};

/** Where in its day friday is, 0 at midnight, 0.5 at noon; the first dawn as the storm ends. */
const phaseAt = (since: number) => {
  const dawn = 0.5 - SEASONS[0].day / 2 - TWILIGHT / 2;
  return ((((since - STORM_S) / DAY_S + dawn) % 1) + 1) % 1;
};

/** Where something is in the sky: `across` it left to right (0..1), `up` from the horizon (0..1
 *  of as high as anything goes). */
export type Place = { across: number; up: number };

export type Day = {
  /** On the sky's 0..1 scale (`scene/sky.ts`): 0.2 dawn, 0.45 noon, 0.7 dusk, then night. */
  progress: number;
  /** The sun, while it is up. */
  sun: Place | null;
  /** The moon, at night, and its phase (0 new, 0.5 full). */
  moon: (Place & { phase: number }) | null;
};

/** Friday's sky `since` seconds in: how light, and where the sun and the moon are. */
export const dayAt = (since: number): Day => {
  const shape = shapeAt(since);
  const phase = phaseAt(since);
  const rise = 0.5 - shape.day / 2;
  const set = 0.5 + shape.day / 2;
  /** An arc across the sky, `u` of the way along it, `high` at its top. */
  const arc = (u: number, high: number): Place => ({ across: u, up: Math.sin(Math.PI * u) * high });
  if (phase >= rise && phase <= set) {
    const u = (phase - rise) / shape.day;
    return { progress: 0.2 + 0.5 * u, sun: arc(u, shape.noon), moon: null };
  }
  // Night: from dusk (0.7) into the season's dark, and back to it before dawn.
  const since_set = (phase - set + 1) % 1;
  const to_rise = (rise - phase + 1) % 1;
  const dark = smooth(Math.min(since_set, to_rise) / TWILIGHT);
  const progress = 0.7 + (shape.night - 0.7) * dark;
  const month = ((((since - STORM_S) / MONTH_S) % 1) + 1) % 1;
  const lit = 0.5 - 0.5 * Math.cos(2 * Math.PI * month);
  const moon =
    lit > 0.04 && since >= STORM_S
      ? { ...arc(since_set / (1 - shape.day), shape.moon * 0.7), phase: month }
      : null;
  return { progress, sun: null, moon };
};
