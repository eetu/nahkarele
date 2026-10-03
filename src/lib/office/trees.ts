// Friday's trees, grown from a seed: every friday a different stand of what takes a Finnish
// floor. A plan is the full-grown tree in scene pixels; `paintTree` scales it from the root by
// growth and lets limbs and leaves appear in the order they grew.

import { SCENE_W } from "./engine";
import { hash, ramp, rect } from "./pixel";

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
/** A piece of wood from `a` to `b`, `w` px thick, there once the tree is `at` grown (0..1). */
type Limb = { a: Pt; b: Pt; w: number; at: number };
/** Leaves on a broadleaf; a layer of boughs on a spruce; a tuft of needles on a pine. */
type Clump = { x: number; y: number; r: number; at: number };

export type Plan = {
  species: Species;
  root: Pt;
  /** Full height, scene px. */
  height: number;
  limbs: Limb[];
  clumps: Clump[];
  /** A branch an owl could sit on. */
  perch: Pt;
  /** Where apples hang, on an apple tree. */
  fruit: Pt[];
};

/** What the year is doing to the trees: the season (0 summer … 3 spring), how far through it,
 *  how much of a broadleaf crown is in leaf, and how much snow lies about (0..1). */
export type Look = { k: 0 | 1 | 2 | 3; p: number; leaves: number; snow: number };

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
const random = (seed: number) => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

/** `len` from `p` at `angle` radians off vertical (positive leans right). */
const ahead = (p: Pt, angle: number, len: number): Pt => ({
  x: p.x + Math.sin(angle) * len,
  y: p.y - Math.cos(angle) * len,
});

type Raw = { limbs: Limb[]; clumps: Clump[]; forks: Pt[] };
type Rand = () => number;

const empty = (): Raw => ({ limbs: [], clumps: [], forks: [] });

type LimbShape = {
  pieces: number;
  /** Turn per piece, radians, away from vertical (an arch out and down); negative turns up. */
  bend: number;
  /** Random turn per piece, radians. */
  wander: number;
  /** Width of each piece, or of all of them. */
  widths: number | number[];
};

/** A limb from `from` at `angle` (radians off vertical, negative leans left), `len` long, in
 *  pieces that turn as `shape` says. Returns the points along it, `from` first. */
const limb = (
  out: Raw,
  rand: Rand,
  from: Pt,
  angle: number,
  len: number,
  at: number,
  shape: LimbShape,
) => {
  const pts = [from];
  const side = Math.sign(angle) || 1;
  let a = angle;
  for (let k = 0; k < shape.pieces; k++) {
    a += side * shape.bend + (rand() - 0.5) * shape.wander;
    const q = ahead(pts[k], a, len / shape.pieces);
    const w = Array.isArray(shape.widths) ? (shape.widths[k] ?? 1) : shape.widths;
    out.limbs.push({ a: pts[k], b: q, w, at });
    pts.push(q);
  }
  return pts;
};

/** The point `share` (0..1) of the way along a run of points. */
const along = (pts: Pt[], share: number): Pt => {
  const t = Math.min(0.999, Math.max(0, share)) * (pts.length - 1);
  const k = Math.floor(t);
  const u = t - k;
  return {
    x: pts[k].x + (pts[k + 1].x - pts[k].x) * u,
    y: pts[k].y + (pts[k + 1].y - pts[k].y) * u,
  };
};

/**
 * Silver birch: a slender stem to near the top; main branches spread from it, steeper higher
 * up, in a loose oval crown; their thin twigs grow out, then turn down and hang in long arcs,
 * small leaves all along them.
 */
const birch = (rand: Rand, root: Pt, h: number): Raw => {
  const out = empty();
  const leaf = 2.1 * (h / 90);
  const stem = limb(out, rand, root, (rand() - 0.5) * 0.06, h * 0.92, 0, {
    pieces: 8,
    bend: 0,
    wander: 0.07,
    widths: [3, 3, 3, 2, 2, 2, 1, 1],
  });
  const base = 0.28 + 0.1 * rand();
  const n = 9 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const from = along(stem, base + (0.94 - base) * f);
    const side = (i % 2 ? 1 : -1) * (rand() < 0.15 ? -1 : 1);
    const angle = side * (0.8 - 0.4 * f + (rand() - 0.5) * 0.25);
    const len = h * 0.3 * Math.sin(Math.PI * (0.15 + 0.8 * f)) ** 0.8 * (0.75 + 0.5 * rand());
    const at = 0.12 + 0.45 * f;
    out.forks.push(from);
    const pts = limb(out, rand, from, angle, len, at, {
      pieces: 3,
      bend: 0.18,
      wander: 0.15,
      widths: f < 0.4 ? [2, 1, 1] : 1,
    });
    for (let k = 1; k < pts.length; k++) {
      if (rand() < 0.2) continue;
      const twig = limb(
        out,
        rand,
        pts[k],
        side * (1.6 + 0.3 * rand()),
        h * (0.08 + 0.07 * rand()),
        at + 0.15,
        {
          pieces: 3,
          bend: 0.35,
          wander: 0.1,
          widths: 1,
        },
      );
      for (const q of twig.slice(1)) {
        out.clumps.push({
          x: q.x,
          y: q.y,
          r: leaf * (0.8 + 0.5 * rand()),
          at: Math.min(0.95, at + 0.25),
        });
      }
    }
    const tip = pts[pts.length - 1];
    out.clumps.push({ x: tip.x, y: tip.y, r: leaf * 1.2, at: Math.min(0.95, at + 0.2) });
  }
  const top = stem[stem.length - 1];
  out.clumps.push({ x: top.x, y: top.y + 1, r: leaf * 1.3, at: 0.6 });
  return out;
};

/**
 * How a scaffold tree grows: a trunk (share of height) that splits into main limbs, between
 * `limbs` of them, fanned up to `span` radians off vertical; `reach` is their length (share of
 * height, the wider ones longer); `rise` turns them per piece (negative: up at the ends);
 * `wander` makes them gnarled; `shoots` is the chance of a leafy shoot at each point along them.
 */
type Scaffold = {
  trunk: number;
  limbs: [number, number];
  span: number;
  reach: number;
  rise: number;
  wander: number;
  leaf: number;
  shoots: number;
};

const scaffolded =
  (sh: Scaffold) =>
  (rand: Rand, root: Pt, h: number): Raw => {
    const out = empty();
    const leaf = sh.leaf * (h / 80);
    const trunk = limb(out, rand, root, (rand() - 0.5) * 0.15, h * sh.trunk, 0, {
      pieces: 2,
      bend: 0,
      wander: sh.wander * 0.5,
      widths: 3,
    });
    const head = trunk[trunk.length - 1];
    const n = sh.limbs[0] + Math.floor(rand() * (sh.limbs[1] - sh.limbs[0] + 1));
    for (let i = 0; i < n; i++) {
      const angle = -sh.span + (2 * sh.span * (i + 0.5)) / n + (rand() - 0.5) * 0.25;
      const len = h * sh.reach * (0.8 + (0.4 * Math.abs(angle)) / sh.span) * (0.85 + 0.3 * rand());
      const pts = limb(out, rand, head, angle, len, 0.12, {
        pieces: 3,
        bend: sh.rise,
        wander: sh.wander,
        widths: [2, 2, 1],
      });
      out.forks.push(pts[1]);
      for (let k = 1; k < pts.length; k++) {
        // Leaves along the limb, and on the shoots that rise off it.
        out.clumps.push({
          x: pts[k].x,
          y: pts[k].y - 1,
          r: leaf * (0.8 + 0.4 * rand()),
          at: 0.5 + 0.1 * k,
        });
        if (rand() > sh.shoots) continue;
        const shoot = limb(
          out,
          rand,
          pts[k],
          angle * 0.3 + (rand() - 0.5) * 0.5,
          h * (0.08 + 0.1 * rand()),
          0.3 + 0.1 * k,
          {
            pieces: 2,
            bend: 0,
            wander: 0.3,
            widths: 1,
          },
        );
        const end = shoot[shoot.length - 1];
        out.clumps.push({
          x: end.x,
          y: end.y,
          r: leaf * (0.7 + 0.4 * rand()),
          at: 0.55 + 0.25 * rand(),
        });
      }
    }
    return out;
  };

/**
 * How a forking tree grows: one stem, or two or three with chance `multi`, of `trunk` share of
 * height, forking `depth` times; each fork leans `spread` out and is pulled back toward the
 * vertical by `lift` of its parent's lean, which keeps the crown oval instead of flat.
 */
type Fork = {
  multi: number;
  trunk: number;
  spread: number;
  lift: number;
  depth: number;
  leaf: number;
};

const forked =
  (sh: Fork) =>
  (rand: Rand, root: Pt, h: number): Raw => {
    const out = empty();
    const leaf = sh.leaf * (h / 80);
    const grow = (from: Pt, angle: number, len: number, w: number, depth: number, at: number) => {
      const pts = limb(out, rand, from, angle, len, at, {
        pieces: depth === 0 ? 3 : 2,
        bend: 0,
        wander: 0.3,
        widths: w,
      });
      const p = pts[pts.length - 1];
      if (depth <= 1) out.forks.push(p);
      const tip = depth >= sh.depth || len < 4;
      if (depth >= 1) {
        const r = leaf * (0.7 + 0.5 * rand()) * (tip ? 1.1 : 0.85);
        out.clumps.push({ x: p.x, y: p.y, r, at: Math.min(0.95, at + 0.12) });
      }
      if (tip) return;
      const n = rand() < 0.35 ? 3 : 2;
      for (let c = 0; c < n; c++) {
        const side = n === 2 ? c * 2 - 1 : c - 1;
        const turn = side * sh.spread * (0.6 + 0.7 * rand()) - angle * sh.lift;
        grow(
          p,
          angle + turn,
          len * (0.62 + 0.2 * rand()),
          Math.max(1, w * 0.65),
          depth + 1,
          at + 0.15,
        );
      }
    };
    const stems = rand() < sh.multi ? (rand() < 0.3 ? 3 : 2) : 1;
    for (let k = 0; k < stems; k++) {
      const angle =
        stems === 1 ? (rand() - 0.5) * 0.15 : (k - (stems - 1) / 2) * 0.3 + (rand() - 0.5) * 0.1;
      grow(root, angle, h * sh.trunk * (0.9 + 0.2 * rand()), stems > 1 ? 2 : 3, 0, 0);
    }
    return out;
  };

/** Rowan: often several stems, level-to-ascending branches, a broad loose oval of feathers. */
const rowan = forked({ multi: 0.5, trunk: 0.3, spread: 0.42, lift: 0.3, depth: 3, leaf: 4 });

/** Norway maple: one straight stem, ascending branches, a dense rounded crown. */
const maple = forked({ multi: 0, trunk: 0.36, spread: 0.5, lift: 0.2, depth: 4, leaf: 4.6 });

/** Apple: a short trunk, four or five scaffolds just above level, gnarled, up at the ends. */
const apple = scaffolded({
  trunk: 0.2,
  limbs: [4, 5],
  span: 1.35,
  reach: 0.34,
  rise: -0.05,
  wander: 0.45,
  leaf: 4.6,
  shoots: 0.8,
});

/** Pedunculate oak: a short thick trunk, massive crooked limbs spreading wide, a broad dome. */
const oak = scaffolded({
  trunk: 0.32,
  limbs: [3, 5],
  span: 1.4,
  reach: 0.4,
  rise: 0.04,
  wander: 0.7,
  leaf: 6,
  shoots: 0.85,
});

/** Cherry: a small tree, ascending scaffolds, a rounded crown. */
const cherry = scaffolded({
  trunk: 0.28,
  limbs: [3, 4],
  span: 1,
  reach: 0.36,
  rise: -0.06,
  wander: 0.3,
  leaf: 4.4,
  shoots: 0.8,
});

/** Plum: steeper scaffolds than the cherry, an upright oval. */
const plum = scaffolded({
  trunk: 0.3,
  limbs: [3, 4],
  span: 0.55,
  reach: 0.42,
  rise: -0.04,
  wander: 0.3,
  leaf: 3.6,
  shoots: 0.6,
});

/**
 * Norway spruce: a strong straight leader; level whorls of boughs from near the ground to the
 * top, widest at the bottom, that sag and sweep up at the tips, branchlets hanging from them.
 */
const spruce = (rand: Rand, root: Pt, h: number): Raw => {
  const out = empty();
  const lean = (rand() - 0.5) * 0.04;
  const top = { x: root.x + lean * h, y: root.y - h };
  out.limbs.push({ a: root, b: top, w: 2, at: 0 });
  const skirt = h * (0.03 + 0.04 * rand());
  const width = h * (0.2 + 0.06 * rand());
  // Bottom up, so each layer's tips fall over the one below.
  for (let y = root.y - skirt; y > top.y + 3; y -= 2 + Math.floor(rand() * 2)) {
    const f = (y - top.y) / (root.y - skirt - top.y);
    const x = root.x + (root.y - y) * lean;
    const r = Math.max(1.5, width * f ** 0.9 * (0.85 + 0.3 * rand()));
    out.clumps.push({ x, y, r, at: 0.05 + 0.25 * rand() });
    out.forks.push({ x: x + r * 0.7, y: y + 1 });
  }
  return out;
};

/**
 * Scots pine: a crooked stem that has shed its lower limbs (a few dead stubs show where), then
 * a high, irregular, flat-topped crown of gnarled near-level limbs carrying flat plates of
 * needles.
 */
const pine = (rand: Rand, root: Pt, h: number): Raw => {
  const out = empty();
  const stem = limb(out, rand, root, (rand() - 0.5) * 0.1, h * 0.8, 0, {
    pieces: 7,
    bend: 0,
    wander: 0.14,
    widths: [3, 3, 3, 2, 2, 2, 2],
  });
  for (let i = 0; i < 3; i++) {
    const from = along(stem, 0.3 + 0.25 * rand());
    limb(out, rand, from, (rand() < 0.5 ? -1 : 1) * (1.3 + 0.3 * rand()), 2 + 2 * rand(), 0.4, {
      pieces: 1,
      bend: 0,
      wander: 0,
      widths: 1,
    });
  }
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const from = along(stem, 0.62 + 0.36 * f);
    const side = i % 2 ? 1 : -1;
    const angle = side * (1.35 - 0.45 * f + (rand() - 0.5) * 0.3);
    const len = h * (0.22 - 0.1 * f) * (0.7 + 0.6 * rand());
    const pts = limb(out, rand, from, angle, len, 0.25 + 0.3 * f, {
      pieces: 3,
      bend: -0.12,
      wander: 0.4,
      widths: f < 0.5 ? [2, 1, 1] : 1,
    });
    out.forks.push(from);
    for (const q of pts.slice(2)) {
      out.clumps.push({
        x: q.x,
        y: q.y - 1,
        r: h * (0.05 + 0.03 * rand()),
        at: 0.4 + 0.3 * rand(),
      });
    }
  }
  const top = stem[stem.length - 1];
  out.clumps.push({ x: top.x, y: top.y - 1, r: h * 0.09, at: 0.3 });
  return out;
};

const GROW: Record<Species, (rand: Rand, root: Pt, h: number) => Raw> = {
  birch,
  rowan,
  apple,
  oak,
  maple,
  cherry,
  plum,
  spruce,
  pine,
};

/** How many fruit a tree carries: apples fall (the wood drops them), cherries and plums hang. */
const FRUIT: Partial<Record<Species, number>> = { apple: 16, cherry: 18, plum: 12 };

/** The full-grown `species` rooted at `root`, about `h` tall, shaped by `seed`. */
export const planTree = (seed: number, root: Pt, h: number, species: Species): Plan => {
  const rand = random(seed);
  const raw = GROW[species](rand, root, h);
  // A crown that would leave the top or the sides of the room is the whole tree drawn smaller.
  let top = root.y;
  let left = root.x;
  let right = root.x;
  for (const l of raw.limbs) {
    for (const q of [l.a, l.b]) {
      top = Math.min(top, q.y);
      left = Math.min(left, q.x);
      right = Math.max(right, q.x);
    }
  }
  for (const c of raw.clumps) {
    top = Math.min(top, c.y - c.r);
    left = Math.min(left, c.x - c.r);
    right = Math.max(right, c.x + c.r);
  }
  const k = Math.min(
    1,
    (root.y - 6) / Math.max(1, root.y - top),
    (root.x - 2) / Math.max(1, root.x - left),
    (SCENE_W - 2 - root.x) / Math.max(1, right - root.x),
  );
  const fit = (q: Pt): Pt => ({ x: root.x + (q.x - root.x) * k, y: root.y + (q.y - root.y) * k });
  const height = (root.y - top) * k;
  // The owl's branch: the fork nearest three fifths of the way up.
  const want = root.y - height * 0.6;
  const perch = raw.forks
    .map(fit)
    .reduce((best, q) => (Math.abs(q.y - want) < Math.abs(best.y - want) ? q : best), {
      x: root.x,
      y: want,
    });
  // Fruit hangs under the outer clumps, one to most of them.
  const fruit = raw.clumps
    .filter((c) => c.at > 0.5 && rand() < 0.75)
    .slice(0, FRUIT[species] ?? 0)
    .map((c) => fit({ x: c.x + (rand() - 0.5) * c.r, y: c.y + rand() * c.r * 0.6 }));
  return {
    species,
    root,
    height,
    limbs: raw.limbs.map((l) => ({ ...l, a: fit(l.a), b: fit(l.b) })),
    clumps: raw.clumps.map((c) => ({ ...fit(c), r: c.r * k, at: c.at })),
    perch,
    fruit,
  };
};

/** Where a full-grown point of `plan` is while the tree is `g` grown. */
export const grownAt =
  (plan: Plan, g: number) =>
  (q: Pt): Pt => ({
    x: plan.root.x + (q.x - plan.root.x) * g,
    y: plan.root.y + (q.y - plan.root.y) * g,
  });

export const perchOf = (plan: Plan, g: number): Pt => grownAt(plan, g)(plan.perch);

/** The middle of the leaves, where falling leaves start. */
export const crownOf = (plan: Plan, g: number): Pt => {
  const n = Math.max(1, plan.clumps.length);
  const mid = plan.clumps.reduce((s, c) => ({ x: s.x + c.x / n, y: s.y + c.y / n }), {
    x: 0,
    y: 0,
  });
  return grownAt(plan, g)(plan.clumps.length ? mid : plan.root);
};

// --- Painting ---------------------------------------------------------------------------

const BIRCH_BARK = { white: "#e6e2d8", shade: "#b8b2a6", mark: "#2a2622", twig: "#5e5550" };

/** The colour of one pixel of wood, `up` of the way up the tree, `col` columns into `w`. */
const barkColour = (plan: Plan, x: number, y: number, col: number, w: number, up: number) => {
  switch (plan.species) {
    case "birch":
      if (w === 1) return BIRCH_BARK.twig;
      if (up < 0.1) return hash(x, y, 79) < 0.55 ? BIRCH_BARK.mark : "#5e5850";
      if (hash(x, y, 77) < 0.16) return BIRCH_BARK.mark;
      return col === w - 1 ? BIRCH_BARK.shade : BIRCH_BARK.white;
    case "rowan":
      return col === 0 && w > 1 ? "#8a7a68" : "#6e5e50";
    case "apple":
      return col === 0 && w > 1 ? "#857060" : hash(x, y, 78) < 0.2 ? "#4e4034" : "#6a5848";
    case "oak":
      // Dark and deeply furrowed, the furrows running down the trunk.
      return hash(x, 80) < 0.35 && w > 1 ? "#36302a" : col === 0 ? "#5e564e" : "#4e4640";
    case "maple":
      return col === 0 && w > 1 ? "#86827a" : "#6e6a62";
    case "cherry":
      // Reddish, banded with lenticels.
      return y % 3 === 0 && w > 1 ? "#8a5a48" : "#6a3a2e";
    case "plum":
      return col === 0 && w > 1 ? "#5e4a42" : "#4a3a34";
    case "spruce":
      return up > 0.85 ? NEEDLES.spruce.colours[0] : "#3e2c1e";
    case "pine":
      return up > 0.45 ? (col === 0 ? "#c8783e" : "#b0643a") : col === 0 ? "#76604c" : "#5e4a3a";
  }
};

const wood = (ctx: CanvasRenderingContext2D, plan: Plan, a: Pt, b: Pt, w: number, look: Look) => {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  // Snow lies along the top of bare, level-ish wood.
  const snowy =
    look.snow > 0.5 &&
    deciduous(plan.species) &&
    look.leaves < 0.3 &&
    Math.abs(b.y - a.y) < Math.abs(b.x - a.x) * 1.5;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x0 = Math.round(a.x + (b.x - a.x) * t - w / 2);
    const y = Math.round(a.y + (b.y - a.y) * t);
    const up = (plan.root.y - y) / Math.max(1, plan.height);
    for (let col = 0; col < w; col++)
      rect(ctx, barkColour(plan, x0 + col, y, col, w, up), x0 + col, y);
    if (snowy && hash(x0, y, 5) < look.snow) rect(ctx, SNOW, x0, y - 1, w, 1);
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
const clump = (
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
const cap = (
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

/**
 * One whorl of spruce boughs. Low and middle boughs sag, then sweep up at the tip; the high
 * ones rise all the way out. Branchlets hang under the middle of each.
 */
const bough = (
  ctx: CanvasRenderingContext2D,
  c: Clump,
  r: number,
  up: number,
  look: Look,
  seed: number,
) => {
  const half = Math.max(1, Math.round(r));
  const { colours, lit } = NEEDLES.spruce;
  for (let dx = -half; dx <= half; dx++) {
    const f = Math.abs(dx) / half;
    const sag = up < 0.65 ? Math.round(f * 2.2 - Math.max(0, f - 0.7) * 7) : -Math.round(f * 1.5);
    const thick = f > 0.85 ? 1 : 2;
    const x = Math.round(c.x) + dx;
    const y0 = Math.round(c.y) + sag - 1;
    for (let k = 0; k < thick; k++) {
      const h = hash(x, y0 + k, seed);
      rect(ctx, k === 0 && dx < 0 && h > 0.45 ? lit : colours[Math.floor(h * 97) % 3], x, y0 + k);
    }
    if (f > 0.2 && f < 0.85 && hash(x, seed, 12) < 0.5) {
      rect(ctx, colours[2], x, y0 + thick, 1, 1 + Math.floor(hash(x, seed, 13) * 2));
    }
    if (look.snow > 0 && hash(seed, dx, 7) < look.snow * 0.9) rect(ctx, SNOW, x, y0 - 1);
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
export const paintTree = (ctx: CanvasRenderingContext2D, plan: Plan, g: number, look: Look) => {
  const at = grownAt(plan, g);
  if (g < 0.15) {
    // A sapling: a green stem and two leaves.
    const top = { x: plan.root.x, y: plan.root.y - plan.height * g };
    for (let y = Math.round(top.y); y <= plan.root.y; y++) rect(ctx, "#4f7f33", plan.root.x, y);
    rect(ctx, "#5f9a3a", plan.root.x - 2, Math.round(top.y) + 1, 2, 1);
    rect(ctx, "#5f9a3a", plan.root.x + 1, Math.round(top.y) + 2, 2, 1);
    return;
  }
  // Wood first, the oldest out to the youngest, then what grows on it.
  for (const l of plan.limbs) {
    if (l.at > g) continue;
    wood(ctx, plan, at(l.a), at(l.b), Math.max(1, Math.round(l.w * (0.4 + 0.6 * g))), look);
  }
  plan.clumps.forEach((c, i) => {
    if (c.at > g) return;
    const q = at(c);
    const r = c.r * g;
    const seed = i * 131 + Math.round(plan.root.x);
    if (plan.species === "spruce") {
      bough(ctx, { ...c, ...q }, r, (plan.root.y - c.y) / Math.max(1, plan.height), look, seed);
    } else if (plan.species === "pine") {
      const { colours, lit } = NEEDLES.pine;
      clump(ctx, q.x, q.y, r, 0.45, seed, 1, (h, l) => (l ? lit : colours[Math.floor(h * 97) % 3]));
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
  if (g < 0.9) return;
  const cherries = plan.species === "cherry" && look.k === 0 && look.p > 0.45 && look.p < 0.95;
  const plums =
    plan.species === "plum" && ((look.k === 0 && look.p > 0.8) || (look.k === 1 && look.p < 0.4));
  if (!cherries && !plums) return;
  plan.fruit.forEach((f, j) => {
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

/** Apples as they hang in the season, for a tree drawn on its own (the wood drops them). */
export const paintFruit = (ctx: CanvasRenderingContext2D, plan: Plan, g: number, look: Look) => {
  const on = appleOnTree(look);
  if (plan.species !== "apple" || !on || g < 0.9) return;
  const at = grownAt(plan, g);
  plan.fruit.forEach((f, j) => {
    const q = at(f);
    drawApple(ctx, q.x, q.y, on.size, on.ripe, j);
  });
};
