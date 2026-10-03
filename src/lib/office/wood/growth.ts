// Friday's trees grow the way trees do. A tree's whole life is laid down once from its seed: a
// leader that climbs year by year (forking into stems, for the kinds that spread), branches that
// sprout from each year's growth and reach out, twigs and leaves on what is alive. Its crown
// rises as it grows: a branch the crown has left below dies, greys and, in time, drops. Read at
// any age (`planAt`), a life is an ordinary plan, for the painter in `trees.ts` and the wind in
// `sway.ts`. Paths are laid by arc length, so a growing limb only gets longer: nothing that has
// grown moves.

import { hash } from "$lib/scene/pixel";

import type { Pt } from "./posed";
import { type Plan, random, type Species } from "./trees";

/** Scene px to the metre: the desk is about 0.8 m and 32 px. */
export const PX_M = 40;

/** How a kind grows, in metres and years. */
type Habit = {
  /** How tall it gets, and how tall it is at five. */
  tall: number;
  at5: number;
  /** The chance of several stems from the ground, and how many at most. */
  multi: number;
  /** When the leader forks into stems (never, for a conifer or a birch), into how many, and how
   *  far they lean apart. */
  forkAt: number;
  forks: [number, number];
  spread: number;
  /** Branches a year: in a whorl at the year's node, or alternate along the year's shoot. */
  whorl: boolean;
  perYear: [number, number];
  /** A branch's lean off vertical where it sprouts, low on the tree and at the top. */
  angle: [number, number];
  /** How it curves (radians per 100 px, + droops away from the stem, − rises) and wanders. */
  bend: number;
  wander: number;
  /** How long a branch gets, m, and how fast (per year). */
  reach: number;
  rate: number;
  /** Twigs off a branch: every `every` px, `len` m long, leaning `angle` off it and curving. */
  twig: { every: number; len: number; angle: number; bend: number } | null;
  /** Leaf clump radius, px, and the outer share of a branch in leaf. */
  leaf: number;
  outer: number;
  /** Trunk width per (years of wood) ^ 0.6, px. */
  girth: number;
  /** The share of its height in live crown, once grown, and over how many years it gets there. */
  crown: number;
  crownAge: number;
  /** How long a dead branch hangs on, years; and whether it leaves a stub when it goes. */
  keep: [number, number];
  stubs: boolean;
  /** How long it lives, years. */
  lives: [number, number];
};

const NEVER = Infinity;

const HABITS: Record<Species, Habit> = {
  birch: {
    tall: 20,
    at5: 3,
    multi: 0.15,
    forkAt: NEVER,
    forks: [1, 1],
    spread: 0,
    whorl: false,
    perYear: [2, 3],
    angle: [1.1, 0.45],
    bend: 0.25,
    wander: 0.14,
    reach: 3,
    rate: 0.22,
    twig: { every: 9, len: 0.55, angle: 1.0, bend: 5 },
    leaf: 2.6,
    outer: 0.7,
    girth: 1.1,
    crown: 0.45,
    crownAge: 12,
    keep: [1, 4],
    stubs: false,
    lives: [13, 18],
  },
  rowan: {
    tall: 8,
    at5: 2.5,
    multi: 0.5,
    forkAt: 6,
    forks: [2, 3],
    spread: 0.35,
    whorl: false,
    perYear: [2, 3],
    angle: [0.8, 0.4],
    bend: -0.3,
    wander: 0.25,
    reach: 1.6,
    rate: 0.3,
    twig: { every: 12, len: 0.35, angle: 0.7, bend: -0.5 },
    leaf: 4,
    outer: 0.55,
    girth: 0.9,
    crown: 0.5,
    crownAge: 10,
    keep: [1, 3],
    stubs: false,
    lives: [8, 11],
  },
  apple: {
    tall: 5,
    at5: 2,
    multi: 0,
    forkAt: 2.5,
    forks: [3, 5],
    spread: 0.95,
    whorl: false,
    perYear: [2, 3],
    angle: [1.3, 0.8],
    bend: -0.45,
    wander: 0.45,
    reach: 2.2,
    rate: 0.3,
    twig: { every: 12, len: 0.3, angle: 0.8, bend: -0.6 },
    leaf: 4.4,
    outer: 0.65,
    girth: 1.3,
    crown: 0.7,
    crownAge: 15,
    keep: [1, 3],
    stubs: false,
    lives: [16, 20],
  },
  oak: {
    tall: 20,
    at5: 1.8,
    multi: 0,
    forkAt: 9,
    forks: [3, 4],
    spread: 0.75,
    whorl: false,
    perYear: [2, 3],
    angle: [1.3, 0.85],
    bend: 0.1,
    wander: 0.6,
    reach: 5,
    rate: 0.12,
    twig: { every: 13, len: 0.5, angle: 0.9, bend: 0.2 },
    leaf: 5.5,
    outer: 0.5,
    girth: 1.6,
    crown: 0.5,
    crownAge: 15,
    keep: [2, 6],
    stubs: false,
    lives: [30, 40],
  },
  maple: {
    tall: 18,
    at5: 2.5,
    multi: 0,
    forkAt: 8,
    forks: [2, 3],
    spread: 0.45,
    whorl: false,
    perYear: [2, 3],
    angle: [0.95, 0.5],
    bend: -0.2,
    wander: 0.25,
    reach: 4,
    rate: 0.15,
    twig: { every: 13, len: 0.45, angle: 0.6, bend: -0.3 },
    leaf: 5,
    outer: 0.55,
    girth: 1.4,
    crown: 0.45,
    crownAge: 14,
    keep: [2, 5],
    stubs: false,
    lives: [25, 32],
  },
  cherry: {
    tall: 7,
    at5: 2.5,
    multi: 0,
    forkAt: 4,
    forks: [2, 4],
    spread: 0.6,
    whorl: false,
    perYear: [2, 3],
    angle: [1, 0.6],
    bend: -0.3,
    wander: 0.3,
    reach: 2.2,
    rate: 0.3,
    twig: { every: 12, len: 0.3, angle: 0.7, bend: -0.4 },
    leaf: 4.2,
    outer: 0.6,
    girth: 1.1,
    crown: 0.55,
    crownAge: 10,
    keep: [1, 3],
    stubs: false,
    lives: [8, 11],
  },
  plum: {
    tall: 6,
    at5: 2.3,
    multi: 0,
    forkAt: 3.5,
    forks: [2, 4],
    spread: 0.35,
    whorl: false,
    perYear: [2, 3],
    angle: [0.7, 0.45],
    bend: -0.3,
    wander: 0.3,
    reach: 1.8,
    rate: 0.3,
    twig: { every: 12, len: 0.3, angle: 0.6, bend: -0.4 },
    leaf: 3.6,
    outer: 0.6,
    girth: 1,
    crown: 0.6,
    crownAge: 10,
    keep: [1, 3],
    stubs: false,
    lives: [8, 11],
  },
  spruce: {
    tall: 25,
    at5: 1.5,
    multi: 0,
    forkAt: NEVER,
    forks: [1, 1],
    spread: 0,
    whorl: true,
    perYear: [2, 2],
    angle: [1.5, 1.2],
    bend: 0.35,
    wander: 0.08,
    reach: 3.2,
    rate: 0.12,
    twig: null,
    leaf: 0,
    outer: 1,
    girth: 1.3,
    crown: 0.6,
    crownAge: 20,
    keep: [8, 15],
    stubs: true,
    lives: [28, 36],
  },
  pine: {
    tall: 22,
    at5: 2,
    multi: 0,
    forkAt: NEVER,
    forks: [1, 1],
    spread: 0,
    whorl: true,
    perYear: [2, 2],
    angle: [1.35, 1],
    bend: -0.15,
    wander: 0.35,
    reach: 2.8,
    rate: 0.15,
    twig: { every: 14, len: 0.4, angle: 0.4, bend: -0.3 },
    leaf: 4,
    outer: 0.45,
    girth: 1.3,
    crown: 0.3,
    crownAge: 10,
    keep: [1, 3],
    stubs: true,
    lives: [28, 36],
  },
};

/** How long a kind lives, years, at `u` (0..1) through its range. */
export const lifespanOf = (species: Species, u: number) => {
  const [a, b] = HABITS[species].lives;
  return a + (b - a) * u;
};

/** Path points are laid this far apart, px; stems are cut into pieces this long, branches this. */
const STEP = 4;
const STEM_PIECE = 16;
const BRANCH_PIECE = 10;
/** Nothing that starts above this, scene y, is drawn: it can never reach the room. */
const CULL_Y = -40;

type Axis = {
  /** The axis it grows from (-1: the ground), and how far along it, px. */
  parent: number;
  node: number;
  /** Tree age when it sprouts, years. */
  born: number;
  stem: boolean;
  /** Which way it leans: -1 left, 1 right. */
  side: 1 | -1;
  /** Its path, every `STEP` px from its base, as far as it could ever grow. */
  path: Pt[];
  /** A stem grows as the tree gains height above `from`, times `share`, up to `stop` (where it
   *  forked). A branch reaches `cap` px at `rate` a year. */
  from: number;
  share: number;
  stop: number;
  cap: number;
  rate: number;
  /** When it dies and when it drops, tree years. */
  dies: number;
  drops: number;
};

/** A tree's whole life: its kind, its root, its axes in the order they grow. */
export type Arch = {
  species: Species;
  root: Pt;
  habit: Habit;
  /** Height, px, as a function of age. */
  heightAt: (age: number) => number;
  /** The age at which the main stem was `z` px tall. */
  ageAtHeight: (z: number) => number;
  axes: Axis[];
  seed: number;
};

/** Smooth noise in [-1, 1] along `s`, the same for the same axis wherever it is asked. */
const noise = (id: number, salt: number, s: number) => {
  const k = Math.floor(s);
  const u = s - k;
  const a = hash(id, salt, k) * 2 - 1;
  const b = hash(id, salt, k + 1) * 2 - 1;
  return a + (b - a) * u * u * (3 - 2 * u);
};

/** Points every `STEP` px from `from`, turning as `dir` says at each arc length. */
const lay = (from: Pt, len: number, dir: (s: number) => number): Pt[] => {
  const pts = [from];
  for (let s = 0; s < len; s += STEP) {
    const a = dir(s);
    const p = pts[pts.length - 1];
    pts.push({ x: p.x + Math.sin(a) * STEP, y: p.y - Math.cos(a) * STEP });
  }
  return pts;
};

/** The point `s` px along `path`. */
const pointAt = (path: Pt[], s: number): Pt => {
  const t = Math.max(0, Math.min(path.length - 1.001, s / STEP));
  const k = Math.floor(t);
  const u = t - k;
  return {
    x: path[k].x + (path[k + 1].x - path[k].x) * u,
    y: path[k].y + (path[k + 1].y - path[k].y) * u,
  };
};

/** The direction of `path` at `s`, radians off vertical. */
const directionAt = (path: Pt[], s: number) => {
  const a = pointAt(path, Math.max(0, s - STEP));
  const b = pointAt(path, s + STEP);
  return Math.atan2(b.x - a.x, a.y - b.y);
};

const archs = new Map<string, Arch>();

/**
 * The life of a `species` tree rooted at `root`, shaped by `seed`, laid down to `years` old.
 * `size` scales how tall it gets (0.85..1.15 is a tree among its kind).
 */
export const archOf = (seed: number, root: Pt, species: Species, years: number, size = 1): Arch => {
  const key = `${seed}|${root.x}|${root.y}|${species}|${years}|${size}`;
  const known = archs.get(key);
  if (known) return known;
  const habit = HABITS[species];
  const rand = random(seed);
  const tall = habit.tall * PX_M * size;
  const k = -Math.log(1 - (habit.at5 / habit.tall) ** (2 / 3)) / 5;
  const heightAt = (age: number) => tall * (1 - Math.exp(-k * Math.max(0, age))) ** 1.5;
  const ageAtHeight = (z: number) => {
    const f = Math.min(0.999, Math.max(0, z / tall));
    return -Math.log(1 - f ** (2 / 3)) / k;
  };
  const crownBase = (age: number) =>
    heightAt(age) * (1 - (habit.crown + (1 - habit.crown) * Math.exp(-age / habit.crownAge)));
  const axes: Axis[] = [];
  const lean = (rand() - 0.5) * 0.06;

  /** A stem from `from` on `parent` at `node`, sprouting at `born`, its length the height grown
   *  since then, times `share`. */
  const stem = (
    parent: number,
    node: number,
    from: Pt,
    angle: number,
    born: number,
    share: number,
  ) => {
    const id = axes.length;
    const start = heightAt(born);
    const wobble = species === "pine" ? 0.12 : 0.05;
    const path = lay(from, (tall - start) * share + 8, (s) => {
      // Fork stems lean out, then turn back up toward the light.
      const lift = angle * (1 - 0.6 * Math.min(1, s / 120));
      return lift + lean + wobble * noise(id, 1, s / 24);
    });
    axes.push({
      parent,
      node,
      born,
      stem: true,
      side: angle < 0 ? -1 : 1,
      path,
      from: start,
      share,
      stop: NEVER,
      cap: 0,
      rate: 0,
      dies: NEVER,
      drops: NEVER,
    });
    return id;
  };

  // The stems from the ground: usually one, a clump for some kinds.
  const stems: number[] = [];
  const many = rand() < habit.multi ? 2 + Math.floor(rand() * 2) : 1;
  for (let i = 0; i < many; i++) {
    const angle = many === 1 ? 0 : (i - (many - 1) / 2) * 0.32 + (rand() - 0.5) * 0.1;
    stems.push(stem(-1, 0, root, angle, 0, many === 1 ? 1 : 0.85 + 0.15 * rand()));
  }
  // Kinds that spread fork their leader into stems once, at their fork age: the trunk stops
  // there and the stems carry the growth on.
  if (habit.forkAt < years && many === 1) {
    const trunk = axes[stems[0]];
    const at = habit.forkAt * (0.85 + 0.3 * rand());
    trunk.stop = heightAt(at);
    const head = pointAt(trunk.path, trunk.stop);
    const n = habit.forks[0] + Math.floor(rand() * (habit.forks[1] - habit.forks[0] + 1));
    for (let i = 0; i < n; i++) {
      const angle = habit.spread * ((2 * (i + 0.5)) / n - 1) + (rand() - 0.5) * 0.2;
      stems.push(stem(stems[0], trunk.stop, head, angle, at, 0.75 + 0.25 * rand()));
    }
  }

  const lengthAt = (a: Axis, age: number) => lengthOf(heightAt, a, age);

  // Branches, year by year, off every stem's new growth.
  const lowest = 0.3 * PX_M;
  for (let year = 1; year <= years; year++) {
    for (const si of [...stems]) {
      const s = axes[si];
      const was = lengthAt(s, year - 1);
      const now = lengthAt(s, year);
      if (now - was < 1) continue;
      const nodes: number[] = [];
      // A crown of several stems shares its light: fewer branches each.
      const many =
        habit.perYear[0] + Math.floor(rand() * (habit.perYear[1] - habit.perYear[0] + 1));
      const n = Math.max(1, Math.round(many / Math.sqrt(stems.length)));
      if (habit.whorl) for (let i = 0; i < n; i++) nodes.push(now - 1);
      else for (let i = 0; i < n; i++) nodes.push(was + ((i + 0.5) / n) * (now - was));
      let side: 1 | -1 = rand() < 0.5 ? 1 : -1;
      for (const node of nodes) {
        const base = pointAt(s.path, node);
        if (root.y - base.y < lowest) continue;
        const up = Math.min(1, (root.y - base.y) / (tall * 0.6));
        const id = axes.length;
        const off =
          (habit.angle[0] + (habit.angle[1] - habit.angle[0]) * up) * (0.85 + 0.3 * rand());
        const stemDir = directionAt(s.path, node);
        const angle = stemDir + side * off;
        // A conifer's lowest boughs are its longest; a broadleaf's low branches, in the shade
        // of the rest, stay short.
        const shade = habit.whorl ? 1 - 0.4 * up : 0.45 + 0.55 * Math.min(1, up * 2);
        const cap = habit.reach * PX_M * (0.7 + 0.6 * rand()) * shade;
        const path = lay(base, cap + 4, (t) =>
          Math.max(
            -Math.PI * 0.95,
            Math.min(
              Math.PI * 0.95,
              angle + side * habit.bend * (t / 100) + habit.wander * noise(id, 2, t / 20),
            ),
          ),
        );
        // It dies once the crown has risen past it, or early, shaded out.
        const z = root.y - base.y;
        let dies = year;
        while (dies < years + 60 && crownBase(dies) < z) dies += 0.25;
        if (rand() < 0.12) dies = Math.min(dies, year + 1 + 6 * rand());
        const drops = dies + habit.keep[0] + (habit.keep[1] - habit.keep[0]) * rand();
        axes.push({
          parent: si,
          node,
          born: year,
          stem: false,
          side,
          path,
          from: 0,
          share: 0,
          stop: NEVER,
          cap,
          rate: habit.rate,
          dies,
          drops,
        });
        side = side === 1 ? -1 : 1;
      }
    }
  }
  const arch: Arch = { species, root, habit, heightAt, ageAtHeight, axes, seed };
  archs.set(key, arch);
  return arch;
};

/** How long axis `a` is at tree age `age`, px, on a tree `heightAt` tall. */
const lengthOf = (heightAt: (age: number) => number, a: Axis, age: number): number => {
  if (age < a.born) return 0;
  if (a.stem) return Math.min(a.stop, Math.max(0, heightAt(age) - a.from) * a.share);
  return a.cap * (1 - Math.exp(-a.rate * (age - a.born)));
};

/** Width of a stem `s` px along it, at `age`: the older the wood there, the thicker. */
const stemWidth = (arch: Arch, a: Axis, s: number, age: number) => {
  const wood = Math.max(0, age - arch.ageAtHeight(a.from + s / a.share));
  return Math.max(1, Math.round(arch.habit.girth * wood ** 0.6));
};

/** The last few plans each life was read at: a tree is drawn at one age, posed at another. */
const plans = new WeakMap<Arch, { age: number; cull: boolean; plan: Plan }[]>();

/** `arch` at `age` years, as a plan: what stands of it, alive and dead, with its leaves. With
 *  `cull`, what can never reach the room (above it) is left out. */
export const planAt = (arch: Arch, age: number, cull = true): Plan => {
  const kept = plans.get(arch) ?? [];
  const known = kept.find((k) => k.age === age && k.cull === cull);
  if (known) return known.plan;
  const { habit, root, axes } = arch;
  const limbs: Plan["limbs"] = [];
  const parents: { piece: number; t: number }[] = [];
  const ids: number[] = [];
  const clumps: Plan["clumps"] = [];
  const clumpOn: number[] = [];
  /** Each axis's pieces as drawn: where they start along it and their index. */
  const drawn: { s: number[]; k: number[]; len: number }[] = [];
  let perch: Pt | null = null;
  const hangOn = (axis: number, s: number) => {
    const d = drawn[axis];
    if (!d || !d.k.length) return { piece: -1, t: 0 };
    let j = d.s.length - 1;
    while (j > 0 && d.s[j] > s) j--;
    const end = j + 1 < d.s.length ? d.s[j + 1] : d.len;
    return {
      piece: d.k[j],
      t: Math.max(0, Math.min(1, (s - d.s[j]) / Math.max(0.01, end - d.s[j]))),
    };
  };
  const clumpIds: number[] = [];
  const leaf = (x: number, y: number, r: number, on: number, id: number) => {
    if (cull && y + r < CULL_Y) return;
    clumps.push({ x, y, r, at: 0 });
    clumpOn.push(on);
    clumpIds.push(id);
  };

  axes.forEach((a, i) => {
    if (age < a.born) return;
    if (a.parent >= 0 && !drawn[a.parent]) return;
    const gone = age >= a.drops;
    const len = gone ? (habit.stubs ? Math.min(3, a.cap) : 0) : lengthOf(arch.heightAt, a, age);
    if (len < 0.5) return;
    const base = a.path[0];
    if (cull && base.y < CULL_Y) return;
    const dead = a.stem ? 0 : age < a.dies ? 0 : gone ? 1 : (age - a.dies) / (a.drops - a.dies);
    const piece = a.stem ? STEM_PIECE : BRANCH_PIECE;
    const mine = { s: [] as number[], k: [] as number[], len };
    drawn[i] = mine;
    const branchW = Math.max(
      1,
      Math.round(0.55 * Math.max(0, Math.min(age, a.dies) - a.born) ** 0.6),
    );
    for (let s0 = 0; s0 < len; s0 += piece) {
      const s1 = Math.min(len, s0 + piece);
      const p = pointAt(a.path, s0);
      const q = pointAt(a.path, s1);
      if (cull && p.y < CULL_Y && q.y < CULL_Y) break;
      const w = a.stem
        ? stemWidth(arch, a, s0, age)
        : Math.max(1, Math.round(branchW * (1 - s0 / Math.max(1, len)) ** 0.8));
      const parent =
        s0 === 0
          ? a.parent < 0
            ? { piece: -1, t: 0 }
            : hangOn(a.parent, a.node)
          : {
              piece: limbs.length - 1,
              t: 1,
            };
      mine.s.push(s0);
      mine.k.push(limbs.length);
      limbs.push({ a: p, b: q, w, at: 0, dead: gone ? 1 : dead });
      parents.push(parent);
      ids.push(i * 256 + Math.floor(s0 / piece));
    }
    if (!mine.k.length) return;
    // An owl's branch: a living branch two years old or more, on a stem, high in the room.
    if (!a.stem && !dead && age - a.born >= 2 && a.parent >= 0 && axes[a.parent].stem) {
      if (base.y >= 28 && base.y <= root.y - 30 && (!perch || base.y < perch.y)) perch = base;
    }
    if (gone) return;
    // Twigs on the outer part of a branch (the inner ones, shaded, are long shed), the dead ones
    // going one by one; leaves on the living.
    const twig = habit.twig;
    if (!a.stem && twig) {
      const inner = len * (1 - Math.min(1, habit.outer * 1.3));
      for (let k = 0; ; k++) {
        const s = twig.every * (k + 0.6);
        if (s + 3 > len) break;
        if (s < inner) continue;
        if (dead && hash(i, k, 31) < dead * 1.3) continue;
        const side = (k + i) % 2 ? 1 : -1;
        const tl = Math.min(twig.len * PX_M, (len - s) * 0.5);
        const from = pointAt(a.path, s);
        const dir = directionAt(a.path, s) + side * twig.angle;
        // It curls away from the vertical (+, a birch's hang down) or toward it, in an arc: a
        // hard curl in three pieces, a light one in two.
        const pieces = Math.abs(twig.bend) > 2 ? 3 : 2;
        const curl = (Math.sign(dir) || 1) * twig.bend * (tl / 100);
        const pts = [from];
        for (let j = 0; j < pieces; j++) {
          const d = dir + curl * (j / (pieces - 1));
          const p = pts[j];
          pts.push({ x: p.x + (Math.sin(d) * tl) / pieces, y: p.y - (Math.cos(d) * tl) / pieces });
        }
        const tip = pts[pieces];
        if (cull && from.y < CULL_Y && tip.y < CULL_Y) continue;
        const on = hangOn(i, s);
        for (let j = 0; j < pieces; j++) {
          limbs.push({ a: pts[j], b: pts[j + 1], w: 1, at: 0, dead });
          parents.push(j === 0 ? on : { piece: limbs.length - 2, t: 1 });
          ids.push(i * 256 + 128 + k * 3 + j);
        }
        if (!dead && habit.leaf) {
          const r = habit.leaf * (0.75 + 0.4 * hash(i, k, 32));
          leaf(tip.x, tip.y, r, limbs.length - 1, i * 512 + k);
          // A birch's twigs hang in leaf all along.
          if (pieces > 2) leaf(pts[1].x, pts[1].y, r * 0.8, limbs.length - 3, i * 512 + 256 + k);
        }
      }
    }
    if (dead || !habit.leaf) return;
    // Leaves along the outer part of a branch and at its tip; a stem has them at its top.
    if (a.stem) {
      const top = pointAt(a.path, len);
      leaf(top.x, top.y, habit.leaf * 1.2, mine.k[mine.k.length - 1], i * 512 + 500);
      return;
    }
    // Clumps that touch rather than pile up: the crown reads the same, at half the pixels.
    const gap = Math.max(4, habit.leaf * 2);
    let n = 0;
    for (let s = len * (1 - habit.outer); s <= len; s += gap, n++) {
      const p = pointAt(a.path, s);
      const off = (n % 2 ? 1 : -1) * habit.leaf * 0.35;
      const dir = directionAt(a.path, s);
      leaf(
        p.x + Math.cos(dir) * off,
        p.y + Math.sin(dir) * off,
        habit.leaf * (0.8 + 0.4 * hash(i, n, 33)),
        hangOn(i, s).piece,
        i * 512 + 300 + n,
      );
    }
  });

  // A spruce's needles: a sagging bough every few px up its live crown, as long as the branches
  // that age reach.
  if (arch.species === "spruce" && drawn[0]) {
    const trunk = axes[0];
    const height = arch.heightAt(age);
    const crown = height * (habit.crown + (1 - habit.crown) * Math.exp(-age / habit.crownAge));
    for (let z = Math.max(4, height - crown); z < height - 2; z += 3) {
      const at = pointAt(trunk.path, z);
      if (cull && at.y < CULL_Y) break;
      const years = Math.max(0, age - arch.ageAtHeight(z));
      const r =
        habit.reach *
        PX_M *
        (1 - Math.exp(-habit.rate * years)) *
        (0.85 + 0.3 * hash(arch.seed, z, 34));
      clumps.push({ x: at.x, y: at.y, r: Math.max(1.5, r), at: 0 });
      clumpOn.push(hangOn(0, z).piece);
      clumpIds.push(100000 + Math.round(z));
    }
  }

  const plan: Plan = {
    species: arch.species,
    root,
    height: arch.heightAt(age),
    limbs,
    clumps,
    perch,
    fruit: [],
    parents,
    clumpOn,
    ids,
    clumpIds,
  };
  plans.set(arch, [{ age, cull, plan }, ...kept].slice(0, 4));
  return plan;
};

/** Where fruit hangs this year: under the leaves in reach of the room, a tree three years old
 *  or more. Chosen by `year`, so it holds still while the tree grows on. */
export const fruitAt = (plan: Plan, year: number, count: number, age: number): Pt[] => {
  if (age < 3 || !count) return [];
  return plan.clumps
    .map((c, i) => ({ c, i, h: hash(plan.clumpIds?.[i] ?? i, year, 35) }))
    .filter(({ c }) => c.y > 8 && c.y < plan.root.y - 6)
    .sort((a, b) => a.h - b.h)
    .slice(0, count)
    .map(({ c, i }) => ({
      x: c.x + (hash(i, year, 36) - 0.5) * c.r,
      y: c.y + hash(i, year, 37) * c.r * 0.6,
    }));
};
