// How the soft plants move, which is not how trees do: shrubs, climbers, flowers, grass. None has a
// skeleton to lean. Each stem is a whippy rod, bending smoothly from its base (more at the
// tip) as a damped spring answering the wind at its own pace, and a long one nods as it
// swings; a climber clings to the wall and hardly bends at all. A wave runs downwind across
// them: grass bows to it, and leaves ride their stems and ripple on it, turning over on its
// crest to their paler undersides in a stiff wind. Down by the floor the wind is weaker.

import { hash } from "$lib/scene/pixel";

import type { Pose, Pt } from "./posed";
import { grownFrom, type Rustler, type Sprawl } from "./sprawl";
import type { Look } from "./trees";
import { feltBy, historyOf, springOf } from "./wind";

type Give = {
  /** The stems' pace (Hz), and how soon they settle. */
  hz: number;
  zeta: number;
  /** How far a stem's tip gives per unit of wind, as a share of its length. */
  give: number;
  /** How much a swinging tip dips, as a share of its swing. */
  nod: number;
  /** How far a passing wave bends a stem's tip, px per unit of wind. */
  wave: number;
  /** How far leaves ripple on it, px per unit of wind. */
  ripple: number;
  /** The most of a clump's leaves that turn over on a wave's crest, in a gale. */
  silver: number;
  /** Keeps its leaves (needles) all year. */
  evergreen?: boolean;
};

/** A flower is a stalk and a head: the short ones quiver, the tall ones bow to the wave. */
const STALK: Give = {
  hz: 1.5,
  zeta: 0.35,
  give: 0.25,
  nod: 0.3,
  wave: 0.6,
  ripple: 0,
  silver: 0,
  evergreen: true,
};

const KIND: Record<Rustler, Give> = {
  raspberry: { hz: 0.8, zeta: 0.25, give: 0.15, nod: 0.35, wave: 0, ripple: 1.2, silver: 0.7 },
  lilac: { hz: 0.6, zeta: 0.3, give: 0.12, nod: 0.15, wave: 0, ripple: 1, silver: 0.3 },
  juniper: {
    hz: 1.3,
    zeta: 0.5,
    give: 0.05,
    nod: 0,
    wave: 0,
    ripple: 0.4,
    silver: 0,
    evergreen: true,
  },
  bilberry: { hz: 1.8, zeta: 0.5, give: 0.25, nod: 0.2, wave: 0, ripple: 0.5, silver: 0.4 },
  // Climbers hold to the wall: their leaves move, their stems hardly.
  creeper: { hz: 1.2, zeta: 0.4, give: 0, nod: 0, wave: 0, ripple: 0.6, silver: 0.25 },
  hop: { hz: 0.5, zeta: 0.3, give: 0.03, nod: 0.2, wave: 0, ripple: 0.8, silver: 0.35 },
  clematis: { hz: 0.7, zeta: 0.35, give: 0.02, nod: 0.1, wave: 0, ripple: 0.7, silver: 0.15 },
  coltsfoot: STALK,
  dandelion: STALK,
  anemone: STALK,
  sorrel: { ...STALK, give: 0.15, wave: 0.3 },
  lily: { ...STALK, hz: 1.3, give: 0.15 },
  harebell: { ...STALK, hz: 1.2, give: 0.35, nod: 0.4, wave: 1 },
  oxeye: { ...STALK, hz: 1, give: 0.3, wave: 1.1 },
  fireweed: { ...STALK, hz: 0.7, zeta: 0.3, give: 0.12, nod: 0.2, wave: 0.8 },
  // Grass is all stem, and the wave runs through it.
  grass: {
    hz: 1.1,
    zeta: 0.3,
    give: 0.3,
    nod: 0.35,
    wave: 1.4,
    ripple: 0,
    silver: 0,
    evergreen: true,
  },
};

/** The share of the wind that reaches down among the soft plants. */
const SHELTER = 0.6;
/** A wave's pace across the plants, and how fast it travels, scene px/s. */
const RIPPLE_HZ = 0.7;
const RIPPLE_PX_S = 30;
/** Leaves keep still below this much wind, start turning over above the next, and are as
 *  turned as they get by the last. */
const STIR = 0.15;
const TURN = 0.45;
const GALE = 1.1;

type Stems = { length: number[]; base: Pt[]; spring: Float64Array[] };
const stemsOf = new WeakMap<Sprawl, Stems>();

const stems = (plan: Sprawl): Stems => {
  const known = stemsOf.get(plan);
  if (known) return known;
  const { hz, zeta } = KIND[plan.kind];
  const length = Array.from({ length: plan.stems }, () => 0);
  const base = Array.from({ length: plan.stems }, () => plan.root);
  for (const p of plan.pieces) {
    length[p.stem] += Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
    if (p.s0 === 0) base[p.stem] = p.a;
  }
  const salt = Math.round(plan.root.x * 3 + plan.root.y);
  const out = {
    length,
    base,
    // Each stem a little out of step with the next.
    spring: length.map((_, k) => springOf(hz * (0.8 + 0.4 * hash(salt, k, 4)), zeta)),
  };
  stemsOf.set(plan, out);
  return out;
};

/**
 * `plan` at growth `g`, `t` seconds in, in `wind`: its strength at a scene x, `ago` seconds
 * before `t` (+ to the right). Bare stems catch less of it than leafy ones.
 */
export const rustleOf = (
  plan: Sprawl,
  g: number,
  look: Look,
  t: number,
  wind: (x: number, ago: number) => number,
): Pose => {
  const kind = KIND[plan.kind];
  const { length, base, spring } = stems(plan);
  const sheltered = (x: number, ago: number) => wind(x, ago) * SHELTER;
  const history = historyOf(sheltered, plan.root.x);
  const leafy = kind.evergreen ? 1 : 0.4 + 0.6 * look.leaves;
  const now = sheltered(plan.root.x, 0);
  const dir = Math.sign(now) || 1;
  const stir = Math.max(0, Math.abs(now) - STIR);
  /** Where a wave running downwind is at `x`, `y`, as a phase. */
  const waveAt = (x: number, y: number, salt: number) =>
    2 * Math.PI * (RIPPLE_HZ * t - (dir * x) / (RIPPLE_PX_S / RIPPLE_HZ) + salt * 0.25) + y * 0.35;
  // How far each stem's tip has gone, px, and the rod's shape below it.
  const tips = spring.map((sp, k) => {
    const lean = kind.give * length[k] * g * leafy * feltBy(sp, history);
    if (!kind.wave) return lean;
    const bow = 0.5 + 0.5 * Math.sin(waveAt(base[k].x, 0, hash(k, 6)));
    return lean + dir * kind.wave * stir * bow * g;
  });
  const bent = (stem: number, s: number): Pt => {
    const d = tips[stem] ?? 0;
    return { x: d * s ** 1.5, y: kind.nod * Math.abs(d) * s * s };
  };
  const a = plan.pieces.map((p) => bent(p.stem, p.s0));
  const b = plan.pieces.map((p) => bent(p.stem, p.s1));

  // Leaves ripple on the wave, and as its crest comes through they turn over, leaf by leaf, and
  // back as it passes: the harder the wind, the more of them.
  const swell = kind.ripple * leafy * stir;
  const at = grownFrom(plan, g);
  const blowing = Math.min(1, Math.max(0, (Math.abs(now) - TURN) / (GALE - TURN)));
  const turned: number[] = [];
  const clumps = plan.clumps.map((c, i) => {
    const q = at(c);
    const salt = hash(i, 9, Math.round(plan.root.x));
    const crest = Math.sin(waveAt(q.x, q.y, salt));
    const rising = Math.min(1, Math.max(0, (crest - 0.2) / 0.8));
    turned.push(kind.silver * blowing * rising * (0.6 + 0.4 * salt));
    const d = bent(c.stem, c.s);
    const lift = 0.5 + 0.5 * crest;
    return { x: d.x + dir * swell * lift, y: d.y - swell * 0.25 * lift };
  });
  const fruit = plan.fruit.map((f) => bent(f.stem, f.s));
  return { a, b, clumps, fruit, turned };
};
