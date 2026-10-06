// Barn swallows (haarapääsky), the year's migrants: the great tit stays the winter, these do not.
// A pair comes in late spring, builds a mud nest on top of AI #1 the first year and uses it every
// year after; all summer, by day, they sweep the room after insects, now and then skimming the
// grass, and keep going back to the nest, where in high summer the chicks gape for them; they
// roost there at night, and by early autumn they have gone south. All by friday's clock.

import { fill, type Pen } from "$lib/scene/pen";
import { hash, smooth } from "$lib/scene/pixel";
import { daylight } from "$lib/scene/sky";
import { frameOf, paintSprite, type Sprite } from "$lib/sprites/sprite";
import swallowSprite from "$lib/sprites/swallow.json";

import { at as depthAt, Z } from "../depth";
import { FLOOR_Y } from "../engine";
import type { Pt } from "./posed";
import { SEASON_S, seasonAt, SEASONS_FROM } from "./seasons";
import { windowAt } from "./weather";

const SWALLOW = swallowSprite as Sprite;
/** Where a swallow's feet are in the sprite, perched. */
const FEET = { x: 5, y: 6 };

/** The nest's rim, on the top right of AI #1's slab (its top is y 32, x 6..50). */
const NEST = { x: 46, y: 31 };
const MUD = ["#7a6a58", "#6a5a48", "#8a7a66"];
/** The nest's pellets, bottom up: a cup on the ledge, open at the top. */
const CUP: Pt[] = [
  ...[44, 45, 46, 47, 48, 49].map((x) => ({ x, y: 31 })),
  ...[43, 44, 45, 46, 47, 48, 49, 50].map((x) => ({ x, y: 30 })),
  ...[42, 43, 44, 49, 50, 51].map((x) => ({ x, y: 29 })),
  ...[42, 43, 50, 51].map((x) => ({ x, y: 28 })),
];
/** The first spring it takes them to build it, s. */
const BUILD_S = 120;

/** When in its year a swallow comes and goes, as shares of the season: late spring, and the
 *  first quarter of autumn. The second of the pair a little behind the first. */
const comes = (i: number) => 0.55 + 0.07 * i;
const goes = (i: number) => 0.25 - 0.05 * i;

/** Whether swallow `i` is here (not south) `since` s into friday. */
const here = (i: number, since: number) => {
  if (since < SEASONS_FROM) return false;
  const { k, p } = seasonAt(since);
  return (k === 3 && p >= comes(i)) || k === 0 || (k === 1 && p < goes(i));
};

/** When they first came, and how far the nest is built. */
const FIRST = SEASONS_FROM + (3 + comes(0)) * SEASON_S;
const built = (since: number) => smooth((since - FIRST) / BUILD_S);

/** Chicks in the nest: high summer. */
const chicks = (since: number) => {
  const { k, p } = seasonAt(since);
  return since >= SEASONS_FROM && k === 0 && p > 0.3 && p < 0.75;
};

const byDay = (since: number) => daylight(windowAt(since).progress) >= 0.25;

/** The way a swallow sweeps the room: wide loops, now and then down over the grass. */
const loop = (i: number, t: number): Pt => {
  const s = t * 0.55 + i * 2.1;
  const skim = Math.max(0, Math.sin(0.31 * t + i * 1.7)) ** 8;
  return {
    x: 160 + 140 * Math.sin(s) + 18 * Math.sin(2.7 * s + i),
    y: Math.min(FLOOR_Y + 2, 58 + 26 * Math.sin(1.6 * s + 0.7 + i) + 85 * skim),
  };
};

/** Back to the nest every so often: in for a second, on the rim a moment, off again. */
const NEST_EVERY = 18;
const visitAt = (i: number, t: number) => {
  const start = Math.floor((t + i * 9) / NEST_EVERY) * NEST_EVERY - i * 9 + 6;
  return { start, at: t - start };
};

/** Where a swallow is, and how far out from the wall, m. */
type Seen = { feet: Pt; z: number; face: 1 | -1; frame: number };

/** Where swallow `i` is and what it is doing, if it is here and not inside the nest. */
const swallowAt = (i: number, since: number): Seen | null => {
  if (!here(i, since)) return null;
  // By night they roost: one on the rim, the other down in the cup.
  if (!byDay(since)) return i === 0 ? { feet: NEST, z: Z.nesting, face: -1, frame: 4 } : null;
  const { start, at } = visitAt(i, since);
  const step = (t: number) => {
    const a = loop(i, t);
    const b = loop(i, t + 0.05);
    return { at: a, face: (b.x >= a.x ? 1 : -1) as 1 | -1 };
  };
  const flight = (t: number) => {
    const { at: p, face } = step(t);
    const gliding = (t * 1.3 + i * 0.4) % 1 > 0.62;
    const frame = gliding ? 3 : frameOf(SWALLOW, "fly", t * 14 + i);
    return { feet: { x: p.x, y: p.y }, z: Z.swallows, face, frame };
  };
  // The nest's visits wait for the nest.
  if (built(since) < 1 || at < 0 || at >= 3) return flight(since);
  if (at < 1) {
    const from = loop(i, start);
    const q = at;
    return {
      feet: { x: from.x + (NEST.x - from.x) * q, y: from.y + (NEST.y - from.y) * q },
      z: Z.swallows + (Z.nesting - Z.swallows) * q,
      face: NEST.x >= from.x ? 1 : -1,
      frame: frameOf(SWALLOW, "fly", since * 14),
    };
  }
  if (at < 2) return { feet: NEST, z: Z.nesting, face: -1, frame: 4 };
  const to = loop(i, start + 3);
  const q = at - 2;
  return {
    feet: { x: NEST.x + (to.x - NEST.x) * q, y: NEST.y + (to.y - NEST.y) * q },
    z: Z.nesting + (Z.swallows - Z.nesting) * q,
    face: to.x >= NEST.x ? 1 : -1,
    frame: frameOf(SWALLOW, "fly", since * 14),
  };
};

/** The nest as far as it is built, and the chicks in it. */
const drawNest = (pen: Pen, since: number) => {
  const done = Math.floor(built(since) * CUP.length);
  if (done <= 0) return;
  // A parent on the rim sets the chicks gaping.
  const fed = [0, 1].some((i) => swallowAt(i, since)?.frame === 4 && byDay(since));
  if (chicks(since) && done === CUP.length) {
    for (const [k, x] of [45, 47, 49].entries()) {
      const up = fed || Math.floor(since * 1.5 + k) % 3 === 0 ? 1 : 0;
      fill(pen, "#2a2a36", x - 0.5, 27 - up, 2, 2);
      if (fed) fill(pen, "#f0c840", x - 0.5, 26 - up, 2, 1);
    }
  }
  CUP.slice(0, done).forEach((p, k) => fill(pen, MUD[Math.floor(hash(k, 81) * 3)], p.x, p.y));
};

/** The swallows, out over the room or at the nest, and the nest on AI #1. */
export const drawSwallows = (pen: Pen, since: number) => {
  drawNest(depthAt(pen, Z.nest), since);
  for (const i of [0, 1]) {
    const s = swallowAt(i, since);
    if (!s) continue;
    const left = s.face > 0 ? s.feet.x - FEET.x : s.feet.x - (SWALLOW.w - 1 - FEET.x);
    paintSprite(depthAt(pen, s.z), SWALLOW, left, s.feet.y - FEET.y, {
      frame: s.frame,
      flip: s.face < 0 ? "h" : undefined,
    });
  }
};

/** Where the swallows twittered between two moments of friday: for the sound. */
export const swallowCue = (from: number, to: number): number[] => {
  if (to <= from) return [];
  return [0, 1].flatMap((i) => {
    if (!here(i, to) || !byDay(to)) return [];
    // A twitter every seven seconds or so, each its own.
    const beat = 7;
    const n = Math.floor((to + i * 3.1) / beat);
    const at = n * beat - i * 3.1 + hash(n, i, 82) * 3;
    return at > from && at <= to ? [loop(i, at).x] : [];
  });
};
