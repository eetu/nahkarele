// The wall simulator: a masonry wall coming down, to watch, poke and tune. Its clock runs at a
// chosen rate from the `since` slider; a tap knocks a block out or brings roof down there, at
// that moment, recorded as a blow in the spec and baked in (scrub back before it and it never
// happened); the sliders retune the pace and re-bake at once. Overlays show how each block
// stands, how exposed it is, when it goes.

import { layBond } from "$lib/masonry/bond";
import { exposureOf, PACE, type Pace } from "$lib/masonry/decay";
import { halfDepth, halfHeight } from "$lib/masonry/fall";
import { fracture } from "$lib/masonry/fracture";
import { heightOver } from "$lib/masonry/pile";
import {
  classesAt,
  CRACK_S,
  hangOn,
  lying,
  moving,
  releasedBy,
  stateAt,
  warningAt,
} from "$lib/masonry/query";
import { type Body, pieceOf } from "$lib/masonry/rubble";
import { gapsOf } from "$lib/masonry/stability";
import { bake, type Ruin } from "$lib/masonry/timeline";
import type { Knock, Spec } from "$lib/masonry/types";
import { WALL } from "$lib/office/draw";
import { SCENE_H, SCENE_W } from "$lib/office/engine";
import { type Face, faceOf, K, nearOf, paintStone } from "$lib/office/wood/stones";
import { specOf } from "$lib/office/wood/wall";
import { rect } from "$lib/scene/pixel";
import { drawPixelText } from "$lib/scene/pixelfont";

import type { Unit, Values } from "./units";

/** The office's back wall, as the room lays it: the window an insert, the clock, the pay
 *  readout, the calendar and the signs hung on it. */
const SPEC: Spec = specOf(WALL);

/** Ways of building it: course height, a piece's length and the wall's thickness, px. Bricks
 *  come away brick by brick, rubble stone by stone, from a wall 50 cm thick. */
const BUILDS = {
  block: { course: 8, unit: 16, thickness: 8, brittle: 1 },
  brick: { course: 4, unit: 10, thickness: 9, brittle: 0.4 },
  rubble: { course: 12, unit: 18, thickness: 20, brittle: 0.25 },
} as const;
type Build = keyof typeof BUILDS;

const specs = new Map<string, Spec>();
/** The wall as built and coated in the controls, the same object for the same choice. */
const specFor = (v: Values): Spec => {
  const bond = String(v.wall) as Build;
  const plaster = Boolean(v.plaster);
  const key = `${bond}|${plaster}`;
  let spec = specs.get(key);
  if (!spec) {
    spec = { ...SPEC, bond, plaster, ...BUILDS[bond] };
    specs.set(key, spec);
  }
  return spec;
};

/** How fast its clock runs against the bench's (which space pauses). */
const RATES: Record<string, number> = {
  "1×": 1,
  "10×": 10,
  "100×": 100,
  "1000×": 1000,
};

/** The tunable part of the pace, slider by slider. */
const TUNE: { key: string; min: number; max: number; step: number; get: (p: Pace) => number }[] = [
  { key: "eta", min: 3600, max: 72000, step: 600, get: (p) => p.eta },
  { key: "beta", min: 1, max: 3, step: 0.1, get: (p) => p.beta },
  { key: "free", min: 1, max: 8, step: 0.5, get: (p) => p.free },
  { key: "open", min: 1, max: 5, step: 0.25, get: (p) => p.open },
  { key: "glued", min: 1, max: 30, step: 1, get: (p) => p.glued },
  { key: "confined", min: 0, max: 0.5, step: 0.01, get: (p) => p.confined },
  { key: "shock", min: 0, max: 0.1, step: 0.005, get: (p) => p.after[0] },
  { key: "collapses", min: 0, max: 30, step: 1, get: (p) => p.collapses },
  { key: "bite", min: 4, max: 97, step: 1, get: (p) => p.bite },
  { key: "sinks", min: 60, max: 14400, step: 60, get: (p) => p.sink[1] },
  { key: "bounce", min: 0, max: 0.8, step: 0.05, get: (p) => p.bounce[0] },
  { key: "repose", min: 0.3, max: 1.5, step: 0.05, get: (p) => p.repose },
  { key: "glue", min: 0, max: 6, step: 0.5, get: (p) => p.glue },
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

/** The taps given, per seed, in time order. */
const taps = new Map<number, Knock[]>();
const tapsOf = (seed: number) => {
  const known = taps.get(seed) ?? [];
  taps.set(seed, known);
  return known;
};

/** Bakes by seed, taps and tuning, the latest few kept, with how long each took. */
const bakes = new Map<string, { ruin: Ruin; ms: number }>();
const ruinFor = (v: Values) => {
  const seed = Number(v.seed);
  const knocks = tapsOf(seed);
  const pace = paceOf(v);
  const key = `${seed}|${v.wall}|${v.plaster}|${JSON.stringify(pace)}|${JSON.stringify(knocks)}`;
  const known = bakes.get(key);
  if (known) return known;
  const t0 = performance.now();
  const ruin = bake({ ...specFor(v), knocks: [...knocks] }, seed, pace);
  const made = { ruin, ms: performance.now() - t0 };
  bakes.set(key, made);
  if (bakes.size > 16) bakes.delete(bakes.keys().next().value as string);
  return made;
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

const hms = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);

const CLASS: Record<string, string> = {
  bedded: "#b9c0c4",
  glued: "#e0a040",
  pinned: "#9a70d0",
  drop: "#e04040",
  topple: "#e04040",
};

/** The canvases a tile draws through, by name: one for each layer (what falls behind the
 *  wall, the wall, the room) and each tile of a grid of seeds, which all draw in one frame.
 *  One canvas drawn, refilled and drawn again in a frame leaves the browser to keep the first
 *  contents for the first draw; Safari draws lazily and shows the second contents twice. */
type Layer = { canvas: HTMLCanvasElement; image: ImageData; pixels: Uint32Array };
const layers = new Map<string, Layer>();
const layerOf = (name: string, w: number, h: number): Layer => {
  let it = layers.get(name);
  if (!it || it.image.width !== w || it.image.height !== h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const image = new ImageData(w, h);
    it = { canvas, image, pixels: new Uint32Array(image.data.buffer) };
  }
  // The latest last, so after many seeds the longest unused goes.
  layers.delete(name);
  layers.set(name, it);
  if (layers.size > 64) layers.delete(layers.keys().next().value as string);
  return it;
};
/** `image` onto layer `name`, ready to draw. */
const shown = (name: string, image: ImageData) => {
  const { canvas } = layerOf(name, image.width, image.height);
  canvas.getContext("2d")?.putImageData(image, 0, 0);
  return canvas;
};

const faces = new WeakMap<Ruin, Map<number, { face: Face; back?: Face }>>();
/** A stone's faces: inside as the wall's face was when it left (plaster or masonry), outside
 *  bare masonry, but for blocks, rendered. Kept by ruin and by when it left, which matters
 *  only under plaster. */
const facesOf = (r: Ruin, body: Body) => {
  let known = faces.get(r);
  if (!known) {
    known = new Map();
    faces.set(r, known);
  }
  const at = r.skin ? body.start : 0;
  let made = known.get(at);
  if (!made) {
    made = {
      face: faceOf(r.bond, r.skin, at),
      back: r.spec.bond && r.spec.bond !== "block" ? faceOf(r.bond, null, 0) : undefined,
    };
    known.set(at, made);
  }
  return made;
};

const draw = (ctx: CanvasRenderingContext2D, v: Values, t: number) => {
  const since = sinceOf(v, t);
  const { ruin: r, ms } = ruinFor(v);
  const { bond } = r;
  const tile = Number(v.seed);
  const { w: W, h: H } = SPEC;
  const show = String(v.show);
  // The room around the wall: sky behind it, the dado, the floor.
  ctx.fillStyle = "#9cc4e4";
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  ctx.fillStyle = "#8d969c";
  ctx.fillRect(0, H, SCENE_W, SPEC.ground - H);
  ctx.fillStyle = "#4f7f33";
  ctx.fillRect(0, SPEC.ground, SCENE_W, SCENE_H - SPEC.ground);

  const state = stateAt(r, since);
  const classes = classesAt(r, since);
  const warn = new Map(warningAt(r, since).map((w) => [w.i, w.shake]));
  const { gaps, gapOf } = gapsOf(bond, state);
  const img = new ImageData(W, H);
  const put = (q: number, rgb: number[]) => img.data.set([...rgb.map(Math.round), 255], q * 4);
  const sky = hex("#9cc4e4");
  const nc = bond.edges.length - 1;
  const look = faceOf(bond, r.skin, since);
  const words = new Uint32Array(img.data.buffer);
  for (const b of bond.blocks) {
    const up = state.standing[b.i] === 1;
    let fill = hex(b.course % 2 ? "#c6ccd0" : "#b4bbc0");
    if (show === "look") {
      const cracked = warn.get(b.i);
      for (const q of b.px) {
        if (!up) continue;
        const x = q % W;
        const y = (q - x) / W;
        const rim =
          cracked !== undefined &&
          (bond.owner[q - 1] !== b.i ||
            bond.owner[q + 1] !== b.i ||
            bond.owner[q - W] !== b.i ||
            bond.owner[q + W] !== b.i);
        words[q] = rim ? (cracked ? 0xff2030ff : 0xff2080d0) : look(x, y, false);
      }
      continue;
    }
    if (show === "classes") fill = hex(CLASS[classes[b.i] ?? "bedded"]);
    else if (show === "hazard" && up) {
      const m = exposureOf(bond, b.i, state, classes, r.pace);
      fill = mix(hex("#3060c0"), hex("#e03020"), Math.min(1, Math.log1p(m) / Math.log1p(12)));
    } else if (show === "order") {
      const at = r.releaseAt[b.i];
      const k = Number.isFinite(at) ? Math.min(1, Math.log1p(at / 60) / Math.log1p(720)) : 1;
      fill = mix(hex("#e04030"), hex("#f0f0e0"), k);
    }
    for (const q of b.px) {
      const x = q % W;
      const y = (q - x) / W;
      if (!up) {
        // Gone: the sky, tinted by whether the wall arches over the gap here.
        if (show === "classes") {
          const g = gapOf[Math.min(nc - 1, b.course) * W + x];
          const tint = g >= 0 ? (gaps[g].arched ? hex("#7fd88f") : hex("#f0a0a0")) : sky;
          img.data.set([...mix(sky, tint, 0.6).map(Math.round), 110], q * 4);
        }
        continue;
      }
      const edge =
        x === 0 ||
        x === W - 1 ||
        y === 0 ||
        y === H - 1 ||
        bond.owner[q - 1] !== b.i ||
        bond.owner[q + 1] !== b.i ||
        bond.owner[q - W] !== b.i ||
        bond.owner[q + W] !== b.i;
      const cracked = warn.has(b.i);
      put(
        q,
        edge
          ? cracked
            ? hex(warn.get(b.i) ? "#ff3020" : "#d08020")
            : mix(fill, [60, 60, 70], 0.45)
          : fill,
      );
    }
  }
  // The window, while it is in.
  SPEC.inserts.forEach(({ rect }, k) => {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const q = y * W + x;
        if (state.inserts[k])
          put(
            q,
            x === rect.x || y === rect.y || x === rect.x + rect.w - 1 || y === rect.y + rect.h - 1
              ? hex("#3a3f45")
              : hex("#5d7f9c"),
          );
      }
    }
  });
  // What falls behind the wall shows in its gaps; then the wall over it; then the room.
  // Farthest first, so what overlaps stays put from frame to frame.
  const inFlight = moving(r, since).sort((a, b) => a.pose.z - b.pose.z || a.body.id - b.body.id);
  const back = new ImageData(W, H);
  const backNear = nearOf("sim-back", W * H);
  const backPx = new Uint32Array(back.data.buffer);
  for (const m of inFlight) {
    paintStone(backPx, W, H, 0, m.body, m.pose, {
      ...facesOf(r, m.body),
      sink: 0,
      moss: 0,
      since,
      ground: H,
      depth: "back",
      near: backNear,
    });
  }
  ctx.drawImage(shown(`back${tile}`, back), 0, 0);
  ctx.drawImage(shown(`wall${tile}`, img), 0, 0);
  // The hung things, outlined, while they hang.
  for (const { name, rect: f } of SPEC.hangs) {
    if (!hangOn(r, name, since)) continue;
    ctx.strokeStyle = "#3a3f45";
    ctx.lineWidth = 1;
    ctx.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
  }
  const room = layerOf(`room${tile}`, SCENE_W, SCENE_H);
  room.pixels.fill(0);
  const near = nearOf("sim-room", SCENE_W * SCENE_H);
  const down = lying(r, since);
  for (const l of down) {
    paintStone(room.pixels, SCENE_W, SCENE_H, 0, l.body, l.pose, {
      ...facesOf(r, l.body),
      sink: l.sink,
      moss: 0,
      since,
      ground: SCENE_H,
      floor: SPEC.ground,
      near,
    });
  }
  for (const m of inFlight) {
    paintStone(room.pixels, SCENE_W, SCENE_H, 0, m.body, m.pose, {
      ...facesOf(r, m.body),
      sink: 0,
      moss: 0,
      since,
      ground: SCENE_H,
      floor: SPEC.ground,
      depth: "front",
      near,
    });
  }
  room.canvas.getContext("2d")?.putImageData(room.image, 0, 0);
  ctx.drawImage(room.canvas, 0, 0);
  if (show === "pile") {
    // The heap's height along the wall, nearest the wall and at its toe.
    for (const [z0, z1, c] of [
      [0, 6, "#ffe040"],
      [14, 28, "#ff8040"],
    ] as const) {
      for (let x = 0; x < W; x += 2) {
        const h = heightOver(r.pile, x, x + 1, z0, z1, since);
        if (h > 0) rect(ctx, c, x, SPEC.ground - h + K * z0, 2, 1);
      }
    }
  }

  // The readout, on the dado.
  const standing = state.standing.reduce((s, x) => s + x, 0);
  const lines = [
    `${hms(since)}  ${String(v.rate).replace("×", "x")}  seed ${v.seed}`,
    `standing ${standing}/${bond.blocks.length}  released ${releasedBy(r, since)}  window ${state.inserts[0] ? "in" : "out"}`,
    `bake ${ms.toFixed(0)}ms  taps ${tapsOf(Number(v.seed)).length}  cracked ${warn.size} (${CRACK_S}s ahead)`,
    `falling ${inFlight.length}  lying ${down.length}  thuds ${r.cues.filter((c) => c.t <= since).length}`,
  ];
  lines.forEach((line, i) => drawPixelText(ctx, line, 4, H + 6 + i * 10, "#20262c"));
};

export const wallSim: Unit = {
  name: "wall",
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
    { kind: "range", key: "since", min: 0, max: 43200, step: 0.1 },
    { kind: "select", key: "rate", options: Object.keys(RATES) },
    { kind: "select", key: "wall", options: Object.keys(BUILDS) },
    { kind: "toggle", key: "plaster" },
    { kind: "select", key: "show", options: ["look", "classes", "hazard", "order", "pile"] },
    { kind: "select", key: "tap", options: ["knock out", "roof", "forget taps"] },
    ...TUNE.map(({ key, min, max, step }) => ({ kind: "range" as const, key, min, max, step })),
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
    const since = sinceOf(v, t);
    tapsOf(seed).push({ t: since, x: at.x, y: at.y, kind: how === "roof" ? "roof" : "block" });
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
  defaults: { seed: 1, block: 40, piece: "whole", phi: 1.57, theta: 0, moss: 0, sink: 0 },
  params: () => [
    { kind: "seed", key: "seed" },
    { kind: "range", key: "block", min: 0, max: 80, step: 1 },
    { kind: "select", key: "piece", options: PIECES },
    { kind: "range", key: "phi", min: -3.2, max: 3.2, step: 0.05 },
    { kind: "range", key: "theta", min: -0.6, max: 0.6, step: 0.02 },
    { kind: "range", key: "moss", min: 0, max: 1, step: 0.05 },
    { kind: "range", key: "sink", min: 0, max: 16, step: 1 },
  ],
  size: () => ({ w: STONE.w, h: STONE.h }),
  draw: (ctx, v) => {
    ctx.fillStyle = "#8d969c";
    ctx.fillRect(0, 0, STONE.w, STONE.ground);
    ctx.fillStyle = "#4f7f33";
    ctx.fillRect(0, STONE.ground, STONE.w, STONE.h - STONE.ground);
    const body = stoneOf(v);
    const phi = Number(v.phi);
    const theta = Number(v.theta);
    const z = 8;
    const pose = {
      x: STONE.w / 2,
      y: STONE.ground - halfHeight(body.w, body.h, body.T, phi, theta) - K * z,
      z,
      phi,
      theta,
    };
    const stoneTile = layerOf(`stone${v.seed}`, STONE.w, STONE.h);
    stoneTile.pixels.fill(0);
    paintStone(stoneTile.pixels, STONE.w, STONE.h, 0, body, pose, {
      sink: Number(v.sink),
      moss: Number(v.moss),
      since: 0,
      ground: STONE.ground + Math.round(K * (z + halfDepth(body.h, body.T, phi))),
    });
    stoneTile.canvas.getContext("2d")?.putImageData(stoneTile.image, 0, 0);
    ctx.drawImage(stoneTile.canvas, 0, 0);
  },
};
