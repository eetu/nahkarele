// Friday's trees, painted: the kinds that take a Finnish floor, how each one's wood, leaves,
// needles and fruit look in the season, and dead. A plan is a tree in scene pixels at one age
// (`growth.ts` grows them); `paintTree` paints it and can scale it from the root by growth.

import { hash, ramp, rect } from "$lib/scene/pixel";
import { mix } from "$lib/scene/sky";

import { type Conk, drawConk } from "./conks";
import type { Part } from "./posed";

export type Species =
  "birch" | "rowan" | "apple" | "oak" | "maple" | "cherry" | "plum" | "spruce" | "pine";
type Broadleaf = Exclude<Species, "spruce" | "pine">;

export const SPECIES: readonly Species[] = [
  "birch",
  "rowan",
  "apple",
  "oak",
  "maple",
  "cherry",
  "plum",
  "spruce",
  "pine",
];

type Pt = { x: number; y: number };
/** A piece of wood from `a` to `b`, `w` px thick, there once the tree is `at` grown (0..1);
 *  `dead` (0..1) once its branch has died. */
type Limb = { a: Pt; b: Pt; w: number; at: number; dead?: number };
/** Leaves on a broadleaf; a spray of needles on a spruce; a tuft of needles on a pine. */
type Clump = { x: number; y: number; r: number; at: number };

export type Plan = {
  species: Species;
  root: Pt;
  /** Full height, scene px. */
  height: number;
  limbs: Limb[];
  clumps: Clump[];
  /** A branch an owl could sit on, if one is in the room. */
  perch: Pt | null;
  /** Where apples hang, on an apple tree. */
  fruit: Pt[];
  /** Where each piece hangs (its parent piece, -1 the root, and how far along it) and which
   *  piece each clump hangs on, when the plan knows; otherwise the rig finds them. */
  parents?: { piece: number; t: number }[];
  clumpOn?: number[];
  /** Ids for the pieces and the clumps that hold as the tree grows, so each keeps its own
   *  spring and flutter from one age to the next. */
  ids?: number[];
  clumpIds?: number[];
  /** Each axis of the arch as drawn, by axis: where its pieces start along it, px, which
   *  pieces they are, and how long it is; absent where the axis isn't drawn. */
  onAxes?: ({ s: number[]; k: number[]; len: number } | undefined)[];
};

/** What the year is doing to the trees: the season (0 summer … 3 spring), how far through it,
 *  how much of a broadleaf crown is in leaf, and how much snow lies about (0..1). */
export type Look = {
  k: 0 | 1 | 2 | 3;
  p: number;
  leaves: number;
  snow: number;
  /** How long dead, 0..1: a dead tree has dropped its leaves, then its twigs, and greys. */
  dead?: number;
};

export const deciduous = (s: Species): s is Broadleaf => s !== "spruce" && s !== "pine";

const SNOW = "#f4f7fa";
const LEAVES: Record<Broadleaf, { summer: string[]; lit: string; autumn: string[] }> = {
  birch: {
    summer: ["#5f9a3a", "#6aa84a", "#4f7f33"],
    lit: "#8fc25a",
    autumn: ["#e8c33a", "#d9a441", "#f2d45c", "#c9a032"],
  },
  rowan: {
    summer: ["#3f6a2a", "#4f7f33", "#46732e"],
    lit: "#6aa84a",
    autumn: ["#c8452f", "#e07b2a", "#b8322a", "#d9612a"],
  },
  apple: {
    summer: ["#4f7f33", "#5a8a36", "#46732e"],
    lit: "#7ab648",
    autumn: ["#c9a032", "#a8823a", "#8f9a3a", "#b8923a"],
  },
  oak: {
    summer: ["#3f6a2a", "#46732e", "#3a5f28"],
    lit: "#5f9a3a",
    autumn: ["#a8742e", "#8f5a2a", "#b8823a", "#7a5226"],
  },
  maple: {
    summer: ["#4f8f33", "#5a9a3a", "#46802e"],
    lit: "#7ab648",
    autumn: ["#f2b02a", "#e8742a", "#d8442a", "#f2d040"],
  },
  cherry: {
    summer: ["#4f7f33", "#5a8a36", "#46732e"],
    lit: "#6aa84a",
    autumn: ["#c8602a", "#d88a3a", "#b8402a", "#d8a040"],
  },
  plum: {
    summer: ["#46732e", "#4f7f33", "#3f6a2a"],
    lit: "#6aa84a",
    autumn: ["#a89a3a", "#c8a040", "#8f8a3a", "#b88a3a"],
  },
};
const BIRCH_SPRING = ["#9ccc5a", "#8fc25a"];
const ROWAN_BLOSSOM = ["#f4f4ec", "#e8e6da"];
/** White, a few petals with a blush; cherry and plum flower white too, a little earlier. */
const APPLE_BLOSSOM = ["#fbf8f4", "#f2eee8", "#fbf8f4", "#f4e4e6"];
const WHITE_BLOSSOM = ["#fbf8f4", "#f2eee8", "#ffffff"];
/** A maple flowers yellow-green before its leaves. */
const MAPLE_FLOWERS = ["#c8d84a", "#b8cc3a"];
/** An oak keeps its dead leaves into the winter. */
const OAK_WINTER = ["#8a6a42", "#7a5a3a", "#9a7a4a"];
const BERRIES = ["#c8282a", "#e04030"];
const NEEDLES: Record<"spruce" | "pine", { colours: string[]; lit: string }> = {
  spruce: { colours: ["#2e4f2a", "#355a2e", "#2a4626"], lit: "#4f7a3a" },
  pine: { colours: ["#3f6a2a", "#4a7330", "#3a6028"], lit: "#6a9a40" },
};

/** The leaves a tree drops in autumn. */
export const autumnOf = (s: Species): string[] => (deciduous(s) ? LEAVES[s].autumn : []);

/** mulberry32: a stream of floats in [0, 1) from a seed. */
export const random = (seed: number) => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

/** How many fruit a tree carries: apples fall (the wood drops them), cherries and plums hang. */
export const FRUIT: Partial<Record<Species, number>> = { apple: 16, cherry: 18, plum: 12 };

/** Where a full-grown point of `plan` is while the tree is `g` grown. */
export const grownAt =
  (plan: Plan, g: number) =>
  (q: Pt): Pt => ({
    x: plan.root.x + (q.x - plan.root.x) * g,
    y: plan.root.y + (q.y - plan.root.y) * g,
  });

export const perchOf = (plan: Plan, g: number): Pt | null =>
  plan.perch && grownAt(plan, g)(plan.perch);

/** The middle of the leaves, where falling leaves start. */
export const crownOf = (plan: Plan, g: number): Pt => {
  // The leaves in the room; a crown grown out of it drops them from above.
  const seen = plan.clumps.filter((c) => c.y > -6);
  if (!seen.length) return plan.clumps.length ? { x: plan.root.x, y: -4 } : plan.root;
  const n = seen.length;
  const mid = seen.reduce((s, c) => ({ x: s.x + c.x / n, y: s.y + c.y / n }), { x: 0, y: 0 });
  return grownAt(plan, g)(mid);
};

// --- Painting ---------------------------------------------------------------------------

const BIRCH_BARK = {
  white: "#e6e2d8",
  shade: "#b8b2a6",
  mark: "#2a2622",
  rough: "#5e5850",
  twig: "#5e5550",
};

/** How high an old birch's black, fissured foot reaches, px above its root: solid up to the
 *  first, breaking up into ever fewer fissures up to the second. It comes with age, so with
 *  girth: none on a trunk up to 5 px (13 cm) across, about 0.4 m solid and 0.85 m in all at
 *  25 cm, 0.75 m and 1.6 m at 38 cm. */
const birchFoot = new WeakMap<Plan, [number, number]>();
const footOf = (plan: Plan) => {
  let foot = birchFoot.get(plan);
  if (!foot) {
    const girth = Math.max(1, ...plan.limbs.map((l) => l.w));
    const solid = Math.max(0, 3 * (girth - 5));
    foot = [solid, solid > 0 ? solid * 2 + 4 : 0];
    birchFoot.set(plan, foot);
  }
  return foot;
};

/** The colour of one pixel of wood, `up` of the way up the tree, `col` columns into `w`. */
const barkColour = (plan: Plan, x: number, y: number, col: number, w: number, up: number) => {
  switch (plan.species) {
    case "birch": {
      if (w === 1) return BIRCH_BARK.twig;
      const [solid, broken] = footOf(plan);
      const above = plan.root.y - y;
      // Black and rough at the foot, each ridge (2 px) solid to its own height; above it
      // upright fissures, each reaching its own height, most of them not far, broken here and
      // there by white, until the white has it all.
      const ridge = x >> 1;
      const rough = hash(x, y, 79) < 0.55 ? BIRCH_BARK.mark : BIRCH_BARK.rough;
      const base = solid * (0.7 + 0.3 * hash(ridge, 82));
      if (above < base) return rough;
      const reach = base + (broken - solid) * hash(ridge, 81) ** 2;
      if (above < reach && hash(x, Math.floor(above / 4), 80) < 0.85) return rough;
      if (hash(x, y, 77) < 0.16) return BIRCH_BARK.mark;
      return col === w - 1 ? BIRCH_BARK.shade : BIRCH_BARK.white;
    }
    case "rowan":
      return col === 0 && w > 1 ? "#8a7a68" : "#6e5e50";
    case "apple":
      return col === 0 && w > 1 ? "#857060" : hash(x, y, 78) < 0.2 ? "#4e4034" : "#6a5848";
    case "oak":
      // Dark and deeply furrowed, the furrows running down the trunk.
      return hash(x, 80) < 0.35 && w > 1 ? "#36302a" : col === 0 ? "#5e564e" : "#4e4640";
    case "maple":
      return col === 0 && w > 1 ? "#86827a" : "#6e6a62";
    case "cherry": {
      // Reddish and glossy, with short pale lenticels across it here and there, not rings.
      if (w > 2 && hash(y, 83) < 0.35 && hash(x >> 1, y, 84) < 0.45) return "#9a6a54";
      return col === 0 && w > 1 ? "#7e4636" : "#6a3a2e";
    }
    case "plum":
      return col === 0 && w > 1 ? "#5e4a42" : "#4a3a34";
    case "spruce":
      // Its branchlets and young shoots are all needles.
      return up > 0.85 || w === 1 ? NEEDLES.spruce.colours[2] : "#3e2c1e";
    case "pine":
      return up > 0.45 ? (col === 0 ? "#c8783e" : "#b0643a") : col === 0 ? "#76604c" : "#5e4a3a";
  }
};

/** What bark turns to, dead and weathered. */
const DEADWOOD = "#8c877e";
/** Dead needles: rust, gone once the tree is this far dead. */
const RUST = "#9a5a2a";
const NEEDLES_DROP = 0.35;

/** `ctx` with everything painted through it taken `t` of the way to rust. */
const rusted = (ctx: CanvasRenderingContext2D, t: number) =>
  new Proxy(ctx, {
    set(target, key, value) {
      if (key === "fillStyle") target.fillStyle = mix(value as string, RUST, Math.min(1, t) * 0.8);
      else Reflect.set(target, key, value);
      return true;
    },
    get(target, key) {
      const v = Reflect.get(target, key) as unknown;
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });

const wood = (
  ctx: CanvasRenderingContext2D,
  plan: Plan,
  a: Pt,
  b: Pt,
  w: number,
  look: Look,
  died = 0,
) => {
  const dead = Math.max(look.dead ?? 0, died);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  // A steep limb is thick across, a shallow one top to bottom: either way, as thick as it is.
  const steep = Math.abs(dy) >= Math.abs(dx);
  // Snow lies along the top edge of bare, shallow wood, and nowhere inside it.
  const snowy = !steep && look.snow > 0.5 && deciduous(plan.species) && look.leaves < 0.3;
  const paint = (x: number, y: number, col: number) => {
    const up = (plan.root.y - y) / Math.max(1, plan.height);
    const bark = barkColour(plan, x, y, col, w, up);
    rect(ctx, dead ? mix(bark, DEADWOOD, dead * 0.6) : bark, x, y);
  };
  for (let k = 0; k <= n; k++) {
    const cx = a.x + dx * (k / n);
    const cy = a.y + dy * (k / n);
    if (steep) {
      const x0 = Math.round(cx - w / 2);
      const y = Math.round(cy);
      for (let col = 0; col < w; col++) paint(x0 + col, y, col);
    } else {
      const x = Math.round(cx);
      const y0 = Math.round(cy - w / 2);
      for (let row = 0; row < w; row++) paint(x, y0 + row, row);
      if (snowy && hash(x, y0, 5) < look.snow) rect(ctx, SNOW, x, y0 - 1);
    }
  }
};

const EARTH = ["#4a3a2a", "#54422f", "#3e3024"];
const ROOTS = "#6e5a44";
const STONE = "#8a877e";

/**
 * What a tree pulls up with it when it goes over: the plate of its roots and the earth in
 * them, a ragged bowl under the ground at its foot while it stands, roots poking out round
 * the rim and a stone or two in it.
 */
export const paintRootPlate = (ctx: CanvasRenderingContext2D, plan: Plan) => {
  const { x: cx, y: top } = plan.root;
  // As wide as a few trunks: a big tree brings up a big plate.
  const trunk = Math.max(1, ...plan.limbs.map((l) => l.w));
  const r = Math.max(4, Math.min(18, trunk * 1.4 + 3));
  const depth = r * 0.75;
  for (let y = Math.round(top) + 1; y <= top + depth; y++) {
    const v = (y - top) / depth;
    const half = r * Math.sqrt(Math.max(0, 1 - v * v)) * (0.85 + 0.3 * hash(y, cx, 91));
    const x0 = Math.round(cx - half);
    const x1 = Math.round(cx + half);
    for (let x = x0; x <= x1; x++) {
      const h = hash(x, y, 92);
      rect(ctx, h < 0.05 ? STONE : h < 0.2 ? ROOTS : EARTH[Math.floor(hash(x, y, 93) * 3)], x, y);
    }
    // Roots torn off where the plate ends.
    for (const [x, out] of [
      [x0, -1],
      [x1, 1],
    ]) {
      const n = Math.floor(hash(y, x, 94) * 4) - 1;
      for (let k = 1; k <= n; k++) rect(ctx, ROOTS, x + out * k, y + (k > 1 && v > 0.5 ? 1 : 0));
    }
  }
};

/** The colour of one leaf pixel in the season. */
const leafColour = (species: Broadleaf, h: number, lit: boolean, { k, p }: Look) => {
  const leaves = LEAVES[species];
  if (k === 1 && h < ramp(p, 0, 0.55))
    return leaves.autumn[Math.floor(h * 97) % leaves.autumn.length];
  if (k === 3 && species === "birch" && h > ramp(p, 0.5, 1)) {
    return BIRCH_SPRING[Math.floor(h * 97) % BIRCH_SPRING.length];
  }
  if (k === 3 && species === "rowan" && h > ramp(p, 0.45, 0.95)) {
    return ROWAN_BLOSSOM[Math.floor(h * 97) % ROWAN_BLOSSOM.length];
  }
  // An apple tree flowers all over, then the petals go and the leaves take over.
  if (k === 3 && species === "apple" && h > ramp(p, 0.25, 0.6) && h < 1 - ramp(p, 0.75, 1)) {
    return APPLE_BLOSSOM[Math.floor(h * 97) % APPLE_BLOSSOM.length];
  }
  if (
    k === 3 &&
    (species === "cherry" || species === "plum") &&
    h > ramp(p, 0.1, 0.45) &&
    h < 1 - ramp(p, 0.55, 0.85)
  ) {
    return WHITE_BLOSSOM[Math.floor(h * 97) % WHITE_BLOSSOM.length];
  }
  if (k === 3 && species === "maple" && h > ramp(p, 0.2, 0.6) && h < 1 - ramp(p, 0.55, 0.9)) {
    return MAPLE_FLOWERS[Math.floor(h * 97) % MAPLE_FLOWERS.length];
  }
  if (k === 2 && species === "oak") return OAK_WINTER[Math.floor(h * 97) % OAK_WINTER.length];
  return lit ? leaves.lit : leaves.summer[Math.floor(h * 97) % leaves.summer.length];
};

/**
 * A clump: a dithered blob, lit from the upper left, `aspect` as tall as it is wide, its edge
 * wandering in and out around it so no two read as the same stamped oval. Thinned to `density`
 * from the outside in.
 */
export const clump = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  aspect: number,
  seed: number,
  density: number,
  colour: (h: number, lit: boolean) => string,
) => {
  if (r < 0.8 || density <= 0) return;
  const ry = r * aspect;
  for (let y = Math.floor(cy - ry * 1.2); y <= Math.ceil(cy + ry * 1.2); y++) {
    for (let x = Math.floor(cx - r * 1.2); x <= Math.ceil(cx + r * 1.2); x++) {
      const dx = (x - cx) / r;
      const dy = (y - cy) / ry;
      const sector = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 7);
      const edge = 0.8 + 0.35 * hash(seed, sector);
      const d = (dx * dx + dy * dy) / (edge * edge);
      if (d > 1) continue;
      const h = hash(x, y, seed);
      if (d > 0.7 && h < 0.35) continue;
      if (hash(y, x, seed) > density * (1.15 - d * 0.3)) continue;
      rect(ctx, colour(h, dy < -0.25 && dx < 0.2 && h > 0.55), x, y);
    }
  }
};

/** Snow along the top edge of a clump. */
export const cap = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  ry: number,
  snow: number,
  seed: number,
) => {
  for (let dx = -Math.floor(r); dx <= Math.floor(r); dx++) {
    if (hash(seed, dx, 9) > snow * 0.9) continue;
    const y = cy - ry * Math.sqrt(Math.max(0, 1 - (dx / r) ** 2));
    rect(ctx, SNOW, Math.round(cx) + dx, Math.round(y) - 1);
  }
};

/** How tall a leaf clump is against its width: feathery rowan, round birch, domed oak. */
const ASPECT: Record<Broadleaf, number> = {
  birch: 1,
  rowan: 0.65,
  apple: 0.85,
  oak: 0.85,
  maple: 0.9,
  cherry: 0.9,
  plum: 0.95,
};

/** Rowan berries: late summer to early winter, longer than the leaves. */
const berried = ({ k, p }: Look) => (k === 0 && p > 0.6) || k === 1 || (k === 2 && p < 0.35);

/** Paint `plan` at growth `g` (0..1) into `ctx`, dressed for the season `look`. */
export const paintTree = (ctx: CanvasRenderingContext2D, plan: Plan, g: number, look: Look) =>
  paintTreeParts(ctx, plan, g, look, () => {});

/** `paintTree`, telling `part` before each part is painted, so a caller can keep them apart;
 *  with the bracket fungi `conks` on its wood. */
export const paintTreeParts = (
  ctx: CanvasRenderingContext2D,
  plan: Plan,
  g: number,
  look: Look,
  part: (p: Part) => void,
  conks: Conk[] = [],
) => {
  const at = grownAt(plan, g);
  if (g < 0.15) {
    part({ kind: "still" });
    // A sapling: a green stem and two leaves.
    const top = { x: plan.root.x, y: plan.root.y - plan.height * g };
    for (let y = Math.round(top.y); y <= plan.root.y; y++) rect(ctx, "#4f7f33", plan.root.x, y);
    rect(ctx, "#5f9a3a", plan.root.x - 2, Math.round(top.y) + 1, 2, 1);
    rect(ctx, "#5f9a3a", plan.root.x + 1, Math.round(top.y) + 2, 2, 1);
    return;
  }
  // Wood first, the oldest out to the youngest, then what grows on it.
  plan.limbs.forEach((l, i) => {
    if (l.at > g) return;
    // Dead a while, the twigs go first.
    if ((look.dead ?? 0) > 0.5 && l.w <= 1 && hash(i, 17, Math.round(plan.root.x)) < look.dead!)
      return;
    const a = at(l.a);
    const b = at(l.b);
    part({ kind: "wood", i, a, b });
    wood(ctx, plan, a, b, Math.max(1, Math.round(l.w * (0.4 + 0.6 * g))), look, l.dead);
  });
  // Conks out from the edge of the wood they grow on, moving with that piece as its bark does.
  for (const c of conks) {
    const l = plan.limbs[c.piece];
    if (!l || l.at > g) continue;
    const a = at(l.a);
    const b = at(l.b);
    part({ kind: "wood", i: c.piece, a, b });
    const w = Math.max(1, Math.round(l.w * (0.4 + 0.6 * g)));
    const cx = a.x + (b.x - a.x) * c.t;
    const cy = a.y + (b.y - a.y) * c.t;
    const left = Math.round(cx - w / 2);
    drawConk(ctx, c.side > 0 ? left + w : left - 1, Math.round(cy - c.tall * 0.4), c);
  }
  // A dead broadleaf stays bare; a dead conifer rusts, then drops its needles.
  const dead = look.dead ?? 0;
  if (dead && (deciduous(plan.species) || dead >= NEEDLES_DROP)) return;
  const needles = dead ? rusted(ctx, dead / NEEDLES_DROP) : ctx;
  plan.clumps.forEach((c, i) => {
    if (c.at > g) return;
    part({ kind: "clump", i });
    const q = at(c);
    const r = c.r * g;
    const seed = i * 131 + Math.round(plan.root.x);
    if (plan.species === "spruce") {
      // A spray of needles, darker in towards the trunk, a few strands hanging from it.
      const { colours, lit } = NEEDLES.spruce;
      const near = 1 - Math.min(1, Math.abs(q.x - plan.root.x) / 36);
      clump(needles, q.x, q.y, r, 0.55, seed, 1, (h, l) =>
        h < near * 0.6 ? colours[2] : l ? lit : colours[Math.floor(h * 97) % 3],
      );
      for (let k = 0; k < 3; k++) {
        if (hash(seed, k, 14) < 0.4) continue;
        const sx = Math.round(q.x + (hash(seed, k, 15) - 0.5) * r * 1.4);
        const drop = 1 + Math.floor(hash(seed, k, 16) * 3);
        rect(needles, colours[2], sx, Math.round(q.y + r * 0.55), 1, drop);
      }
      if (look.snow > 0) cap(ctx, q.x, q.y, r, r * 0.55, look.snow, seed);
    } else if (plan.species === "pine") {
      const { colours, lit } = NEEDLES.pine;
      clump(needles, q.x, q.y, r, 0.45, seed, 1, (h, l) =>
        l ? lit : colours[Math.floor(h * 97) % 3],
      );
      if (look.snow > 0) cap(ctx, q.x, q.y, r, r * 0.45, look.snow, seed);
    } else {
      const species = plan.species;
      const leaves = species === "oak" && look.k === 2 ? 0.3 : look.leaves;
      clump(ctx, q.x, q.y, r, ASPECT[species], seed, leaves, (h, l) =>
        leafColour(species, h, l, look),
      );
      if (species === "rowan" && berried(look) && hash(seed, 3) < 0.6) {
        const bx = Math.round(q.x + (hash(seed, 4) - 0.5) * r);
        const by = Math.round(q.y + hash(seed, 5) * r * 0.4);
        rect(ctx, BERRIES[0], bx, by, 2, 1);
        rect(ctx, BERRIES[1], bx, by + 1);
      }
    }
  });
  // Cherries and plums hang on the tree in their season; apples are the wood's to drop.
  if (g < 0.9 || look.dead) return;
  const cherries = plan.species === "cherry" && look.k === 0 && look.p > 0.45 && look.p < 0.95;
  const plums =
    plan.species === "plum" && ((look.k === 0 && look.p > 0.8) || (look.k === 1 && look.p < 0.4));
  if (!cherries && !plums) return;
  plan.fruit.forEach((f, j) => {
    part({ kind: "fruit", i: j });
    const q = at(f);
    const x = Math.round(q.x);
    const y = Math.round(q.y);
    if (cherries) {
      rect(ctx, "#a8102a", x, y);
      rect(ctx, "#d8303a", x + 1 + (j % 2), y + (j % 2));
    } else {
      rect(ctx, "#5a2a6a", x, y, 2, 2);
      rect(ctx, "#8a6aa8", x, y);
    }
  });
};

// --- Apples -----------------------------------------------------------------------------

/** How apples hang in the season: none until early summer, small and green, then full and
 *  ripe from late summer through the autumn; gone by winter. */
export const appleOnTree = ({ k, p }: Look): { size: 1 | 2; ripe: boolean } | null => {
  if (k === 0) return p < 0.15 ? null : { size: p < 0.5 ? 1 : 2, ripe: p > 0.8 };
  return k === 1 ? { size: 2, ripe: true } : null;
};

/** One apple. A third of them are the pale Valkea kuulas, the rest red. */
export const drawApple = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: 1 | 2,
  ripe: boolean,
  j: number,
) => {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const pale = hash(j, 11) < 0.33;
  const body = !ripe ? "#8fbf3a" : pale ? "#e4d88a" : "#c8282a";
  rect(ctx, body, x0, y0, size, size);
  if (size === 2) rect(ctx, !ripe ? "#b8df6a" : pale ? "#f8f0c0" : "#f08070", x0, y0);
};

/** Apples as they hang in the season, for a tree drawn on its own (the wood drops them),
 *  each `moved` as far as its branch has. */
export const paintFruit = (
  ctx: CanvasRenderingContext2D,
  plan: Plan,
  g: number,
  look: Look,
  moved?: Pt[],
) => {
  const on = appleOnTree(look);
  if (plan.species !== "apple" || !on || g < 0.9) return;
  const at = grownAt(plan, g);
  plan.fruit.forEach((f, j) => {
    const q = at(f);
    const d = moved?.[j] ?? { x: 0, y: 0 };
    drawApple(ctx, q.x + Math.round(d.x), q.y + Math.round(d.y), on.size, on.ripe, j);
  });
};
