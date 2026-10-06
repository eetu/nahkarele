// Friday's trees shed what they have outgrown (korpi's `sticksOf`): a branch the rising crown
// has left below dies, hangs on a while, and comes down, turning as it falls, lands at its
// tree's foot, settles flat, lies a few minutes and sinks into the moss. This is the room's
// side of it: where on the floor a stick comes to rest, and a stick painted.

import type { Pen } from "@anarkisti/korpi/paint";
import {
  type Life,
  type Shedding,
  type Stick,
  stickAt,
  stickCues,
  sticksAt,
} from "@anarkisti/korpi/plants";

import { fill } from "$lib/scene/pen";

import { PX_M, ROOM_VIEW, standing } from "../depth";
import { SEASONS_FROM } from "./seasons";
import { inLane, livesTo, ROOT_Y, standFor } from "./stand";

/** A fallen branch lies this long, s, sinking into the moss over the last of it. */
const LIES_S = 300;
const SINKS_S = 90;
const DEADWOOD = ["#8c877e", "#7a756c", "#9a958b"];

/**
 * Where a stick comes to rest, m toward the viewer from its tree's root: behind the furniture at
 * the wall's foot, from two rows back to the root's row; in front, anywhere from the root's row
 * to eight rows nearer. Half a row either side of those, so each row is as likely.
 */
const BACK_LANE = [-0.25, 0.05] as const;
const FRONT_LANE = [-0.05, 0.85] as const;

const sheddings = new WeakMap<Life, Shedding>();

/** What `seed`'s `life` drops while it stands and the year turns. */
const sheddingOf = (seed: number, life: Life): Shedding => {
  const known = sheddings.get(life);
  if (known) return known;
  const stand = standFor(seed);
  const spec: Shedding = {
    arch: life.arch,
    timeOf: (age) => stand.timeOf(life, age),
    dies: stand.ageAt(life, life.dies),
    // What goes while the wood grows in, years in minutes, just goes.
    after: SEASONS_FROM,
    // A quarter metre over the room's top.
    reach: (ROOT_Y + 10) / PX_M,
    lane: inLane(life, true) ? FRONT_LANE : BACK_LANE,
    lies: LIES_S,
    sinks: SINKS_S,
  };
  sheddings.set(life, spec);
  return spec;
};

/** One stick of `life`'s at `t`: falling, turning and drifting, then lying flat and sinking. */
const drawStick = (pen: Pen, life: Life, spec: Shedding, s: Stick, t: number) => {
  const at = stickAt(spec, s, t);
  const into = standing(pen, life.z + (at.down ? s.z : at.z));
  const where = (y: number, z: number) => ROOM_VIEW.project({ x: life.x + at.x, y, z: life.z + z });
  // Turned as seen: + clockwise.
  const angle = -at.angle;
  const c = Math.cos(angle);
  const n = Math.sin(angle);
  const sink = at.sink * PX_M;
  // Down, it lies on the floor of its row, a pixel above it, sinking.
  const floor = Math.round(where(0, s.z).sy) - 1;
  const mid = at.down ? { sx: where(0, s.z).sx, sy: floor + sink } : where(at.y, at.z);
  const pts = s.pts.map((p) => ({ x: p.x * PX_M, y: -p.y * PX_M }));
  const w = Math.round(s.w * PX_M);
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    const q = pts[Math.min(pts.length - 1, k + 1)];
    const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y)));
    for (let j = 0; j < steps; j++) {
      const u = j / steps;
      const px = p.x + (q.x - p.x) * u;
      const py = p.y + (q.y - p.y) * u;
      // Down, it lies flat: no part of it below the floor it rests on.
      const ry = at.down ? Math.min(0, px * n + py * c) * 0.15 : px * n + py * c;
      const sx = Math.round(mid.sx + px * c - py * n);
      const sy = Math.round(mid.sy + ry);
      if (at.down && sy > floor + Math.floor(sink)) continue;
      fill(into, DEADWOOD[(k + j) % 3], sx, sy, k < pts.length / 3 ? w : 1, 1);
    }
  }
};

/** The branches coming down or lying at the trees' feet, each at its own depth. */
export const drawSticks = (pen: Pen, since: number, seed: number) => {
  for (const life of livesTo(seed, since)) {
    const spec = sheddingOf(seed, life);
    for (const s of sticksAt(spec, since)) drawStick(pen, life, spec, s, since);
  }
};

/** Where branches landed between two moments of friday, scene x: for the sound. */
export const shedCue = (from: number, to: number, seed: number): number[] => {
  if (to <= from) return [];
  return livesTo(seed, to).flatMap((life) =>
    stickCues(sheddingOf(seed, life), from, to).map((c) => (life.x + c.p.x) * PX_M),
  );
};
