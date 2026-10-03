// Friday's shrubs, grown from a seed like the trees: what fills in under a Finnish wood's edge.
// A plan is the full-grown shrub in scene pixels: stems as runs of pieces up from the base,
// leaves and fruit hanging on them. They grow and dress for the season as the trees do, and
// move by their own rules (`rustle.ts`).

import { hash, ramp, rect } from "$lib/scene/pixel";

import type { Part, Pt } from "./posed";
import { grownFrom, type Rand, type Sprawl, stem } from "./sprawl";
import { cap, clump, type Look, random } from "./trees";

export type Shrub = "raspberry" | "juniper" | "lilac" | "bilberry";

export const SHRUBS: readonly Shrub[] = ["raspberry", "juniper", "lilac", "bilberry"];

export type ShrubPlan = Sprawl & {
  kind: Shrub;
  /** Full height, scene px. */
  height: number;
};

/** Raspberry: canes up from the root, arching over under their own weight, leaves all along. */
const raspberry = (plan: ShrubPlan, rand: Rand) => {
  const { root, height: h } = plan;
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const angle = ((i + 0.5) / n - 0.5) * 0.8 + (rand() - 0.5) * 0.2;
    const at = 0.05 + 0.35 * rand();
    const { k, pts } = stem(plan, rand, root, angle, h * (1 + 0.35 * rand()), 4, 0.1, [1], at);
    pts.slice(1).forEach((q, j) => {
      const s = (j + 1) / 4;
      const r = h * 0.2 * (0.8 + 0.4 * rand());
      plan.clumps.push({
        ...q,
        r,
        at: Math.min(0.95, at + 0.15 * (j + 1)),
        stem: k,
        s,
        bloom: true,
      });
      if (j >= 1 && rand() < 0.7) plan.fruit.push({ x: q.x, y: q.y + r * 0.5, stem: k, s, at });
    });
  }
};

/** Juniper: a dense, narrow column of needles round a hidden stem, berries deep in it. */
const juniper = (plan: ShrubPlan, rand: Rand) => {
  const { root, height: h } = plan;
  const { k } = stem(plan, rand, root, (rand() - 0.5) * 0.08, h * 0.75, 2, 0, [2, 1], 0);
  const width = h * (0.24 + 0.1 * rand());
  for (let up = 0.05; up < 0.97; up += 0.07 + 0.04 * rand()) {
    const r = Math.max(1.4, width * (1 - up) ** 0.8 * (0.8 + 0.4 * rand()));
    const x = root.x + (rand() - 0.5) * 2;
    plan.clumps.push({ x, y: root.y - h * up, r, at: up * 0.6, stem: k, s: up, bloom: false });
    if (rand() < 0.35) {
      plan.fruit.push({ x: x + (rand() - 0.5) * r, y: root.y - h * up, stem: k, s: up, at: 0 });
    }
  }
};

/** Lilac: several upright stems from one root, a rounded mass of leaves, panicles at the tips. */
const lilac = (plan: ShrubPlan, rand: Rand) => {
  const { root, height: h } = plan;
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const angle = ((i + 0.5) / n - 0.5) * 0.7 + (rand() - 0.5) * 0.15;
    const at = 0.05 * i;
    const len = h * (0.75 + 0.3 * rand());
    const { k, pts } = stem(plan, rand, root, angle, len, 3, 0.05, [2, 2, 1], at);
    pts.slice(1).forEach((q, j) => {
      const tip = j === 2;
      const r = h * 0.13 * (0.8 + 0.4 * rand()) * (tip ? 1.25 : 1);
      plan.clumps.push({
        ...q,
        r,
        at: Math.min(0.95, at + 0.2 * (j + 1)),
        stem: k,
        s: (j + 1) / 3,
        bloom: tip,
      });
    });
  }
};

/** Bilberry: a low carpet of short green stems, small leaves, blue berries late in summer. */
const bilberry = (plan: ShrubPlan, rand: Rand) => {
  const { root, height: h } = plan;
  const span = h * 4.5;
  const n = 8 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const from = { x: root.x + ((i + rand()) / n - 0.5) * span, y: root.y };
    const at = 0.4 * rand();
    const { k, pts } = stem(
      plan,
      rand,
      from,
      (rand() - 0.5) * 0.6,
      h * (0.6 + 0.4 * rand()),
      2,
      0,
      [1],
      at,
    );
    pts.slice(1).forEach((q, j) => {
      const s = (j + 1) / 2;
      plan.clumps.push({
        ...q,
        r: 1.6 + rand() * 0.9,
        at: Math.min(0.95, at + 0.3 * s),
        stem: k,
        s,
        bloom: false,
      });
      if (rand() < 0.5)
        plan.fruit.push({ x: q.x + (rand() - 0.5) * 2, y: q.y + 1, stem: k, s, at });
    });
  }
};

const GROW: Record<Shrub, (plan: ShrubPlan, rand: Rand) => void> = {
  raspberry,
  juniper,
  lilac,
  bilberry,
};

/** The full-grown `kind` rooted at `root`, about `h` tall, shaped by `seed`. */
export const planShrub = (seed: number, root: Pt, h: number, kind: Shrub): ShrubPlan => {
  const plan: ShrubPlan = { kind, root, height: h, stems: 0, pieces: [], clumps: [], fruit: [] };
  GROW[kind](plan, random(seed));
  return plan;
};

// --- Painting ---------------------------------------------------------------------------

type Dress = {
  stem: string;
  summer: string[];
  lit: string;
  autumn: string[];
  bloom?: string[];
  berry?: [string, string];
  /** How tall a clump is against its width. */
  aspect: number;
};

const DRESS: Record<Shrub, Dress> = {
  raspberry: {
    stem: "#8a4a3a",
    summer: ["#4f8a3a", "#3f7a2f", "#5a9a40"],
    lit: "#7ab85a",
    autumn: ["#c8a040", "#b8802f", "#8a7a2a"],
    bloom: ["#f2f0e6"],
    berry: ["#c8203a", "#e8586a"],
    aspect: 0.75,
  },
  juniper: {
    stem: "#5a4030",
    summer: ["#47634a", "#3a5440", "#536f52"],
    lit: "#6f8a66",
    autumn: ["#47634a", "#3a5440", "#536f52"],
    berry: ["#2e3a5a", "#6a7a9a"],
    aspect: 0.5,
  },
  lilac: {
    stem: "#6a6058",
    summer: ["#3f7a32", "#4a8a3a", "#356a2c"],
    lit: "#6aa04a",
    autumn: ["#6a8a3a", "#8a8a3a", "#4a7a32"],
    bloom: ["#9a6ac8", "#b88ae0", "#7a4aa8", "#c8a8e8"],
    aspect: 0.9,
  },
  bilberry: {
    stem: "#4f7a34",
    summer: ["#5a9a3a", "#4a8a30", "#6aaa48"],
    lit: "#88c060",
    autumn: ["#b83a2a", "#d0503a", "#8a2a2a", "#c86a2a"],
    berry: ["#2a3a6a", "#5a6aa8"],
    aspect: 0.7,
  },
};

/** How much leaf a shrub has: the juniper keeps its needles, the rest follow the trees. */
const leafiness = (kind: Shrub, look: Look) => (kind === "juniper" ? 1 : look.leaves);

/** When each kind flowers: raspberry and lilac at midsummer, lilac a little before. */
const blooming = (kind: Shrub, { k, p }: Look) =>
  kind === "lilac"
    ? (k === 3 && p > 0.8) || (k === 0 && p < 0.2)
    : kind === "raspberry" && k === 0 && p > 0.1 && p < 0.35;

/** When berries hang: raspberries late in summer, bilberries into the autumn, juniper always. */
const berried = (kind: Shrub, { k, p }: Look) =>
  kind === "juniper" ||
  (kind === "raspberry" && k === 0 && p > 0.5 && p < 0.95) ||
  (kind === "bilberry" && ((k === 0 && p > 0.65) || (k === 1 && p < 0.35)));

/** Autumn colour comes early to the bilberry, and late to the lilac. */
const turned = (kind: Shrub, h: number, { k, p }: Look) =>
  k === 1 && h < ramp(p, kind === "bilberry" ? -0.2 : kind === "lilac" ? 0.3 : 0, 0.5);

/** Paint `plan` at growth `g`, dressed for `look`, telling `part` before each part. */
export const paintShrubParts = (
  ctx: CanvasRenderingContext2D,
  plan: ShrubPlan,
  g: number,
  look: Look,
  part: (p: Part) => void,
) => {
  if (g < 0.05) return;
  const dress = DRESS[plan.kind];
  const at = grownFrom(plan, g);
  plan.pieces.forEach((p, i) => {
    if (p.at > g) return;
    const a = at(p.a);
    const b = at(p.b);
    part({ kind: "wood", i, a, b });
    const w = Math.max(1, Math.round(p.w * (0.5 + 0.5 * g)));
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(a.x + ((b.x - a.x) * k) / n - w / 2);
      const y = Math.round(a.y + ((b.y - a.y) * k) / n);
      rect(ctx, dress.stem, x, y, w, 1);
    }
  });
  const leaves = leafiness(plan.kind, look);
  const flowers = blooming(plan.kind, look);
  plan.clumps.forEach((c, i) => {
    if (c.at > g) return;
    part({ kind: "clump", i });
    const q = at(c);
    const r = c.r * (0.4 + 0.6 * g);
    const seed = i * 131 + Math.round(plan.root.x) + 7;
    const flowering = flowers && c.bloom && dress.bloom;
    clump(ctx, q.x, q.y, r, dress.aspect, seed, leaves, (h, lit) => {
      if (flowering && dress.bloom && h > (plan.kind === "lilac" ? 0.25 : 0.85)) {
        return dress.bloom[Math.floor(h * 97) % dress.bloom.length];
      }
      if (turned(plan.kind, h, look)) return dress.autumn[Math.floor(h * 97) % dress.autumn.length];
      return lit ? dress.lit : dress.summer[Math.floor(h * 97) % dress.summer.length];
    });
    if (look.snow > 0 && leaves > 0.3) cap(ctx, q.x, q.y, r, r * dress.aspect, look.snow, seed);
  });
  if (g < 0.8 || !dress.berry || !berried(plan.kind, look)) return;
  const [body, shine] = dress.berry;
  plan.fruit.forEach((f, j) => {
    // Juniper berries are few and deep in the needles; the rest show where they hang.
    if (plan.kind === "juniper" && hash(j, 5, Math.round(plan.root.x)) > 0.5) return;
    part({ kind: "fruit", i: j });
    const q = at(f);
    rect(ctx, body, q.x, q.y);
    rect(ctx, shine, q.x + (j % 2 ? 1 : -1), q.y);
  });
};
