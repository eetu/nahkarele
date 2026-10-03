// Friday's trees shed what they have outgrown. A branch the rising crown has left below dies,
// hangs on a while (`growth.ts`), and comes down: it falls turning, lands at its tree's foot,
// settles flat, lies a few minutes and sinks into the moss. Like everything else here, a
// function of friday's clock: when each branch goes is known from the seed.

import { hash, rect } from "$lib/scene/pixel";

import { FLOOR_Y } from "../engine";
import { shedOf } from "./growth";
import type { Pt } from "./posed";
import { SEASONS_FROM } from "./seasons";
import { ageAt, inLane, type Life, livesTo, timeOf } from "./stand";

/** Gravity, scene px/s², as for the wall's pieces. */
const G = 240;
/** A fallen branch lies this long, s, sinking into the moss over the last of it. */
const LIES_S = 300;
const SINKS_S = 90;
const DEADWOOD = ["#8c877e", "#7a756c", "#9a958b"];

type Stick = {
  /** When it lets go, and when it lands, s into friday. */
  at: number;
  lands: number;
  /** Its shape about its middle, and where its middle starts. */
  pts: Pt[];
  from: Pt;
  w: number;
  /** Where it comes down, the floor y it rests on, how it turns on the way, how it lies. */
  drift: number;
  floor: number;
  spin: number;
  lie: number;
};

const sticks = new WeakMap<Life, Stick[]>();

/** The branches `life` drops while it stands and the year turns, as sticks. */
const sticksOf = (life: Life): Stick[] => {
  const known = sticks.get(life);
  if (known) return known;
  const death = ageAt(life, life.dies);
  const out: Stick[] = [];
  shedOf(life.arch).forEach((shed, i) => {
    const at = timeOf(life, shed.age);
    // What goes while the wood grows in, years in minutes, just goes.
    if (shed.age >= death || at < SEASONS_FROM) return;
    const n = shed.pts.length;
    const from = {
      x: shed.pts.reduce((s, p) => s + p.x, 0) / n,
      y: shed.pts.reduce((s, p) => s + p.y, 0) / n,
    };
    const first = shed.pts[0];
    const last = shed.pts[n - 1];
    const h = (salt: number) => hash(life.arch.seed, i, salt);
    // Behind the furniture it rests at the wall's foot; in front, anywhere on the near floor.
    const floor = inLane(life, true)
      ? FLOOR_Y + 3 + Math.floor(h(1) * 9)
      : FLOOR_Y + 1 + Math.floor(h(1) * 3);
    const lands = at + Math.sqrt((2 * Math.max(1, floor - from.y)) / G);
    out.push({
      at,
      lands,
      pts: shed.pts.map((p) => ({ x: p.x - from.x, y: p.y - from.y })),
      from,
      w: shed.w,
      drift: (h(2) - 0.5) * 16,
      floor,
      spin: (h(3) - 0.5) * 7,
      lie: -Math.atan2(last.y - first.y, last.x - first.x),
    });
  });
  sticks.set(life, out);
  return out;
};

/** Every stick of `seed`'s wood in the air or on the ground at `since`. */
const around = (seed: number, since: number) =>
  livesTo(seed, since).flatMap((life) =>
    sticksOf(life)
      .filter((s) => s.at <= since && since < s.lands + LIES_S)
      .map((stick) => ({ life, stick })),
  );

/** One stick, `t` s after it let go. */
const drawStick = (ctx: CanvasRenderingContext2D, s: Stick, t: number) => {
  const fall = s.lands - s.at;
  const down = t >= fall;
  const angle = down ? s.lie : s.spin * t;
  const c = Math.cos(angle);
  const n = Math.sin(angle);
  const x = s.from.x + s.drift * Math.min(t, fall);
  const lying = t - fall;
  const sink = down ? Math.max(0, (lying - (LIES_S - SINKS_S)) / SINKS_S) * 3 : 0;
  const y = down ? s.floor - 1 + sink : s.from.y + 0.5 * G * t * t;
  for (let k = 0; k < s.pts.length; k++) {
    const p = s.pts[k];
    const q = s.pts[Math.min(s.pts.length - 1, k + 1)];
    const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y)));
    for (let j = 0; j < steps; j++) {
      const u = j / steps;
      const px = p.x + (q.x - p.x) * u;
      const py = p.y + (q.y - p.y) * u;
      // Down, it lies flat: no part of it below the floor it rests on.
      const ry = down ? Math.min(0, px * n + py * c) * 0.15 : px * n + py * c;
      const sx = Math.round(x + px * c - py * n);
      const sy = Math.round(y + ry);
      if (down && sy > s.floor - 1 + Math.floor(sink)) continue;
      rect(ctx, DEADWOOD[(k + j) % 3], sx, sy, k < s.pts.length / 3 ? s.w : 1, 1);
    }
  }
};

/** The branches coming down or lying at the feet of one lane's trees, behind the furniture or
 *  in `front` of it. */
export const drawSticks = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  front: boolean,
) => {
  for (const { life, stick } of around(seed, since)) {
    if (inLane(life, front)) drawStick(ctx, stick, since - stick.at);
  }
};

/** Where branches landed between two moments of friday: for the sound. */
export const shedCue = (from: number, to: number, seed: number): number[] => {
  if (to <= from) return [];
  return livesTo(seed, to).flatMap((life) =>
    sticksOf(life)
      .filter((s) => s.lands > from && s.lands <= to)
      .map((s) => s.from.x + s.drift * (s.lands - s.at)),
  );
};
