// Grass in the floor's cracks: tufts of blades, each its own length, lean and green, a few
// with seed heads late in summer. Fresh in spring, straw in the autumn, under the snow in
// winter but for the tallest tips. It moves by `rustle.ts`: every blade a rod, and the wind's
// waves rolling across the tufts.

import { hash, ramp, rect, smooth } from "$lib/scene/pixel";

import type { Part, Pt } from "./posed";
import { type Sprawl, stem } from "./sprawl";
import { type Look, random } from "./trees";

/** A tuft: where it comes up, and when. */
export type Tuft = Pt & { delay: number };

export type GrassPlan = Sprawl & {
  kind: "grass";
  tufts: Tuft[];
  /** Which tuft each blade is in, and where it comes out of the ground. */
  blades: { tuft: number; base: Pt }[];
};

/** Seconds a tuft takes to come up. */
const GROW_S = 30;

/** A patch of grass: a tuft at each of `tufts`, blades shaped by `seed`. */
export const planGrass = (seed: number, tufts: Tuft[]): GrassPlan => {
  const plan: GrassPlan = {
    kind: "grass",
    root: tufts[0],
    stems: 0,
    pieces: [],
    clumps: [],
    fruit: [],
    tufts,
    blades: [],
  };
  const rand = random(seed);
  tufts.forEach((t, ti) => {
    const n = 7 + Math.floor(rand() * 5);
    const tall = 0.8 + 0.5 * rand();
    for (let i = 0; i < n; i++) {
      const u = (i + rand()) / n - 0.5;
      const base = { x: t.x + u * 7, y: t.y + Math.round(rand() * 1.5) };
      const len = (4 + 5 * rand()) * tall * (1 - Math.abs(u) * 0.6);
      // Out from the middle of the tuft, curving further out as they go.
      const { k, pts } = stem(
        plan,
        rand,
        base,
        u * 0.9 + (rand() - 0.5) * 0.3,
        len,
        3,
        0.08,
        [1],
        0,
      );
      plan.blades[k] = { tuft: ti, base };
      if (rand() < 0.3) {
        const tip = pts[pts.length - 1];
        plan.fruit.push({ x: tip.x, y: tip.y, stem: k, s: 1, at: 0 });
      }
    }
  });
  return plan;
};

/** How far tuft `t` has come up `since` seconds into friday, 0..1. */
export const tuftGrowth = (t: Tuft, since: number) => smooth((since - t.delay) / GROW_S);

const GREEN = ["#3f7a2a", "#5f9a3a", "#4f8a32", "#6aaa42"];
const TIPS = ["#7ab84a", "#8ac85a"];
const STRAW = ["#a89850", "#b8a860", "#c8b878"];

/** A blade's colour `s` of the way up it, in the season, `h` its own. */
const bladeColour = (s: number, h: number, { k, p }: Look) => {
  // Straw from the autumn through the winter, back to green as spring goes on.
  const straw = k === 1 ? ramp(p, 0.1, 0.7) : k === 2 ? 1 : k === 3 ? 1 - ramp(p, 0.2, 0.7) : 0;
  if (h < straw) return STRAW[Math.floor((h + s) * 31) % STRAW.length];
  if (s > 0.7) return TIPS[Math.floor(h * 13) % TIPS.length];
  return GREEN[Math.floor(h * 97) % GREEN.length];
};

/**
 * Paint the patch `since` seconds into friday (each tuft grown as far as it has), dressed for
 * `look`, telling `part` before each blade and seed head.
 */
export const paintGrassParts = (
  ctx: CanvasRenderingContext2D,
  plan: GrassPlan,
  since: number,
  look: Look,
  part: (p: Part) => void,
) => {
  // In spring the grass starts short again; under snow only what stands above it shows.
  const spring = look.k === 3 ? 0.5 + 0.5 * ramp(look.p, 0, 0.6) : 1;
  const depth = look.snow * 6;
  const grown = plan.tufts.map((t) => tuftGrowth(t, since) * spring);
  const at = (stemK: number, q: Pt): Pt => {
    const { tuft, base } = plan.blades[stemK];
    const g = grown[tuft];
    return { x: base.x + (q.x - base.x) * g, y: base.y + (q.y - base.y) * g };
  };
  plan.pieces.forEach((piece, i) => {
    const { tuft, base } = plan.blades[piece.stem];
    if (grown[tuft] <= 0) return;
    const a = at(piece.stem, piece.a);
    const b = at(piece.stem, piece.b);
    part({ kind: "wood", i, a, b });
    const h = hash(piece.stem, 3, Math.round(base.x));
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let j = 0; j <= n; j++) {
      const y = a.y + ((b.y - a.y) * j) / n;
      if (base.y - y < depth) continue;
      const s = piece.s0 + ((piece.s1 - piece.s0) * j) / n;
      rect(ctx, bladeColour(s, h, look), a.x + ((b.x - a.x) * j) / n, y);
    }
  });
  // Seed heads from late summer, drying through the autumn, gone by winter.
  const { k, p } = look;
  if (!((k === 0 && p > 0.5) || (k === 1 && p < 0.8))) return;
  plan.fruit.forEach((f, j) => {
    const { tuft } = plan.blades[f.stem];
    if (grown[tuft] < 0.9) return;
    part({ kind: "fruit", i: j });
    const q = at(f.stem, f);
    const ripe = k === 1 ? "#d8c898" : "#c8b878";
    rect(ctx, ripe, q.x, q.y - 1);
    rect(ctx, "#a89860", q.x + (j % 2 ? 1 : -1), q.y);
    rect(ctx, ripe, q.x, q.y - 2);
  });
};
