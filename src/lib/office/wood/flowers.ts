// Friday's flowers, the common ones of a Finnish year, each on its own calendar: coltsfoot
// (leskenlehti) out of bare ground as the snow goes, dandelion (voikukka), fireweed
// (maitohorsma), oxeye daisy (päivänkakkara) and harebell (kissankello) in the light; wood
// anemone (valkovuokko) flowering under the trees before their leaves are out, lily of the
// valley (kielo) and wood sorrel (käenkaali) in their shade. A plan is a patch of one kind in
// scene pixels, 40 to the metre: a few plants, each a stalk up from the ground (a lily's two
// leaves are stalks too), and what the season puts on it. The kinds that close at night close.
// They move by `rustle.ts`; `meadow.ts` says which kind grows where.

import { hash, rect } from "$lib/scene/pixel";

import type { Part, Pt } from "./posed";
import { type Sprawl, stem } from "./sprawl";
import { type Look, random } from "./trees";

export type Flower =
  "coltsfoot" | "dandelion" | "fireweed" | "oxeye" | "harebell" | "anemone" | "lily" | "sorrel";

export const FLOWERS: readonly Flower[] = [
  "coltsfoot",
  "dandelion",
  "fireweed",
  "oxeye",
  "harebell",
  "anemone",
  "lily",
  "sorrel",
];

type Plant = {
  base: Pt;
  /** Its stalk full grown, px. */
  h: number;
  stalk: number;
  /** A lily's two leaves, as stems of their own. */
  blades: number[];
  /** Which way its stalk leans, and arches over if it does: +1 to the right. */
  side: 1 | -1;
  /** Its own looks, 0..1: a sorrel shoot under `SORREL_FLOWERS` is a flower, the rest leaf. */
  salt: number;
};

export type FlowerPlan = Sprawl & { kind: Flower; plants: Plant[] };

/** Each kind's stalk, px (low, high), how many plants make a patch, and how wide it spreads. */
const SIZE: Record<Flower, { h: [number, number]; n: [number, number]; span: number }> = {
  coltsfoot: { h: [4, 7], n: [3, 6], span: 8 },
  dandelion: { h: [5, 9], n: [2, 4], span: 10 },
  fireweed: { h: [26, 50], n: [3, 6], span: 10 },
  oxeye: { h: [12, 20], n: [3, 5], span: 9 },
  harebell: { h: [8, 14], n: [3, 5], span: 8 },
  anemone: { h: [4, 7], n: [6, 10], span: 12 },
  lily: { h: [6, 9], n: [3, 6], span: 10 },
  sorrel: { h: [2, 3], n: [6, 10], span: 10 },
};

/** The least room a kind needs over the ground, px: its shortest stalk. */
export const shortest = (kind: Flower) => SIZE[kind].h[0];

const SORREL_FLOWERS = 0.3;

/** A patch of `kind` round `root`, none of it taller than `room`, shaped by `seed`. */
export const planFlowers = (seed: number, kind: Flower, root: Pt, room: number): FlowerPlan => {
  const plan: FlowerPlan = { kind, root, stems: 0, pieces: [], clumps: [], fruit: [], plants: [] };
  const rand = random(seed);
  const { h, n, span } = SIZE[kind];
  const count = n[0] + Math.floor(rand() * (n[1] - n[0] + 1));
  const bases = Array.from({ length: count }, (_, i) => ({
    x: Math.round(root.x + ((i + rand()) / count - 0.5) * span),
    y: root.y + Math.round((rand() - 0.5) * 3),
  })).sort((a, b) => a.y - b.y);
  for (const base of bases) {
    const salt = rand();
    const lean = (rand() - 0.5) * 0.35;
    let tall = Math.min(room, h[0] + (h[1] - h[0]) * rand());
    // A sorrel's flowers stand a pixel over its leaves.
    if (kind === "sorrel" && salt < SORREL_FLOWERS) tall += 1;
    const blades: number[] = [];
    if (kind === "lily") {
      // Two broad leaves from the ground, and the flowers' stalk arching out between them.
      for (const side of [-1, 1]) {
        const angle = side * (0.12 + 0.12 * rand());
        blades.push(stem(plan, rand, base, angle, tall, 2, side * 0.04, [2], 0).k);
      }
      tall *= 0.8;
    }
    const pieces = tall < 8 ? 2 : tall < 20 ? 3 : 5;
    // Lilies and harebells arch over at the top, so their bells hang.
    const bend = kind === "lily" || kind === "harebell" ? 0.22 : 0.02;
    const { k } = stem(plan, rand, base, lean, tall, pieces, bend, [1], 0);
    plan.plants.push({ base, h: tall, stalk: k, blades, side: lean < 0 ? -1 : 1, salt });
  }
  return plan;
};

// --- The year ---------------------------------------------------------------------------

/** A span of the year, in seasons from spring's start (0) to winter's end (4). */
type Span = [number, number];

type Calendar = {
  /** The stalk rising (from, up by) and dying back (from, gone by). Without one the stalk is
   *  a scape, there only while it carries a head. */
  up?: [number, number, number, number];
  /** The leaves: out, turning, dead, gone. */
  leaf: [number, number, number, number];
  bud: Span[];
  open: Span[];
  seed?: Span;
  berry?: Span;
};

const CALENDAR: Record<Flower, Calendar> = {
  // Out of the bare ground as soon as the snow is off it, in flower before it has a leaf.
  coltsfoot: {
    leaf: [0.6, 2.3, 2.7, 2.9],
    bud: [[0.33, 0.38]],
    open: [[0.38, 0.6]],
    seed: [0.6, 0.8],
  },
  // In flower in early summer, a few again in the autumn.
  dandelion: {
    leaf: [0.45, 2.6, 2.9, 3.05],
    bud: [
      [0.64, 0.7],
      [1.96, 2],
    ],
    open: [
      [0.7, 1.15],
      [2, 2.2],
    ],
    seed: [1.15, 1.4],
  },
  // A spike opening from the bottom up through high summer; red in the autumn, its dead stalks
  // standing into the snow.
  fireweed: {
    up: [0.6, 1.3, 3, 3.3],
    leaf: [0.6, 2, 2.55, 2.85],
    bud: [[1.1, 1.35]],
    open: [[1.35, 1.85]],
    seed: [1.85, 2.45],
  },
  oxeye: {
    up: [0.8, 1.1, 2.4, 2.7],
    leaf: [0.5, 2.3, 2.8, 3],
    bud: [[1, 1.1]],
    open: [[1.1, 1.55]],
    seed: [1.55, 2.4],
  },
  harebell: {
    up: [0.9, 1.3, 2.5, 2.7],
    leaf: [0.6, 2.3, 2.6, 2.8],
    bud: [[1.3, 1.4]],
    open: [[1.4, 2.25]],
    seed: [2.25, 2.5],
  },
  // Up and over under the bare trees, gone once their leaves have closed overhead.
  anemone: {
    up: [0.42, 0.5, 1.3, 1.5],
    leaf: [0.42, 1.2, 1.4, 1.5],
    bud: [[0.45, 0.5]],
    open: [[0.5, 0.85]],
  },
  lily: {
    up: [0.6, 0.8, 2.6, 2.8],
    leaf: [0.6, 2.2, 2.6, 2.8],
    bud: [[0.8, 0.95]],
    open: [[0.95, 1.25]],
    berry: [1.6, 2.7],
  },
  // Its leaves stay till the snow has them.
  sorrel: { leaf: [0.45, 3, 3.1, 3.2], bud: [[0.7, 0.75]], open: [[0.75, 1.1]] },
};

/** These close their flowers at night (the sorrel folds its leaves too). */
const SHUTS: ReadonlySet<Flower> = new Set(["coltsfoot", "dandelion", "anemone", "sorrel"]);
export const closes = (kind: Flower) => SHUTS.has(kind);

export type Phase = {
  /** How far up the stalk is, 0..1. */
  up: number;
  leaf: "green" | "turning" | "dead" | null;
  head: "bud" | "open" | "seed" | "berry" | null;
  /** How far through the head's span, 0..1. */
  through: number;
};

/** Where in the year `look` is, in seasons from spring's start. */
const seasonsIn = ({ k, p }: Look) => ((k + 1) % 4) + p;

const rising = (m: number, [a, b, c, d]: [number, number, number, number]) =>
  m < a || m >= d ? 0 : m < b ? (m - a) / (b - a) : m < c ? 1 : 1 - (m - c) / (d - c);

/** What `kind` is doing in the season of `look`. */
export const phaseOf = (kind: Flower, look: Look): Phase => {
  const m = seasonsIn(look);
  const c = CALENDAR[kind];
  const [out, turn, dead, gone] = c.leaf;
  const leaf = m < out || m >= gone ? null : m < turn ? "green" : m < dead ? "turning" : "dead";
  const spans: [Phase["head"], Span][] = [
    ...c.bud.map((s): [Phase["head"], Span] => ["bud", s]),
    ...c.open.map((s): [Phase["head"], Span] => ["open", s]),
    ...(c.seed ? [["seed", c.seed] as [Phase["head"], Span]] : []),
    ...(c.berry ? [["berry", c.berry] as [Phase["head"], Span]] : []),
  ];
  const hit = spans.find(([, [a, b]]) => m >= a && m < b);
  const head = hit?.[0] ?? null;
  const through = hit ? (m - hit[1][0]) / (hit[1][1] - hit[1][0]) : 0;
  const up = c.up ? rising(m, c.up) : head === "bud" ? 0.5 + 0.5 * through : head ? 1 : 0;
  return { up, leaf, head, through };
};

/** Whether anything of `kind` shows above the ground in `phase`. */
export const showing = (phase: Phase) => phase.up > 0 || phase.leaf !== null;

// --- Painting ---------------------------------------------------------------------------

const STALK = "#4f7f33";
const LEAVES = {
  green: ["#4f8a32", "#3f7a2a"],
  turning: ["#8a8a3a", "#7a7a30"],
  dead: ["#8a6a42", "#7a5a3a"],
};
const YELLOW = ["#f2c81a", "#e8a810", "#ffe04a"];
const SEED = ["#f4f4ee", "#dcdcd4"];
const PINK = ["#d8509a", "#e870b0", "#c03a80", "#f090c0"];
const BUD = "#5a8a32";

/** What a painter is handed: the plant, its season, and ways to paint it. */
type Brush = {
  plant: Plant;
  phase: Phase;
  /** The plant come up this far, 0..1. */
  g: number;
  shut: boolean;
  /** One pixel, unless the snow is over it. */
  dot: (c: string, x: number, y: number) => void;
  /** What follows is painted where it stands, unmoved by the wind. */
  still: () => void;
  /** Up stem `k` grown `u` of the way, `each` pixel step of it (its point, how far up the
   *  stem, its count), then `tip` at its top, in the top piece's part. */
  walk: (
    k: number,
    u: number,
    each: (q: Pt, s: number, j: number) => void,
    tip?: (q: Pt) => void,
  ) => void;
};

const leafOf = (phase: Phase, j: number) =>
  phase.leaf ? LEAVES[phase.leaf][Math.abs(j) % 2] : null;

/** A flat rosette on the ground, `w` px each side, its tips lifting. */
const rosette = ({ plant, phase, g, dot, still }: Brush, w: number) => {
  if (!phase.leaf) return;
  still();
  const { x, y } = plant.base;
  const span = Math.round(w * g);
  for (let dx = -span; dx <= span; dx++) {
    if (hash(Math.round(plant.salt * 997), dx, 5) < 0.2) continue;
    dot(LEAVES[phase.leaf][Math.abs(dx) % 2], x + dx, y);
    if (dx && dx % 2 === 0 && Math.abs(dx) < span) dot(LEAVES[phase.leaf][0], x + dx, y - 1);
  }
};

/** Pixels left of a head as its seed blows away: each goes in its turn. */
const kept = (b: Brush, j: number) => hash(Math.round(b.plant.salt * 997), j, 7) >= b.phase.through;

const dandelion = (b: Brush) => {
  const { phase, shut, dot, walk } = b;
  rosette(b, 3);
  walk(
    b.plant.stalk,
    phase.up * b.g,
    (q) => dot(STALK, q.x, q.y),
    ({ x, y }) => {
      if (phase.head === "bud" || (phase.head === "open" && shut)) {
        dot(BUD, x, y - 1);
        if (phase.head === "open") dot(YELLOW[0], x, y - 2);
      } else if (phase.head === "open") {
        dot(YELLOW[0], x - 1, y - 1);
        dot(YELLOW[1], x, y - 1);
        dot(YELLOW[0], x + 1, y - 1);
        dot(YELLOW[2], x, y - 2);
      } else if (phase.head === "seed") {
        // The clock, blowing away.
        [
          [0, -2],
          [-1, -2],
          [1, -2],
          [0, -3],
          [0, -1],
        ].forEach(([dx, dy], j) => {
          if (kept(b, j)) dot(SEED[j ? 0 : 1], x + dx, y + dy);
        });
      }
    },
  );
};

const coltsfoot = (b: Brush) => {
  const { plant, phase, shut, dot, walk, still } = b;
  // Its leaves come after the flowers: broad and low, pale beneath.
  if (phase.leaf) {
    still();
    const { x, y } = plant.base;
    const w = Math.round(2 * b.g);
    for (let dx = -w; dx <= w; dx++) dot(leafOf(phase, dx) ?? STALK, x + dx, y);
    for (let dx = 1 - w; dx < w; dx++)
      dot(phase.leaf === "green" ? "#7aa06a" : LEAVES[phase.leaf][0], x + dx, y - 1);
    if (w) dot("#a8b89a", x + (plant.salt < 0.5 ? -w : w), y);
  }
  walk(
    plant.stalk,
    phase.up * b.g,
    (q, s) => dot(s > 0.4 && s < 0.6 ? "#b88a6a" : "#9a6a5a", q.x, q.y),
    ({ x, y }) => {
      if (phase.head === "bud") dot("#c8a040", x, y - 1);
      else if (phase.head === "open" && shut) dot("#c8a040", x + 1, y);
      else if (phase.head === "open") {
        dot(YELLOW[0], x - 1, y - 1);
        dot("#e8901a", x, y - 1);
        dot(YELLOW[0], x + 1, y - 1);
      } else if (phase.head === "seed") {
        [
          [0, -1],
          [-1, -2],
          [0, -2],
          [1, -2],
        ].forEach(([dx, dy], j) => {
          if (kept(b, j)) dot(SEED[j % 2], x + dx, y + dy);
        });
      }
    },
  );
};

const fireweed = (b: Brush) => {
  const { plant, phase, dot, walk } = b;
  const dead = phase.leaf === "dead" || (!phase.leaf && phase.up > 0);
  const salt = Math.round(plant.salt * 997);
  walk(plant.stalk, phase.up * b.g, (q, s, j) => {
    const side = j % 6 < 3 ? 1 : -1;
    dot(dead ? "#7a5a40" : s > 0.55 ? "#9a4a50" : "#5a7a33", q.x, q.y);
    // Narrow leaves up the stalk, turning red in the autumn.
    if (s < 0.72 && j % 3 === 0 && phase.leaf && !dead) {
      const c = phase.leaf === "green" ? ["#3f6a2a", "#4f7f33"] : ["#c83a2a", "#e0602a"];
      dot(c[0], q.x + side, q.y);
      dot(c[1], q.x + 2 * side, q.y - 1);
    }
    if (s < 0.7 || dead) return;
    // The spike: buds, flowers opening up it, pods splitting into seed fluff.
    const v = (s - 0.7) / 0.3;
    const { head, through } = phase;
    if (head === "bud" || (head === "open" && v >= through + 0.15)) {
      if (j % 2 === 0) dot("#7a2a50", q.x + side, q.y);
    } else if (head === "open" && v >= through - 0.3) {
      dot(PINK[Math.floor(hash(salt, j, 1) * 4)], q.x - 1, q.y);
      dot(PINK[Math.floor(hash(salt, j, 2) * 4)], q.x + 1, q.y);
      if (j % 2) dot(PINK[3], q.x + 2 * side, q.y);
    } else if (head === "open") {
      dot("#8a3a50", q.x + side, q.y);
    } else if (head === "seed") {
      dot("#7a3a40", q.x + side, q.y);
      if (hash(salt, j, 3) >= through) dot(SEED[j % 2], q.x - side, q.y - (j % 3 ? 0 : 1));
      if (hash(salt, j, 4) >= through * 1.4) dot(SEED[0], q.x + 2 * side, q.y - 1);
    }
  });
};

const oxeye = (b: Brush) => {
  const { plant, phase, dot, walk } = b;
  rosette(b, 2);
  walk(
    plant.stalk,
    phase.up * b.g,
    (q, s, j) => {
      dot(STALK, q.x, q.y);
      const leaf = leafOf(phase, j);
      if (leaf && s < 0.5 && j % 4 === 2) dot(leaf, q.x + (j % 8 < 4 ? 1 : -1), q.y);
    },
    ({ x, y }) => {
      if (phase.head === "bud") dot(BUD, x, y - 1);
      else if (phase.head === "open") {
        dot("#fbfaf4", x - 1, y - 1);
        dot("#f2f0e6", x, y - 1);
        dot("#fbfaf4", x + 1, y - 1);
        dot(YELLOW[1], x, y - 2);
      } else if (phase.head === "seed") {
        dot("#8a6a3a", x, y - 1);
        dot("#6a5030", x, y - 2);
      }
    },
  );
};

const harebell = (b: Brush) => {
  const { plant, phase, dot, walk } = b;
  // Its bells hang the way the stalk arches.
  const { side } = plant;
  const bell = (x: number, y: number) => {
    if (phase.head === "bud") dot("#5a7a6a", x, y);
    else if (phase.head === "open") {
      dot("#6a6ad8", x, y);
      dot("#9a9af0", x, y + 1);
    } else if (phase.head === "seed") dot("#8a7a5a", x, y);
  };
  walk(
    plant.stalk,
    phase.up * b.g,
    (q, s, j) => {
      dot("#5a8a3a", q.x, q.y);
      const leaf = leafOf(phase, j);
      if (leaf && s < 0.6 && j % 4 === 1) dot(leaf, q.x - side, q.y);
      if (plant.salt > 0.4 && j === Math.round(plant.h * phase.up * b.g * 0.7))
        bell(q.x - side, q.y + 1);
    },
    ({ x, y }) => bell(x + side, y),
  );
};

const anemone = (b: Brush) => {
  const { plant, phase, shut, dot, walk } = b;
  const whorl = Math.round(plant.h * phase.up * b.g * 0.6);
  walk(
    plant.stalk,
    phase.up * b.g,
    (q, _, j) => {
      dot("#5a7a3a", q.x, q.y);
      const leaf = leafOf(phase, j);
      if (!leaf || j !== whorl) return;
      // Three leaves round the stalk, cut deep.
      dot(leaf, q.x - 1, q.y);
      dot(LEAVES.green[1], q.x - 2, q.y);
      dot(leaf, q.x + 1, q.y);
      dot(LEAVES.green[1], q.x + 2, q.y - 1);
    },
    ({ x, y }) => {
      // A nodding bud, and at night the flower nods shut again.
      if (phase.head === "bud" || (phase.head === "open" && shut)) dot("#ecd4dc", x + 1, y);
      else if (phase.head === "open") {
        dot("#fbfaf4", x, y - 1);
        dot("#f4e4ea", x + 1, y - 1);
      }
    },
  );
};

const lily = (b: Brush) => {
  const { plant, phase, dot, walk } = b;
  const u = phase.up * b.g;
  for (const blade of plant.blades) {
    walk(blade, u, (q, s, j) => {
      const c = LEAVES[phase.leaf ?? "dead"];
      if (s > 0.9 && j % 2) return;
      dot(c[0], q.x, q.y);
      if (s < 0.8) dot(phase.leaf === "green" ? "#5a9a4a" : c[1], q.x + 1, q.y);
    });
  }
  const { side } = plant;
  walk(plant.stalk, u, (q, s, j) => {
    dot("#5a8a3a", q.x, q.y);
    // Bells down one side of the arch; berries where they were.
    if (s < 0.55 || j % 2) return;
    if (phase.head === "bud") dot("#d8e0c8", q.x + side, q.y + 1);
    else if (phase.head === "open") dot(j % 4 ? "#fbfaf4" : "#e8e8dc", q.x + side, q.y + 1);
    else if (phase.head === "berry" && j % 4 === 0) {
      dot(phase.through < 0.25 ? "#7a9a4a" : "#d0302a", q.x + side, q.y + 1);
    }
  });
};

const sorrel = (b: Brush) => {
  const { plant, phase, shut, dot, walk } = b;
  if (plant.salt < SORREL_FLOWERS) {
    walk(
      plant.stalk,
      phase.up * b.g,
      (q) => dot("#9aa86a", q.x, q.y),
      ({ x, y }) => {
        if (phase.head === "bud") dot("#d8c8d0", x, y - 1);
        else if (phase.head === "open" && shut) dot("#f0dce4", x + 1, y);
        else if (phase.head === "open") dot("#fbf8f4", x, y - 1);
      },
    );
    return;
  }
  if (!phase.leaf) return;
  const c = phase.leaf === "green" ? ["#7ab84a", "#6aa83a"] : LEAVES[phase.leaf];
  walk(
    plant.stalk,
    b.g,
    (q) => dot("#9aa86a", q.x, q.y),
    ({ x, y }) => {
      // Three leaflets; folded down at night.
      const down = shut ? 1 : 0;
      dot(c[0], x - 1, y + down);
      dot(c[0], x + 1, y + down);
      dot(c[1], x, y - 1 + down);
    },
  );
};

const PAINT: Record<Flower, (b: Brush) => void> = {
  coltsfoot,
  dandelion,
  fireweed,
  oxeye,
  harebell,
  anemone,
  lily,
  sorrel,
};

const piecesBy = new WeakMap<FlowerPlan, number[][]>();
/** Each stem's pieces, base first. */
const stemsOf = (plan: FlowerPlan) => {
  let known = piecesBy.get(plan);
  if (!known) {
    known = Array.from({ length: plan.stems }, () => []);
    plan.pieces.forEach((p, i) => known?.[p.stem].push(i));
    piecesBy.set(plan, known);
  }
  return known;
};

/**
 * Paint the patch come up `g` of the way, dressed for `look`, closed for the night if `shut`,
 * telling `part` before each part. Under snow only what stands above it shows.
 */
export const paintFlowerParts = (
  ctx: CanvasRenderingContext2D,
  plan: FlowerPlan,
  g: number,
  look: Look,
  shut: boolean,
  part: (p: Part) => void,
) => {
  const phase = phaseOf(plan.kind, look);
  if (!showing(phase) || g <= 0) return;
  const snow = look.snow * 6;
  const stems = stemsOf(plan);
  for (const plant of plan.plants) {
    const { base } = plant;
    const dot = (c: string, x: number, y: number) => {
      const py = Math.round(y);
      if (base.y - py >= snow) rect(ctx, c, x, py);
    };
    const walk: Brush["walk"] = (k, u, each, tip) => {
      if (u <= 0.05) return;
      const at = (q: Pt): Pt => ({
        x: base.x + (q.x - base.x) * u,
        y: base.y + (q.y - base.y) * u,
      });
      let j = 0;
      stems[k].forEach((i, n) => {
        const p = plan.pieces[i];
        const a = at(p.a);
        const b = at(p.b);
        part({ kind: "wood", i, a, b });
        const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y)));
        for (let m = n ? 1 : 0; m <= steps; m++) {
          const q = { x: a.x + ((b.x - a.x) * m) / steps, y: a.y + ((b.y - a.y) * m) / steps };
          each(q, p.s0 + ((p.s1 - p.s0) * m) / steps, j++);
        }
        if (n === stems[k].length - 1) tip?.(b);
      });
    };
    PAINT[plan.kind]({
      plant,
      phase,
      g,
      shut,
      dot,
      still: () => part({ kind: "still" }),
      walk,
    });
  }
};

/** How tall the patch's tallest plant stands, px. */
export const tallestOf = (plan: FlowerPlan) => Math.max(...plan.plants.map((p) => p.h));
