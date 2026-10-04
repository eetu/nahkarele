// The wall simulator: a masonry wall coming down, to watch, poke and tune. Its clock runs at a
// chosen rate from the `since` slider; a tap knocks a block out or brings roof down there, at
// that moment, recorded as a blow in the spec and baked in (scrub back before it and it never
// happened); the sliders retune the pace and re-bake at once. Overlays show how each block
// stands, how exposed it is, when it goes.

import { exposureOf, PACE, type Pace } from "$lib/masonry/decay";
import { halfDepth, type Pose } from "$lib/masonry/fall";
import { heightOver } from "$lib/masonry/pile";
import {
  classesAt,
  CRACK_S,
  lying,
  moving,
  releasedBy,
  stateAt,
  warningAt,
} from "$lib/masonry/query";
import type { Body } from "$lib/masonry/rubble";
import { gapsOf } from "$lib/masonry/stability";
import { bake, type Ruin } from "$lib/masonry/timeline";
import type { Knock, Spec } from "$lib/masonry/types";
import { SCENE_H, SCENE_W } from "$lib/office/engine";
import { rect } from "$lib/scene/pixel";
import { drawPixelText } from "$lib/scene/pixelfont";

import type { Unit, Values } from "./units";

/** A wall like the office's back wall: 320 by 97 px over a dado, a window in it. */
const SPEC: Spec = {
  w: 320,
  h: 97,
  course: 14,
  unit: 26,
  thickness: 8,
  rough: 1.5,
  ground: 150,
  inserts: [{ name: "window", rect: { x: 122, y: 14, w: 76, h: 50 } }],
  hangs: [],
};

const RATES: Record<string, number> = {
  paused: 0,
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
  { key: "bite", min: 1, max: 7, step: 1, get: (p) => p.bite },
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
  const key = `${seed}|${JSON.stringify(pace)}|${JSON.stringify(knocks)}`;
  const known = bakes.get(key);
  if (known) return known;
  const t0 = performance.now();
  const ruin = bake({ ...SPEC, knocks: [...knocks] }, seed, pace);
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

let layer: HTMLCanvasElement | null = null;

/** How far down the screen a px of depth shows (the floor seen from a little above). */
const K = 0.25;

/** A body as a plain box, its faces shaded by which way they look: a stand-in for the room's
 *  own drawing of stones. Clipped at the ground line in front of it, so a sunk piece shows
 *  only what is above ground. */
const drawBody = (
  ctx: CanvasRenderingContext2D,
  body: Body,
  pose: Pose,
  sink: number,
  ground: number,
) => {
  const { w, h, T } = body;
  const [cf, sf] = [Math.cos(pose.phi), Math.sin(pose.phi)];
  const [ct, st] = [Math.cos(pose.theta), Math.sin(pose.theta)];
  const turn = (x: number, y: number, z: number) => {
    const y1 = y * cf + z * sf;
    const z1 = -y * sf + z * cf;
    return { x: x * ct - y1 * st, y: x * st + y1 * ct, z: z1 };
  };
  const at = (x: number, y: number, z: number) => {
    const p = turn(x, y, z);
    return [pose.x + p.x, pose.y + sink + p.y + K * (pose.z + p.z)];
  };
  const faces: [number[], string, number[][]][] = [
    [
      [0, 0, 1],
      "#d4d9dc",
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) => [a, b, 1]),
    ],
    [
      [0, 0, -1],
      "#9a8f80",
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) => [a, b, -1]),
    ],
    [
      [0, -1, 0],
      "#aab0b4",
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) => [a, -1, b]),
    ],
    [
      [0, 1, 0],
      "#7d8489",
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) => [a, 1, b]),
    ],
    [
      [-1, 0, 0],
      "#8f969b",
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) => [-1, a, b]),
    ],
    [
      [1, 0, 0],
      "#8f969b",
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) => [1, a, b]),
    ],
  ];
  ctx.save();
  const front = pose.z + halfDepth(h, T, pose.phi);
  ctx.beginPath();
  ctx.rect(0, 0, SCENE_W, ground + K * Math.max(0, front) + 0.5);
  ctx.clip();
  for (const [n, colour, corners] of faces) {
    const m = turn(n[0], n[1], n[2]);
    if (m.z - K * m.y <= 0.01) continue;
    ctx.fillStyle = colour;
    ctx.beginPath();
    corners.forEach(([a, b, c], k) => {
      const [x, y] = at((a * w) / 2, (b * h) / 2, (c * T) / 2);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.fill();
  }
  ctx.restore();
};

const draw = (ctx: CanvasRenderingContext2D, v: Values, t: number) => {
  const since = sinceOf(v, t);
  const { ruin: r, ms } = ruinFor(v);
  const { bond } = r;
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
  for (const b of bond.blocks) {
    const up = state.standing[b.i] === 1;
    let fill = hex(b.course % 2 ? "#c6ccd0" : "#b4bbc0");
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
  const inFlight = moving(r, since);
  const behind = ({ body, pose }: { body: Body; pose: Pose }) =>
    pose.z + halfDepth(body.h, body.T, pose.phi) <= 0.5;
  for (const m of inFlight) if (behind(m)) drawBody(ctx, m.body, m.pose, 0, SPEC.h);
  layer ??= document.createElement("canvas");
  layer.width = W;
  layer.height = H;
  layer.getContext("2d")?.putImageData(img, 0, 0);
  ctx.drawImage(layer, 0, 0);
  const down = lying(r, since);
  for (const l of down) drawBody(ctx, l.body, l.pose, l.sink, SPEC.ground);
  for (const m of inFlight) if (!behind(m)) drawBody(ctx, m.body, m.pose, 0, SPEC.ground);
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
    `${hms(since)}  ${String(v.rate)}  seed ${v.seed}`,
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
    rate: "10×",
    show: "blocks",
    tap: "knock out",
    ...Object.fromEntries(TUNE.map((p) => [p.key, p.get(PACE)])),
  },
  params: () => [
    { kind: "seed", key: "seed" },
    { kind: "range", key: "since", min: 0, max: 43200, step: 0.1 },
    { kind: "select", key: "rate", options: Object.keys(RATES) },
    { kind: "select", key: "show", options: ["blocks", "classes", "hazard", "order", "pile"] },
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
