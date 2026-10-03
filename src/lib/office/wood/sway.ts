// Every tree moves by the same rules. Its wood is a rig: each piece hangs off the piece its base
// touches (rebuilt from any plan, so a new kind needs nothing extra), and every clump, fruit
// and the owl's branch hangs off the piece nearest it. In wind a piece turns about its base,
// pushed as far as it stands upright and resisting as its width cubed; turns add up from the
// root out, so the trunk hardly moves, limbs more, twigs most. Each piece is a damped spring
// with its own pace, answering the wind of the last few seconds: a steady wind is a steady
// lean, a gust a bend that overshoots and settles. Clumps flutter on top of that.
// A tree is drawn posed by `posed.ts`.

import { hash } from "$lib/scene/pixel";

import { alongOf, type Pose, type Pt } from "./posed";
import { deciduous, grownAt, type Look, type Plan, type Species } from "./trees";
import { feltBy, historyOf, springOf } from "./wind";

/** Where something hangs: on piece `piece` (-1: the root), `t` of the way along it. */
type Hang = { piece: number; t: number };

type Rig = {
  joints: Hang[];
  /** How each piece answers the wind `LAG_S` apart, newest first; the weights sum to 1. */
  answer: Float64Array[];
  clumps: Hang[];
  fruit: Hang[];
  perch: Hang;
};

const offOf = (p: Pt, a: Pt, b: Pt) => {
  const t = alongOf(p, a, b);
  return Math.hypot(a.x + (b.x - a.x) * t - p.x, a.y + (b.y - a.y) * t - p.y);
};

/** The piece among the first `before` nearest `p`; the earliest wins a tie. */
const nearest = (plan: Plan, p: Pt, before: number): Hang & { off: number } => {
  let best = { piece: -1, t: 0, off: Infinity };
  for (let j = 0; j < before; j++) {
    const { a, b } = plan.limbs[j];
    const off = offOf(p, a, b);
    if (off < best.off - 1e-6) best = { piece: j, t: alongOf(p, a, b), off };
  }
  return best;
};

const rigs = new WeakMap<Plan, Rig>();

export const rigOf = (plan: Plan): Rig => {
  const known = rigs.get(plan);
  if (known) return known;
  const n = plan.limbs.length;
  const salt = Math.round(plan.root.x * 7 + plan.root.y);
  // A plan that knows where its pieces hang says so; otherwise generators lay a parent's pieces
  // before its children's, and a base at the root is a stem.
  const joints =
    plan.parents ??
    plan.limbs.map((l, k): Hang => {
      const up = nearest(plan, l.a, k);
      const root = Math.hypot(l.a.x - plan.root.x, l.a.y - plan.root.y);
      return root <= up.off + 1e-6 ? { piece: -1, t: 0 } : { piece: up.piece, t: up.t };
    });
  const hang = (p: Pt): Hang => {
    const { piece, t } = nearest(plan, p, n);
    return { piece, t };
  };
  const on = (p: Pt, piece: number): Hang =>
    piece < 0
      ? { piece, t: 0 }
      : { piece, t: alongOf(p, plan.limbs[piece].a, plan.limbs[piece].b) };
  const id = (k: number) => plan.ids?.[k] ?? k;
  const rig: Rig = {
    joints,
    // Twigs, in leaf, are damped harder than the wood they hang from.
    answer: plan.limbs.map((l, k) =>
      springOf(0.3 + 0.3 / l.w + 0.15 * hash(salt, id(k), 1), l.w <= 1 ? 0.45 : 0.3),
    ),
    clumps: plan.clumps.map((c, i) => (plan.clumpOn ? on(c, plan.clumpOn[i]) : hang(c))),
    fruit: plan.fruit.map(hang),
    perch: plan.perch ? hang(plan.perch) : { piece: -1, t: 0 },
  };
  rigs.set(plan, rig);
  return rig;
};

/** How readily each kind's wood gives: birch whips about, oak hardly. */
const FLEX: Record<Species, number> = {
  birch: 1.4,
  rowan: 1.2,
  cherry: 1,
  plum: 1,
  maple: 1,
  apple: 0.9,
  spruce: 0.8,
  pine: 0.8,
  oak: 0.7,
};

/**
 * Per unit of wind: the lean of an upright twig and the flap of any twig as the wind changes
 * (radians), a clump's flutter (px).
 */
const PUSH = 0.06;
const FLAP = 0.05;
const FLUTTER = 0.8;
/** No piece turns further than this on its own, nor with all it hangs from. */
const OWN_MAX = 0.3;
const ALL_MAX = 0.7;

const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));

/** How far everything on a tree has moved from rest, px, and the owl's branch with it. */
export type TreePose = Pose & { perch: Pt };

/**
 * `plan` at growth `g`, `t` seconds in, in `wind`: its strength at a scene x, `ago` seconds
 * before `t` (+ to the right; see `wind.ts`). A tree takes the wind where it stands. A bare
 * crown catches about half the wind a leafy one does.
 */
export const poseOf = (
  plan: Plan,
  g: number,
  look: Look,
  t: number,
  wind: (x: number, ago: number) => number,
): TreePose => {
  const rig = rigOf(plan);
  const at = grownAt(plan, g);
  const drag = deciduous(plan.species) ? 0.45 + 0.55 * look.leaves : 1;
  const flex = FLEX[plan.species] * drag;
  const n = plan.limbs.length;
  const history = historyOf(wind, plan.root.x);
  const settled = history.reduce((s, w) => s + w, 0) / history.length;
  const ends: { a: Pt; b: Pt; turn: number }[] = [];
  const da: Pt[] = [];
  const db: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const l = plan.limbs[k];
    const a = at(l.a);
    const b = at(l.b);
    const { piece: parent, t: along } = rig.joints[k];
    let o = a;
    let base = 0;
    if (parent >= 0) {
      // The base rides along its parent, wherever that has gone.
      const p = ends[parent];
      const pa = at(plan.limbs[parent].a);
      const pb = at(plan.limbs[parent].b);
      o = {
        x: a.x + p.a.x + (p.b.x - p.a.x) * along - (pa.x + (pb.x - pa.x) * along),
        y: a.y + p.a.y + (p.b.y - p.a.y) * along - (pa.y + (pb.y - pa.y) * along),
      };
      base = p.turn;
    }
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const up = -vy / (Math.hypot(vx, vy) || 1);
    const felt = feltBy(rig.answer[k], history);
    const own = clamp((flex * (PUSH * felt * up + FLAP * (felt - settled))) / l.w ** 3, OWN_MAX);
    const turn = clamp(base + own, ALL_MAX);
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const end = { x: o.x + vx * c - vy * s, y: o.y + vx * s + vy * c };
    ends.push({ a: o, b: end, turn });
    da.push({ x: o.x - a.x, y: o.y - a.y });
    db.push({ x: end.x - b.x, y: end.y - b.y });
  }
  const hung = (h: Hang): Pt =>
    h.piece < 0
      ? { x: 0, y: 0 }
      : {
          x: da[h.piece].x + (db[h.piece].x - da[h.piece].x) * h.t,
          y: da[h.piece].y + (db[h.piece].y - da[h.piece].y) * h.t,
        };
  // Leaves keep still in a light breeze and flutter once it blows.
  const flutter = flex * FLUTTER * Math.max(0, Math.abs(wind(plan.root.x, 0)) - 0.3);
  const clumps = rig.clumps.map((h, i) => {
    const d = hung(h);
    const ph = 2 * Math.PI * hash(plan.clumpIds?.[i] ?? i, 3, Math.round(plan.root.x));
    return {
      x: d.x + flutter * Math.sin(t * 6 + ph),
      y: d.y + flutter * 0.5 * Math.sin(t * 4.5 + ph * 1.7),
    };
  });
  return { a: da, b: db, clumps, fruit: rig.fruit.map(hung), perch: hung(rig.perch) };
};
