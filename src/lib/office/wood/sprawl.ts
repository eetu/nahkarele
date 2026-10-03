// What a soft plant is made of: shrubs, climbers and grass alike. Stems as runs of pieces up
// from the ground, leaves and buds hanging on them, each there once the plant has grown
// enough. They move by `rustle.ts` and are drawn by `posed.ts`.

import type { Climber } from "./climbers";
import type { Pt } from "./posed";
import type { Shrub } from "./shrubs";

/** A piece of stem, `s0`..`s1` of the way up stem `stem`, there once the plant is `at` grown. */
export type Piece = { a: Pt; b: Pt; w: number; stem: number; s0: number; s1: number; at: number };
/** Leaves on a stem, `s` of the way up it; `bloom` if flowers open there. */
export type Leaves = Pt & { r: number; at: number; stem: number; s: number; bloom: boolean };
/** Something else on a stem: a berry, a flower, a cone, a seed head. */
export type Bud = Pt & { stem: number; s: number; at: number };

export type Rustler = Shrub | Climber | "grass";

/** A soft plant: stems up from the ground (each piece says which stem), and what grows on them. */
export type Sprawl = {
  kind: Rustler;
  root: Pt;
  stems: number;
  pieces: Piece[];
  clumps: Leaves[];
  fruit: Bud[];
};

export type Rand = () => number;

/** Where a full-grown point of `plan` is while it is `g` grown, scaled up from its root. */
export const grownFrom =
  (plan: Sprawl, g: number) =>
  (q: Pt): Pt => ({
    x: plan.root.x + (q.x - plan.root.x) * g,
    y: plan.root.y + (q.y - plan.root.y) * g,
  });

/** `len` from `p` at `angle` radians off vertical (positive leans right). */
export const ahead = (p: Pt, angle: number, len: number): Pt => ({
  x: p.x + Math.sin(angle) * len,
  y: p.y - Math.cos(angle) * len,
});

/**
 * One stem from `from` at `angle`, `len` long in `n` pieces, each turning `bend` further out
 * (an arch over, for a cane) with a little wander. `at` is when it is there: once for the whole
 * stem, or along it, for one that grows out from its base. Returns the points, base first.
 */
export const stem = (
  plan: Sprawl,
  rand: Rand,
  from: Pt,
  angle: number,
  len: number,
  n: number,
  bend: number,
  widths: number[],
  at: number | ((s: number) => number),
) => {
  const k = plan.stems++;
  const side = Math.sign(angle) || 1;
  const pts = [from];
  let a = angle;
  for (let i = 0; i < n; i++) {
    a += side * bend + (rand() - 0.5) * 0.15;
    const b = ahead(pts[i], a, len / n);
    plan.pieces.push({
      a: pts[i],
      b,
      w: widths[i] ?? widths[widths.length - 1],
      stem: k,
      s0: i / n,
      s1: (i + 1) / n,
      at: typeof at === "number" ? at : at(i / n),
    });
    pts.push(b);
  }
  return { k, pts };
};

/** A stem laid along `pts`, base first; `at` as for `stem`. Returns its index. */
export const path = (
  plan: Sprawl,
  pts: Pt[],
  widths: number[],
  at: number | ((s: number) => number),
) => {
  const k = plan.stems++;
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    plan.pieces.push({
      a: pts[i],
      b: pts[i + 1],
      w: widths[i] ?? widths[widths.length - 1],
      stem: k,
      s0: i / n,
      s1: (i + 1) / n,
      at: typeof at === "number" ? at : at(i / n),
    });
  }
  return k;
};
