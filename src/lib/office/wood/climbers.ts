// Friday's climbers: what goes up the office walls, and over the AIs. Virginia creeper
// (villiviini) in a dense branching curtain, red in the autumn; hop (humala) twining up its
// bine, cones late in summer, dying back to the floor each winter; clematis (kärhö) with big
// purple flowers and silver seed heads. A climber grows by reaching, not swelling: a stem is
// there as far as the plant has got along it, and its newest leaves are small.

import { ramp, rect } from "$lib/scene/pixel";

import type { Part, Pt } from "./posed";
import { path, type Rand, type Sprawl, stem } from "./sprawl";
import { clump, type Look, random } from "./trees";

export type Climber = "creeper" | "hop" | "clematis";

export const CLIMBERS: readonly Climber[] = ["creeper", "hop", "clematis"];

export type ClimberPlan = Sprawl & {
  kind: Climber;
  /** How high it reaches, scene px. */
  height: number;
};

/** Leaves at a stem's points but its base, alternating sides, there once it reaches them. */
const leafAlong = (
  plan: ClimberPlan,
  rand: Rand,
  k: number,
  pts: Pt[],
  at: (s: number) => number,
  r: number,
) => {
  const n = pts.length - 1;
  for (let i = 1; i <= n; i++) {
    const s = i / n;
    const side = i % 2 ? 1 : -1;
    plan.clumps.push({
      x: pts[i].x + side * r * 0.5,
      y: pts[i].y,
      r: r * (0.8 + 0.4 * rand()),
      at: at(s),
      stem: k,
      s,
      bloom: false,
    });
  }
};

/**
 * Creeper: a stem up the wall from `root`, `h` high, side shoots fanning out from it and
 * turning upward, leaves all over; kept between `left` and `right`.
 */
const creeper = (
  plan: ClimberPlan,
  rand: Rand,
  root: Pt,
  h: number,
  left = -Infinity,
  right = Infinity,
) => {
  const keep = (pts: Pt[]) => {
    for (const p of pts) p.x = Math.min(right, Math.max(left, p.x));
  };
  const reach = h / plan.height;
  const n = Math.max(4, Math.round(h / 6));
  const main = stem(plan, rand, root, (rand() - 0.5) * 0.1, h, n, 0, [1], (s) => s * reach);
  keep(main.pts);
  leafAlong(plan, rand, main.k, main.pts, (s) => s * reach, 2.4);
  /** A shoot out from `from`, reached at `s0`, fanning out to one side and turning up. */
  const shoot = (from: Pt, s0: number, side: number, len: number, depth: number) => {
    const at = (s: number) => Math.min(1, s0 + (s * len) / plan.height);
    const out = stem(plan, rand, from, side * (0.9 + 0.4 * rand()), len, 3, -0.1, [1], at);
    keep(out.pts);
    leafAlong(plan, rand, out.k, out.pts, at, 2.2);
    if (depth > 0 && rand() < 0.5) {
      shoot(out.pts[1], at(1 / 3), -side * 0.6, len * 0.6, depth - 1);
    }
  };
  let side = rand() < 0.5 ? -1 : 1;
  for (let i = 2; i < n; i += 2) {
    side = rand() < 0.75 ? -side : side;
    shoot(main.pts[i], (i / n) * reach, side, plan.height * (0.12 + 0.12 * rand()), 1);
  }
};

/**
 * Hop: one bine twisting up, big leaves in pairs (not every pair whole), side shoots off it
 * now and then, cones in bunches on the upper half.
 */
const hop = (plan: ClimberPlan, rand: Rand) => {
  const { root, height: h } = plan;
  const n = Math.round(h / 4);
  const twist = rand() * 6;
  const wide = 1.5 + rand();
  const pts = Array.from({ length: n + 1 }, (_, i) => ({
    x: root.x + (i ? Math.sin(i * 1.1 + twist) * wide : 0),
    y: root.y - (h * i) / n,
  }));
  const k = path(plan, pts, [1], (s) => s);
  const leaf = (q: Pt, stemK: number, s: number, at: number) =>
    plan.clumps.push({ ...q, r: 2.2 + rand() * 1.2, at, stem: stemK, s, bloom: false });
  const cones = (q: Pt, stemK: number, s: number) => {
    for (let c = 0; c < 2 + Math.floor(rand() * 2); c++) {
      const x = q.x + (rand() - 0.5) * 5;
      plan.fruit.push({ x, y: q.y + 2 + rand() * 2, stem: stemK, s, at: s });
    }
  };
  for (let i = 2; i <= n; i += 2) {
    const s = i / n;
    for (const side of [-1, 1]) {
      if (rand() < 0.15) continue;
      leaf({ x: pts[i].x + side * (2.5 + rand()), y: pts[i].y + 1 + (rand() - 0.5) }, k, s, s);
    }
    if (i % 5 === 0 && rand() < 0.7) {
      const side = rand() < 0.5 ? -1 : 1;
      const len = 6 + rand() * 6;
      const at = (u: number) => Math.min(1, s + (u * len) / h);
      const out = stem(plan, rand, pts[i], side * (0.8 + 0.3 * rand()), len, 2, -0.15, [1], at);
      out.pts.slice(1).forEach((q, j) => leaf(q, out.k, (j + 1) / 2, at((j + 1) / 2)));
      if (s > 0.4) cones(out.pts[2], out.k, 1);
    } else if (s > 0.4 && rand() < 0.35) cones(pts[i], k, s);
  }
};

/**
 * Clematis: a zigzag stem, leaves along it and on short shoots off it, big flowers on its upper
 * two thirds, at the nodes and the shoots' ends.
 */
const clematis = (plan: ClimberPlan, rand: Rand) => {
  const { root, height: h } = plan;
  const n = Math.round(h / 5);
  const pts = Array.from({ length: n + 1 }, (_, i) => ({
    x: root.x + (i ? (i % 2 ? 1.5 : -1.5) + (rand() - 0.5) : 0),
    y: root.y - (h * i) / n,
  }));
  const k = path(plan, pts, [1], (s) => s);
  leafAlong(plan, rand, k, pts, (s) => s, 2.3);
  const flower = (q: Pt, stemK: number, s: number, at: number) =>
    plan.fruit.push({ x: q.x, y: q.y, stem: stemK, s, at });
  for (let i = 2; i <= n; i++) {
    const s = i / n;
    const side = rand() < 0.5 ? -1 : 1;
    if (i % 3 === 0) {
      const len = 5 + rand() * 5;
      const at = (u: number) => Math.min(1, s + (u * len) / h);
      const out = stem(plan, rand, pts[i], side * (0.9 + 0.4 * rand()), len, 2, -0.1, [1], at);
      leafAlong(plan, rand, out.k, out.pts, at, 2.1);
      if (s > 0.3 && rand() < 0.6) flower(out.pts[2], out.k, 1, at(1));
    } else if (s > 0.3 && rand() < 0.3) {
      flower({ x: pts[i].x + side * 3, y: pts[i].y }, k, s, s);
    }
  }
};

const empty = (kind: Climber, root: Pt, height: number): ClimberPlan => ({
  kind,
  root,
  height,
  stems: 0,
  pieces: [],
  clumps: [],
  fruit: [],
});

/** A full-grown climber of `kind` up from `root`, `h` high, shaped by `seed`. */
export const planClimber = (seed: number, root: Pt, h: number, kind: Climber): ClimberPlan => {
  const plan = empty(kind, root, h);
  const rand = random(seed);
  if (kind === "creeper") creeper(plan, rand, root, h);
  else if (kind === "hop") hop(plan, rand);
  else clematis(plan, rand);
  return plan;
};

/** Creeper over an AI: stems up its face from the floor, kept on it, `x`..`x+w`, to `top`. */
export const planCurtain = (
  seed: number,
  x: number,
  top: number,
  bottom: number,
  w: number,
): ClimberPlan => {
  const plan = empty("creeper", { x: x + w / 2, y: bottom }, bottom - top);
  const rand = random(seed);
  const runs = 5;
  for (let k = 0; k < runs; k++) {
    const root = { x: x + 4 + (k * (w - 8)) / (runs - 1), y: bottom };
    creeper(plan, rand, root, (bottom - top) * (0.75 + 0.25 * rand()), x + 1, x + w - 2);
  }
  return plan;
};

// --- Painting ---------------------------------------------------------------------------

type Dress = {
  stem: string;
  summer: string[];
  lit: string;
  autumn: string[];
  /** When in the autumn the leaves turn, as a share of it. */
  turn: [number, number];
  aspect: number;
};

const DRESS: Record<Climber, Dress> = {
  creeper: {
    stem: "#6a5a3a",
    summer: ["#3f7a32", "#4a8a3a", "#356a2c"],
    lit: "#6aa04a",
    autumn: ["#c8302a", "#e0402a", "#a82020", "#d86a2a"],
    turn: [-0.1, 0.35],
    aspect: 0.85,
  },
  hop: {
    stem: "#5a8a32",
    summer: ["#4a8a2a", "#5a9a32", "#3a7a28"],
    lit: "#7ab84a",
    autumn: ["#b8a040", "#9a8a3a", "#7a6a32"],
    turn: [0.1, 0.6],
    aspect: 1,
  },
  clematis: {
    stem: "#6a5a3a",
    summer: ["#3a6a2a", "#4a7a32", "#2f5a26"],
    lit: "#5a8a3a",
    autumn: ["#8a7a3a", "#6a6a32"],
    turn: [0.3, 0.8],
    aspect: 0.8,
  },
};

/** The hop's bine dries out once its leaves go. */
const HOP_DRY = "#9a8a62";

/** Paint `plan` as far as it has reached (`reach`, 0..1), dressed for `look`. */
export const paintClimberParts = (
  ctx: CanvasRenderingContext2D,
  plan: ClimberPlan,
  reach: number,
  look: Look,
  part: (p: Part) => void,
) => {
  const dress = DRESS[plan.kind];
  const { k, p } = look;
  const dry = plan.kind === "hop" && ((k === 1 && p > 0.6) || k === 2);
  const colour = dry ? HOP_DRY : dress.stem;
  plan.pieces.forEach((piece, i) => {
    if (piece.at > reach) return;
    const { a, b } = piece;
    part({ kind: "wood", i, a, b });
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let j = 0; j <= n; j++) {
      rect(ctx, colour, a.x + ((b.x - a.x) * j) / n, a.y + ((b.y - a.y) * j) / n);
    }
  });
  const leaves = look.leaves;
  plan.clumps.forEach((c, i) => {
    if (c.at > reach) return;
    part({ kind: "clump", i });
    // The newest leaves, nearest where it is still reaching, are small.
    const young = reach >= 1 ? 1 : Math.min(1, (reach - c.at) * 8);
    const seed = i * 131 + Math.round(plan.root.x) + 11;
    clump(ctx, c.x, c.y, c.r * (0.45 + 0.55 * young), dress.aspect, seed, leaves, (h, lit) => {
      if (k === 1 && h < ramp(p, dress.turn[0], dress.turn[1])) {
        return dress.autumn[Math.floor(h * 97) % dress.autumn.length];
      }
      return lit ? dress.lit : dress.summer[Math.floor(h * 97) % dress.summer.length];
    });
  });
  plan.fruit.forEach((f, j) => {
    if (f.at > reach) return;
    const x = Math.round(f.x);
    const y = Math.round(f.y);
    if (plan.kind === "creeper") {
      // Dark berries, once the leaves have gone.
      if (!((k === 1 && p > 0.45) || (k === 2 && p < 0.3))) return;
      part({ kind: "fruit", i: j });
      rect(ctx, "#2a2a5a", x, y);
      rect(ctx, "#4a4a8a", x + 1, y);
    } else if (plan.kind === "hop") {
      if (!((k === 0 && p > 0.55) || (k === 1 && p < 0.6))) return;
      part({ kind: "fruit", i: j });
      const ripe = k === 1;
      rect(ctx, ripe ? "#b8a868" : "#c8d888", x, y, 2, 2);
      rect(ctx, ripe ? "#9a8a52" : "#a8b868", x, y + 1);
    } else if (k === 0 && p > 0.15 && p < 0.85) {
      // A big open flower: a purple disc, lit at the top left, a pale eye.
      part({ kind: "fruit", i: j });
      rect(ctx, "#7a4ab8", x - 1, y - 2, 3, 1);
      rect(ctx, "#7a4ab8", x - 2, y - 1, 5, 3);
      rect(ctx, "#7a4ab8", x - 1, y + 2, 3, 1);
      rect(ctx, "#9a6ad0", x - 1, y - 1, 2, 1);
      rect(ctx, "#5a2a90", x, y + 1);
      rect(ctx, "#e8d070", x, y);
    } else if (k === 1 || (k === 2 && p < 0.3)) {
      // Seed heads, silver fluff where the flowers were.
      part({ kind: "fruit", i: j });
      rect(ctx, "#e0e0d8", x - 1, y - 1, 3, 3);
      rect(ctx, "#c8c8c0", x + 1, y + 1);
      rect(ctx, "#f4f4ec", x - 1, y - 1);
    }
  });
};
