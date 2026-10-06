// The wall simulator: a masonry wall coming down, to watch, poke and tune. Its clock runs at a
// chosen rate from the `since` slider; a tap knocks a block out or brings roof down there, at
// that moment, recorded as input and baked in (scrub back before it and it never happened);
// the sliders retune the pace and re-bake at once. Overlays show how each block stands, how
// exposed it is, when it goes. korpi's masonry painter paints it, through the room's view.

import { type Input, lru, mix, rgb, type Rgba } from "@anarkisti/korpi/core";
import {
  type Body,
  classesAt,
  CRACK_S,
  exposureOf,
  fracture,
  gapsOf,
  halfDepth,
  halfHeight,
  heightOver,
  layBond,
  lying,
  moving,
  PACE,
  type Pace,
  pieceOf,
  releasedBy,
  type Spec,
  stateAt,
  type Wall,
  wallOf,
  warningAt,
} from "@anarkisti/korpi/masonry";
import {
  frameOf,
  paintStone,
  WALL_PALETTE,
  type WallPainter,
  wallPainter,
} from "@anarkisti/korpi/masonry/paint";
import { line, shifted } from "@anarkisti/korpi/paint";
import { floor } from "@anarkisti/korpi/shapes";
import { obliqueView } from "@anarkisti/korpi/view";

import { PX_M, SLOPE } from "$lib/office/depth";
import { WALL } from "$lib/office/draw";
import { SCENE_H, SCENE_W } from "$lib/office/engine";
import { mossColour } from "$lib/office/wood/moss";
import { specOf } from "$lib/office/wood/wall";
import { paintText } from "$lib/scene/pixelfont";

import { clock as hms, px, share } from "./show";
import type { Param, Stage, Unit, Values } from "./units";

/** The office's back wall, as the room lays it: the window an insert, the clock, the pay
 *  readout, the calendar and the signs hung on it. */
const SPEC: Spec = specOf(WALL);

/** The room's view, its horizon the wall's ground row; the wall's face from the top of the
 *  scene, so a cell of the wall is a scene px. */
const VIEW = obliqueView({
  w: SCENE_W,
  h: SCENE_H,
  pxPerM: PX_M,
  k: SLOPE,
  horizon: SPEC.ground,
});
const AT = { x: 0, y: SPEC.ground / PX_M, z: 0 };

/** Ways of building it: course height, a piece's length and the wall's thickness, px. Bricks
 *  come away brick by brick, rubble stone by stone, from a wall 50 cm thick. */
const BUILDS = {
  block: { course: 8, unit: 16, thickness: 8, brittle: 1 },
  brick: { course: 4, unit: 10, thickness: 9, brittle: 0.4 },
  rubble: { course: 12, unit: 18, thickness: 20, brittle: 0.25 },
} as const;
type Build = keyof typeof BUILDS;

/** How fast its clock runs against the bench's (which space pauses). */
const RATES: Record<string, number> = {
  "1×": 1,
  "10×": 10,
  "100×": 100,
  "1000×": 1000,
};

/** The tunable part of the pace, slider by slider. */
type Tune = Param & { kind: "range"; get: (p: Pace) => number };
/** A slider of the pace, folded under its heading. */
const tune = (t: Omit<Tune, "kind" | "group">): Tune => ({ ...t, kind: "range", group: "pace" });
const TUNE: Tune[] = [
  tune({
    key: "eta",
    min: 3600,
    max: 72000,
    step: 600,
    show: hms,
    hint: "wear's Weibull scale: a block's typical life",
    get: (p) => p.eta,
  }),
  tune({
    key: "beta",
    min: 1,
    max: 3,
    step: 0.1,
    hint: "wear's shape: over 1, the older the faster it goes",
    get: (p) => p.beta,
  }),
  tune({
    key: "free",
    min: 1,
    max: 8,
    step: 0.5,
    hint: "× wear for a block with its top free",
    get: (p) => p.free,
  }),
  tune({
    key: "open",
    min: 1,
    max: 5,
    step: 0.25,
    hint: "× wear for a block beside a gap",
    get: (p) => p.open,
  }),
  tune({
    key: "glued",
    min: 1,
    max: 30,
    step: 1,
    hint: "× wear for one held over an edge by mortar alone",
    get: (p) => p.glued,
  }),
  tune({
    key: "confined",
    min: 0,
    max: 0.5,
    step: 0.01,
    hint: "× wear for one held on every side",
    get: (p) => p.confined,
  }),
  tune({
    key: "shock",
    min: 0,
    max: 0.1,
    step: 0.005,
    hint: "how hard a collapse shakes what is near it",
    get: (p) => p.after[0],
  }),
  tune({
    key: "collapses",
    min: 0,
    max: 30,
    step: 1,
    hint: "roof collapses after the blast",
    get: (p) => p.collapses,
  }),
  tune({
    key: "bite",
    min: 4,
    max: 97,
    step: 1,
    show: px,
    hint: "how far down from the top a collapse knocks off",
    get: (p) => p.bite,
  }),
  tune({
    key: "sinks",
    min: 60,
    max: 14400,
    step: 60,
    show: hms,
    hint: "how long a fallen piece takes to sink away",
    get: (p) => p.sink[1],
  }),
  tune({
    key: "bounce",
    min: 0,
    max: 0.8,
    step: 0.05,
    show: share,
    hint: "a landing's speed kept upward",
    get: (p) => p.bounce[0],
  }),
  tune({
    key: "repose",
    min: 0.3,
    max: 1.5,
    step: 0.05,
    hint: "the steepest the heap stands, rise over run",
    get: (p) => p.repose,
  }),
  tune({
    key: "glue",
    min: 0,
    max: 6,
    step: 0.5,
    show: px,
    hint: "how far past its bed mortar holds a block",
    get: (p) => p.glue,
  }),
];

const paceOf = (v: Values): Pace => ({
  ...PACE,
  eta: Number(v.eta),
  beta: Number(v.beta),
  free: Number(v.free),
  open: Number(v.open),
  glued: Number(v.glued),
  confined: Number(v.confined),
  after: [Number(v.shock), PACE.after[1]],
  collapses: Number(v.collapses),
  bite: Number(v.bite),
  sink: [PACE.sink[0], Number(v.sinks)],
  bounce: [Number(v.bounce), PACE.bounce[1]],
  repose: Number(v.repose),
  glue: Number(v.glue),
});

/** The taps given, per seed, in time order: recorded input, at points on the wall's face. */
const taps = new Map<number, Input[]>();
const tapsOf = (seed: number) => {
  const known = taps.get(seed) ?? [];
  taps.set(seed, known);
  return known;
};

/** Walls by seed, build, tuning and taps, the newest few kept, each with its painter. */
const walls = lru<string, { wall: Wall; painter: WallPainter }>(16);
const wallFor = (v: Values) => {
  const seed = Number(v.seed);
  const build = String(v.wall) as Build;
  const pace = paceOf(v);
  const inputs = tapsOf(seed);
  const key = `${seed}|${build}|${v.plaster}|${JSON.stringify(pace)}|${JSON.stringify(inputs)}`;
  return walls.get(key, () => {
    const spec = { ...SPEC, ...BUILDS[build], bond: build, plaster: Boolean(v.plaster) };
    const wall = wallOf({ spec, seed, at: AT, pace, inputs: [...inputs] });
    return { wall, painter: wallPainter(wall) };
  });
};

/** The simulator's clock: from the `since` slider, at the chosen rate on the bench's clock,
 *  re-anchored whenever either changes so the wall never jumps. */
const clock = { slider: NaN, rate: NaN, base: 0, t0: 0 };
const sinceOf = (v: Values, t: number) => {
  const slider = Number(v.since);
  const rate = RATES[String(v.rate)] ?? 1;
  if (slider !== clock.slider) {
    Object.assign(clock, { slider, rate, base: slider, t0: t });
  } else if (rate !== clock.rate) {
    Object.assign(clock, { base: clock.base + (t - clock.t0) * clock.rate, t0: t, rate });
  }
  return clock.base + (t - clock.t0) * clock.rate;
};

const SKY = rgb("#9cc4e4");
const DADO = rgb("#8d969c");
const GRASS = rgb("#4f7f33");
const GLASS = rgb("#5d7f9c");
const FRAME = rgb("#3a3f45");
const EDGE = rgb("#3c3c46");
const CRACKED = rgb("#d08020");
const SHAKING = rgb("#ff3020");
const ARCHED = rgb("#7fd88f");
const UNARCHED = rgb("#f0a0a0");
const COURSES = [rgb("#b4bbc0"), rgb("#c6ccd0")];
const CLASS: Record<string, Rgba> = {
  bedded: rgb("#b9c0c4"),
  glued: rgb("#e0a040"),
  pinned: rgb("#9a70d0"),
  drop: rgb("#e04040"),
  topple: rgb("#e04040"),
};
/** `c` at `a` of 255. */
const alphaOf = (c: Rgba, a: number): Rgba => ((c & 0xffffff) | (a << 24)) >>> 0;

const draw = ({ pen, scene }: Stage, v: Values, t: number) => {
  const since = sinceOf(v, t);
  const { wall, painter } = wallFor(v);
  const r = wall.ruin;
  const { bond } = r;
  const { w: W, h: H } = SPEC;
  const show = String(v.show);
  const at = frameOf(VIEW, wall.placement);
  const face = at.d0;
  // The room around the wall: sky far behind it, the dado under it, the floor before it.
  pen.fill(SKY, 0, 0, SCENE_W, SCENE_H, 1e3);
  pen.fill(DADO, at.ox, at.oy + H, W, SPEC.ground - H, face);
  const deep = (SCENE_H - SPEC.ground) / (SLOPE * PX_M) + 1;
  floor(pen, VIEW, { x0: 0, x1: W / PX_M, z0: 0, z1: deep }, GRASS);

  const state = stateAt(r, since);
  // The window in its opening, just behind the face, and what hangs on the wall outlined:
  // where they are, on the wall or coming down upright in front of it.
  for (const { name } of [...SPEC.inserts, ...SPEC.hangs]) {
    const { on, rect: f } = wall.hung(name, since);
    const glass = name === "window";
    const it = shifted(pen, {
      dx: at.ox,
      dy: at.oy,
      dd: on ? face + (glass ? 1e-4 : -1e-3) : face - 0.05,
    });
    const [x0, y0] = [Math.round(f.x), Math.round(f.y)];
    const [x1, y1] = [x0 + f.w - 1, y0 + f.h - 1];
    if (glass) {
      it.fill(FRAME, x0, y0, f.w, f.h);
      it.fill(GLASS, x0 + 1, y0 + 1, f.w - 2, f.h - 2);
      continue;
    }
    line(it, FRAME, x0, y0, x1, y0);
    line(it, FRAME, x0, y1, x1, y1);
    line(it, FRAME, x0, y0, x0, y1);
    line(it, FRAME, x1, y0, x1, y1);
  }
  painter.paint(scene, VIEW, since);

  if (show !== "look") {
    // Each block flat in what is shown, its outline darker, or cracked while it is about to
    // go; in `classes`, a gap tinted by whether the wall arches over it. Over the face, under
    // what hangs on it.
    const over = shifted(pen, { dx: at.ox, dy: at.oy, dd: face - 5e-4 });
    const classes = classesAt(r, since);
    const warn = new Map(warningAt(r, since).map((w) => [w.i, w.shake]));
    const { gaps, gapOf } = gapsOf(bond, state);
    const nc = bond.edges.length - 1;
    for (const b of bond.blocks) {
      const up = state.standing[b.i] === 1;
      if (!up) {
        if (show !== "classes") continue;
        for (const q of b.px) {
          const x = q % W;
          const g = gapOf[Math.min(nc - 1, b.course) * W + x];
          const tint = g >= 0 ? (gaps[g].arched ? ARCHED : UNARCHED) : SKY;
          over.fill(alphaOf(mix(SKY, tint, 0.6), 110), x, (q - x) / W);
        }
        continue;
      }
      let c = COURSES[b.course % 2];
      if (show === "classes") c = CLASS[classes[b.i] ?? "bedded"];
      else if (show === "hazard") {
        const m = exposureOf(bond, b.i, state, classes, r.pace);
        c = mix(rgb("#3060c0"), rgb("#e03020"), Math.min(1, Math.log1p(m) / Math.log1p(12)));
      } else if (show === "order") {
        const went = r.releaseAt[b.i];
        const k = Number.isFinite(went) ? Math.min(1, Math.log1p(went / 60) / Math.log1p(720)) : 1;
        c = mix(rgb("#e04030"), rgb("#f0f0e0"), k);
      }
      const shake = warn.get(b.i);
      const rim = shake === undefined ? mix(c, EDGE, 0.45) : shake ? SHAKING : CRACKED;
      for (const q of b.px) {
        const x = q % W;
        const y = (q - x) / W;
        const edge =
          x === 0 ||
          x === W - 1 ||
          y === 0 ||
          y === H - 1 ||
          bond.owner[q - 1] !== b.i ||
          bond.owner[q + 1] !== b.i ||
          bond.owner[q - W] !== b.i ||
          bond.owner[q + W] !== b.i;
        over.fill(edge ? rim : c, x, y);
      }
    }
  }

  // Over everything, as on a glass in front of it: the heap's height, and the readout.
  const top = shifted(pen, { dx: at.ox, dy: at.oy, dd: -1e3 });
  if (show === "pile") {
    // The heap's height along the wall, nearest the wall and at its toe.
    for (const [z0, z1, hex] of [
      [0, 6, "#ffe040"],
      [14, 28, "#ff8040"],
    ] as const) {
      for (let x = 0; x < W; x += 2) {
        const high = heightOver(r.pile, x, x + 1, z0, z1, since);
        if (high > 0) top.fill(rgb(hex), x, Math.round(SPEC.ground - high + at.k * z0), 2, 1);
      }
    }
  }
  const standing = state.standing.reduce((s, x) => s + x, 0);
  const lines = [
    `${hms(since)}  ${String(v.rate).replace("×", "x")}  seed ${v.seed}`,
    `standing ${standing}/${bond.blocks.length}  released ${releasedBy(r, since)}  window ${state.inserts[0] ? "in" : "out"}`,
    `bake ${wall.inspect().bakeMs.toFixed(0)}ms  taps ${tapsOf(Number(v.seed)).length}  cracked ${warningAt(r, since).length} (${CRACK_S}s ahead)`,
    `falling ${moving(r, since).length}  lying ${lying(r, since).length}  thuds ${r.cues.filter((c) => c.t <= since).length}`,
  ];
  lines.forEach((text, i) => paintText(top, text, 4, H + 6 + i * 10, "#20262c"));
};

export const wallSim: Unit = {
  name: "wall",
  about: "the back wall coming down, to watch, poke and tune; a tap on it does what tap is set to",
  defaults: {
    seed: 1,
    since: 0,
    rate: "1×",
    show: "look",
    wall: "block",
    plaster: 1,
    tap: "knock out",
    ...Object.fromEntries(TUNE.map((p) => [p.key, p.get(PACE)])),
  },
  params: () => [
    { kind: "seed", key: "seed" },
    {
      kind: "range",
      key: "since",
      min: 0,
      max: 43200,
      step: 0.1,
      show: hms,
      hint: "where its clock starts; scrub back before a tap and it never happened",
    },
    {
      kind: "select",
      key: "rate",
      options: Object.keys(RATES),
      hint: "its clock against the bench's",
    },
    { kind: "select", key: "wall", options: Object.keys(BUILDS) },
    { kind: "toggle", key: "plaster", hint: "a coat that comes off in patches" },
    {
      kind: "select",
      key: "show",
      options: ["look", "classes", "hazard", "order", "pile"],
      hint: "as drawn, how each block stands, how exposed, when it goes, the heap",
    },
    {
      kind: "select",
      key: "tap",
      options: ["knock out", "roof", "forget taps"],
      hint: "knock out the block, bring roof down there, or forget this seed's taps",
    },
    ...TUNE.map(({ get: _, ...param }) => param),
  ],
  size: () => ({ w: SCENE_W, h: SCENE_H }),
  animated: true,
  draw,
  tap: (v, t, at) => {
    const seed = Number(v.seed);
    const how = String(v.tap);
    if (how === "forget taps") {
      taps.set(seed, []);
      return;
    }
    if (at.y >= SPEC.h) return;
    // The point on the wall's face under the tap.
    const p = VIEW.unproject(at.x, at.y, -AT.z);
    const kind = how === "roof" ? "roof" : "block";
    tapsOf(seed).push({ t: sinceOf(v, t), p, kind, source: "bench" });
    tapsOf(seed).sort((a, b) => a.t - b.t);
  },
};

/** One stone of the wall as the room draws it, at any turn, whole or broken, mossed or sunk:
 *  for tuning how stones look. It stands on a strip of floor, lying or upright as turned. */
const STONE = { w: 96, h: 64, ground: 44 };
const PIECES = ["whole", "piece 1", "piece 2", "chip"] as const;

const stoneOf = (v: Values): Body => {
  const seed = Number(v.seed);
  const bond = layBond(SPEC, seed);
  const block = bond.blocks[Math.min(bond.blocks.length - 1, Number(v.block))];
  const piece = pieceOf(bond, block);
  const whole: Body = {
    id: block.i,
    block: block.i,
    mask: piece.mask,
    w: piece.w,
    h: piece.h,
    T: SPEC.thickness,
    n: piece.n,
    ox: piece.x,
    oy: piece.y,
    start: 0,
    phases: [],
    lands: 0,
    out: false,
    settled: 0,
    lying: null,
    broken: false,
    parent: null,
    chip: false,
    fresh: null,
  };
  const which = String(v.piece);
  if (which === "whole") return whole;
  const pieces = fracture(whole.mask, whole.w, whole.h, seed * 977 + block.i, 120);
  const wanted =
    which === "chip"
      ? pieces.find((p) => p.chip)
      : pieces.filter((p) => !p.chip)[which === "piece 1" ? 0 : 1];
  const pc = wanted ?? pieces[0];
  return {
    ...whole,
    mask: pc.mask,
    fresh: pc.fresh,
    w: pc.w,
    h: pc.h,
    n: pc.n,
    T: pc.chip ? Math.max(2, Math.round(Math.sqrt(pc.n))) : SPEC.thickness,
    chip: pc.chip,
  };
};

export const stoneUnit: Unit = {
  name: "stone",
  about: "one stone of the wall as the room draws it, at any turn, whole or broken",
  defaults: { seed: 1, block: 40, piece: "whole", phi: 1.57, theta: 0, moss: 0, sink: 0 },
  params: () => [
    { kind: "seed", key: "seed" },
    { kind: "range", key: "block", min: 0, max: 80, step: 1, hint: "which block of the wall" },
    { kind: "select", key: "piece", options: PIECES, hint: "whole, a piece of it broken, a chip" },
    {
      kind: "range",
      key: "phi",
      min: -3.2,
      max: 3.2,
      step: 0.05,
      hint: "tipped out of the wall's plane, top toward the room, radians",
    },
    {
      kind: "range",
      key: "theta",
      min: -0.6,
      max: 0.6,
      step: 0.02,
      hint: "turned in the wall's plane, radians",
    },
    { kind: "range", key: "moss", min: 0, max: 1, step: 0.05, show: share },
    {
      kind: "range",
      key: "sink",
      min: 0,
      max: 16,
      step: 1,
      show: px,
      hint: "how far it has sunk into the ground",
    },
  ],
  size: () => ({ w: STONE.w, h: STONE.h }),
  draw: ({ pen, scene }, v) => {
    pen.fill(DADO, 0, 0, STONE.w, STONE.ground, 10);
    pen.fill(GRASS, 0, STONE.ground, STONE.w, STONE.h - STONE.ground, 10);
    const body = stoneOf(v);
    const phi = Number(v.phi);
    const theta = Number(v.theta);
    const z = 8;
    const pose = {
      x: STONE.w / 2,
      y: STONE.ground - halfHeight(body.w, body.h, body.T, phi, theta) - SLOPE * z,
      z,
      phi,
      theta,
    };
    paintStone(scene, { ox: 0, oy: 0, d0: 0, k: SLOPE, pxPerM: PX_M }, body, pose, {
      palette: WALL_PALETTE,
      sink: Number(v.sink),
      moss: Number(v.moss),
      mossColour: (x, y, up) => mossColour(x, y, up, 0),
      ground: STONE.ground + Math.round(SLOPE * (z + halfDepth(body.h, body.T, phi))),
    });
  },
};
