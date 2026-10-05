// Friday's days, korpi's northern days on friday's calendar: a minute each, the sun up nineteen
// hours of twenty-four in summer and six in winter, the moon crossing the nights through its
// phases. The first day breaks as the storm after the blast clears.

import { type Day, dayAt as dayOf, type Place } from "@anarkisti/korpi/sky";

import { FRIDAY } from "./seasons";

/** Seconds in one of friday's days. */
export const DAY_S = FRIDAY.day;

export type { Day, Place };

/** Friday's sky `since` seconds in: how light, and where the sun and the moon are. */
export const dayAt = (since: number): Day => dayOf(FRIDAY, since);
