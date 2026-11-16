// Friday's trees shed what they have outgrown (korpi's stand sticks): a branch the rising crown
// has left below dies, hangs on a while, and comes down, turning as it falls, lands at its
// tree's foot, settles flat, lies a few minutes and sinks into the moss. This is the room's
// side of it: a stick painted.

import type { Pen } from "@anarkisti/korpi/paint";
import type { Life, Stick, StickAt } from "@anarkisti/korpi/plants";

import { fill } from "$lib/scene/pen";

import { PX_M, ROOM_VIEW, standing } from "../depth";
import { standFor } from "./stand";

const DEADWOOD = ["#8c877e", "#7a756c", "#9a958b"];

/** One stick of `life`'s, `at` where it is: falling, turning and drifting, then lying flat and
 *  sinking. */
const drawStick = (pen: Pen, life: Life, s: Stick, at: StickAt) => {
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
  for (const { life, stick, at } of standFor(seed).sticksAt(since)) drawStick(pen, life, stick, at);
};

/** Where branches landed between two moments of friday, scene x: for the sound. */
export const shedCue = (from: number, to: number, seed: number): number[] =>
  standFor(seed)
    .stickCues(from, to)
    .map((c) => c.p.x * PX_M);
