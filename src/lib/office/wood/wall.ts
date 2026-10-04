// The office's back wall after the blast, as masonry (`$lib/masonry`): blocks laid in courses,
// a window in it, a clock, a calendar and signs hung on it. The roof comes down at the blast
// and for its first years; blocks work loose from the top and the edges of the gaps, decade by
// decade, and whatever is left without support comes down with them; the foot stands for good.
// What comes off tips out of the wall into the room (or outside, seen through the gaps),
// tumbles, hops, maybe breaks, and lies on the heap at the wall's foot until moss has it and it
// sinks away. What hangs on the wall goes with the block above it and falls upright, landing
// where it always did. The world outside shows where the wall was. All by friday's clock and
// seed, like everything else here. This file is the room's side of it: the wall's numbers, its
// fixtures, and the drawing.

import { halfDepth } from "$lib/masonry/fall";
import {
  climb,
  cuesBetween,
  hanging,
  lying,
  lyingKey,
  moving,
  releasedBy,
  ruinOf,
  warningAt,
} from "$lib/masonry/query";
import type { Ruin } from "$lib/masonry/timeline";
import type { Spec } from "$lib/masonry/types";
import { hash, smooth } from "$lib/scene/pixel";

import { FLOOR_Y, G, SCENE_H, SCENE_W } from "../engine";
import { drawSheet, grow, sheetOf } from "./posed";
import { K, paintStone } from "./stones";

export type Rect = { x: number; y: number; w: number; h: number };

/** What hangs on the wall, by name, where it hangs. */
export type Fixtures = Record<string, Rect>;

/**
 * The wall's room: what hangs on it, the fixtures that fill an opening in it rather than hang
 * (the window), and what stands on the floor in front of it (the AIs, the desk). Whatever
 * lands behind one of those is out of sight.
 */
export type Setting = {
  fixtures: Fixtures;
  openings: string[];
  fronts: Rect[];
  /** Fixtures that come down in front of the furniture, onto the near floor: the exit sign,
   *  so it can still be found, and pressed. */
  before?: string[];
};

/** The wall that can break: down to the dado, scene px. */
const WALL_H = 97;
/** Where a fixture that comes down in front of the furniture rests: the near floor. */
const NEAR_FLOOR = FLOOR_Y + 14;
/** How long a fixture's landing bumps, s. */
const BUMP_S = 0.3;
/** Moss starts up a stone this long after it comes to rest, s, and has it covered this much
 *  later. */
const MOSS_FROM = 120;
const MOSS_S = 3600;

const specs = new WeakMap<Setting, Spec>();

/** The masonry the room's wall is: blocks 26 by 14 px (65 by 35 cm), 8 px thick, over the
 *  dado; the window an insert, the rest hung on it. */
export const specOf = (setting: Setting): Spec => {
  const known = specs.get(setting);
  if (known) return known;
  const spec: Spec = {
    w: SCENE_W,
    h: WALL_H,
    course: 14,
    unit: 26,
    thickness: 8,
    rough: 1.5,
    ground: FLOOR_Y,
    g: G,
    inserts: setting.openings.map((name) => ({ name, rect: setting.fixtures[name] })),
    hangs: Object.entries(setting.fixtures)
      .filter(([name]) => !setting.openings.includes(name))
      .map(([name, rect]) => ({ name, rect })),
  };
  specs.set(setting, spec);
  return spec;
};

const ruinFor = (seed: number, setting: Setting) => ruinOf(specOf(setting), seed);

// --- Fixtures --------------------------------------------------------------------------

/** A fixture coming down: when it goes, its sideways drift, px/s, and where its bottom
 *  comes to rest. It falls upright and stands where it lands. */
type Falling = Rect & { at: number; vx: number; land: number };

/** Where something `w` wide landing at `x` comes to rest: on the floor, or behind what it fell
 *  behind. */
const restOn = (fronts: Rect[], x: number, w: number, floor: number) => {
  for (const f of fronts) {
    const overlap = Math.min(x + w, f.x + f.w) - Math.max(x, f.x);
    if (overlap > 0) return f.y + f.h - 1;
  }
  return floor;
};

/** How long something falls from `bottom` before it lands at `land`. */
const fallFrom = (bottom: number, land: number) => Math.sqrt((2 * Math.max(0, land - bottom)) / G);

const fixturesCache = new WeakMap<Ruin, Record<string, Falling>>();
const fixturesOf = (r: Ruin, setting: Setting) => {
  const known = fixturesCache.get(r);
  if (known) return known;
  const out: Record<string, Falling> = {};
  for (const [name, f] of Object.entries(setting.fixtures)) {
    const k = setting.openings.indexOf(name);
    const at = k >= 0 ? r.insertAt[k] : (r.hangAt[name] ?? Infinity);
    const vx = (hash(r.seed, Math.round(f.x + f.w / 2), 5) - 0.5) * 4;
    const land = setting.before?.includes(name)
      ? NEAR_FLOOR
      : restOn(setting.fronts, f.x + vx * fallFrom(f.y + f.h, FLOOR_Y + 1), f.w, FLOOR_Y + 1);
    out[name] = { ...f, at, vx, land };
  }
  fixturesCache.set(r, out);
  return out;
};

/** Where a fixture is: still on the wall, falling, or down. */
const placeOf = (b: Falling, since: number) => {
  const t = since - b.at;
  if (!(t >= 0)) return { on: true, x: b.x, y: b.y };
  const fall = fallFrom(b.y + b.h, b.land);
  if (t < fall) return { on: false, x: b.x + b.vx * t, y: b.y + 0.5 * G * t * t };
  const u = t - fall;
  const bump = u < BUMP_S ? Math.sin((u / BUMP_S) * Math.PI) * 2 : 0;
  const slide = b.vx * 0.3 * Math.min(u, BUMP_S);
  return { on: false, x: b.x + b.vx * fall + slide, y: b.land - b.h - bump };
};

/**
 * Where fixture `name` is `since` seconds into friday: on the wall (`on`), or its rect as it
 * falls and where it stands once down.
 */
export const fixtureAt = (
  name: string,
  since: number,
  seed: number,
  setting: Setting,
): { on: boolean; rect: Rect } => {
  const b = fixturesOf(ruinFor(seed, setting), setting)[name];
  const at = placeOf(b, since);
  return { on: at.on, rect: { x: Math.round(at.x), y: Math.round(at.y), w: b.w, h: b.h } };
};

// --- The wall and its gaps -------------------------------------------------------------

const RIM = "#5d5a55";
const CRACK = "#6d6a64";

let holes: {
  key: string;
  mask: HTMLCanvasElement;
  rim: HTMLCanvasElement;
  view: HTMLCanvasElement;
} | null = null;

const canvasOf = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/** The gaps as whole pixels, and their rim of broken plaster. */
const bakeHoles = (r: Ruin, broken: number, open: Rect[]) => {
  const W = SCENE_W;
  const gone = new Uint8Array(W * WALL_H);
  for (let n = 0; n < broken; n++) for (const q of r.bond.blocks[r.releases[n].i].px) gone[q] = 1;
  for (const o of open) {
    for (let y = Math.max(0, o.y); y < Math.min(WALL_H, o.y + o.h); y++) {
      for (let x = Math.max(0, o.x); x < Math.min(W, o.x + o.w); x++) gone[y * W + x] = 1;
    }
  }
  const mask = new ImageData(W, WALL_H);
  const rim = new ImageData(W, WALL_H);
  const [rr, rg, rb] = [1, 3, 5].map((i) => parseInt(RIM.slice(i, i + 2), 16));
  for (let y = 0; y < WALL_H; y++) {
    for (let x = 0; x < W; x++) {
      const q = y * W + x;
      if (gone[q]) {
        mask.data.set([255, 255, 255, 255], q * 4);
        continue;
      }
      const edge =
        (x > 0 && gone[q - 1]) ||
        (x < W - 1 && gone[q + 1]) ||
        (y > 0 && gone[q - W]) ||
        (y < WALL_H - 1 && gone[q + W]);
      if (edge) rim.data.set([rr, rg, rb, 255], q * 4);
    }
  }
  const m = canvasOf(W, WALL_H);
  const rc = canvasOf(W, WALL_H);
  m.getContext("2d")?.putImageData(mask, 0, 0);
  rc.getContext("2d")?.putImageData(rim, 0, 0);
  return { mask: m, rim: rc, view: canvasOf(W, WALL_H) };
};

const edgesCache = new WeakMap<Ruin, Int32Array[]>();
/** Each block's outline pixels, where a crack shows before it goes. */
const edgesOf = (r: Ruin) => {
  const known = edgesCache.get(r);
  if (known) return known;
  const { owner, blocks } = r.bond;
  const W = SCENE_W;
  const edges = blocks.map((b) =>
    Int32Array.from(
      [...b.px].filter((q) => {
        const x = q % W;
        return (
          x === 0 ||
          x === W - 1 ||
          q < W ||
          q >= W * (WALL_H - 1) ||
          owner[q - 1] !== b.i ||
          owner[q + 1] !== b.i ||
          owner[q - W] !== b.i ||
          owner[q + W] !== b.i
        );
      }),
    ),
  );
  edgesCache.set(r, edges);
  return edges;
};

/** A block about to work loose: its outline cracks open, and at the last it shakes. */
const drawWarnings = (ctx: CanvasRenderingContext2D, r: Ruin, since: number) => {
  const edges = edgesOf(r);
  ctx.fillStyle = CRACK;
  for (const { i, shake } of warningAt(r, since)) {
    const dx = shake ? (Math.floor(since * 14) % 2 ? 1 : -1) : 0;
    for (const q of edges[i]) {
      const x = q % SCENE_W;
      ctx.fillRect(x + dx, (q - x) / SCENE_W, 1, 1);
    }
  }
};

/** Whether a stone's pixel at scene `x`, `y` lies behind something in `fronts`. */
const behindFront = (fronts: Rect[]) => (x: number, y: number) =>
  fronts.some((f) => x >= f.x && x < f.x + f.w && y >= f.y + f.h);

/** Stones in flight, farthest first: overlapping, the nearer is drawn over, frame after
 *  frame. */
const byDepth = <T extends { body: { id: number }; pose: { z: number } }>(list: T[]) =>
  list.sort((a, b) => a.pose.z - b.pose.z || a.body.id - b.body.id);

/** Stones still in or behind the wall's plane: seen only through the gaps. */
const isBehind = (body: { h: number; T: number }, pose: { z: number; phi: number }) =>
  pose.z + halfDepth(body.h, body.T, pose.phi) <= 0.5;

/**
 * The wall's gaps `since` seconds into friday, `outside` showing through them (a canvas the
 * size of the wall, or null for none), what falls behind the wall with it, and the gaps' rims;
 * then the cracks of what is about to go. Drawn with the room, under what still hangs on the
 * wall. It leaves the gaps for `drawShade` and `drawOnWall` later in the same frame.
 */
export const drawWall = (
  ctx: CanvasRenderingContext2D,
  outside: HTMLCanvasElement | null,
  since: number,
  seed: number,
  setting: Setting,
) => {
  const r = ruinFor(seed, setting);
  const broken = releasedBy(r, since);
  const open = setting.openings.filter((_, k) => r.insertAt[k] <= since);
  if (!broken && !open.length) {
    holes = null;
    drawWarnings(ctx, r, since);
    return;
  }
  const key = `${seed}|${broken}|${open.join()}`;
  if (!holes || holes.key !== key) {
    holes = {
      key,
      ...bakeHoles(
        r,
        broken,
        open.map((n) => setting.fixtures[n]),
      ),
    };
  }
  ctx.drawImage(holes.rim, 0, 0);
  drawWarnings(ctx, r, since);
  if (!outside) return;
  const off = holes.view.getContext("2d");
  if (!off) return;
  off.globalCompositeOperation = "copy";
  off.drawImage(holes.mask, 0, 0);
  off.globalCompositeOperation = "source-atop";
  off.drawImage(outside, 0, 0);
  // What falls behind the wall, seen through the gaps.
  const sheet = sheetOf("stones-behind", SCENE_W, WALL_H);
  for (const { body, pose } of byDepth(moving(r, since))) {
    if (!isBehind(body, pose)) continue;
    const box = paintStone(sheet.pixels, SCENE_W, WALL_H, 0, body, pose, {
      sink: 0,
      moss: 0,
      since,
      ground: WALL_H,
    });
    if (box) grow(sheet, box);
  }
  drawSheet(off, sheet);
  off.globalCompositeOperation = "source-over";
  ctx.drawImage(holes.view, 0, 0);
};

// --- What has come down ----------------------------------------------------------------

let rubble: { key: string; canvas: HTMLCanvasElement } | null = null;
/** The band the heap at the wall's foot is drawn in: from well up the dado to the floor
 *  in front of it. */
const RUBBLE_TOP = FLOOR_Y - 48;
const RUBBLE_H = 60;

/** The stones lying at rest, mossed and sunk as far as their time on the heap says. */
const paintRubble = (r: Ruin, since: number, fronts: Rect[]) => {
  const canvas = rubble?.canvas ?? canvasOf(SCENE_W, RUBBLE_H);
  const image = new ImageData(SCENE_W, RUBBLE_H);
  const pixels = new Uint32Array(image.data.buffer);
  const hidden = behindFront(fronts);
  for (const { body, pose, sink, age } of lying(r, since)) {
    paintStone(pixels, SCENE_W, RUBBLE_H, RUBBLE_TOP, body, pose, {
      sink,
      moss: smooth((age - MOSS_FROM) / MOSS_S),
      since,
      ground: FLOOR_Y + Math.round(K * (pose.z + halfDepth(body.h, body.T, pose.phi))),
      hidden,
    });
  }
  canvas.getContext("2d")?.putImageData(image, 0, 0);
  return canvas;
};

/** Dust where something has just landed: three frames, a puff, a ring, a few motes. */
const DUST = ["#c8c4bc", "#a8a49c"];
const drawDust = (ctx: CanvasRenderingContext2D, r: Ruin, since: number) => {
  for (const im of r.impacts) {
    if (im.out || im.t > since || im.t <= since - 0.24) continue;
    const frame = Math.min(2, Math.floor((since - im.t) / 0.08));
    const x = Math.round(im.x);
    const y = Math.round(im.y + K * im.z);
    const n = [4, 7, 4][frame];
    const spread = [2, 5, 7][frame];
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = DUST[k % 2];
      const dx = Math.round((hash(x, k, frame, 91) - 0.5) * 2 * spread);
      const dy = -Math.round(hash(x, k, frame, 92) * (frame + 2));
      ctx.fillRect(x + dx, y + dy, 1, 1);
    }
  }
};

/**
 * What has come off the wall `since` seconds into friday: stones lying on the heap, stones
 * falling in the room, the dust of landings, and the fixtures that went, drawn by `fixture` at
 * their place (by name, top-left corner). Drawn behind the trees: it all comes down at the
 * wall's foot.
 */
export const drawRubble = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  setting: Setting,
  fixture: (ctx: CanvasRenderingContext2D, name: string, x: number, y: number) => void,
) => {
  const r = ruinFor(seed, setting);
  const key = `${seed}|${lyingKey(r, since)}`;
  if (!rubble || rubble.key !== key)
    rubble = { key, canvas: paintRubble(r, since, setting.fronts) };
  ctx.drawImage(rubble.canvas, 0, RUBBLE_TOP);
  const sheet = sheetOf("stones", SCENE_W, SCENE_H);
  const hidden = behindFront(setting.fronts);
  for (const { body, pose } of byDepth(moving(r, since))) {
    if (isBehind(body, pose)) continue;
    const box = paintStone(sheet.pixels, SCENE_W, SCENE_H, 0, body, pose, {
      sink: 0,
      moss: 0,
      since,
      ground: FLOOR_Y + Math.round(K * Math.max(0, pose.z + halfDepth(body.h, body.T, pose.phi))),
      hidden,
    });
    if (box) grow(sheet, box);
  }
  drawSheet(ctx, sheet);
  drawDust(ctx, r, since);
  for (const [name, b] of Object.entries(fixturesOf(r, setting))) {
    const at = placeOf(b, since);
    if (!at.on) fixture(ctx, name, Math.round(at.x), Math.round(at.y));
  }
};

/** What thuds between two moments of friday, and where: stones and fixtures landing. */
export const rubbleCue = (
  from: number,
  to: number,
  seed: number,
  setting: Setting,
): { x: number; big: boolean }[] => {
  if (to <= from) return [];
  const r = ruinFor(seed, setting);
  const hits = cuesBetween(r, from, to).map((c) => ({ x: c.x, big: c.big }));
  for (const b of Object.values(fixturesOf(r, setting))) {
    const t = b.at + fallFrom(b.y + b.h, b.land);
    if (t > from && t <= to) hits.push({ x: b.x + b.w / 2, big: true });
  }
  return hits;
};

/** How many blocks hang in the air `since` seconds into friday: none, if the ruin is right. */
export const floatingAt = (since: number, seed: number, setting: Setting) =>
  hanging(ruinFor(seed, setting), since);

let shade: HTMLCanvasElement | null = null;

/**
 * The room's shade, `alpha` of `colour`, over everything but what is outside: the gaps in the
 * wall as last drawn, and `glass` (the window, while it hangs). The outside keeps its own
 * light: the sky at night is already as dark as it should be, and the moon as bright.
 */
export const drawShade = (
  ctx: CanvasRenderingContext2D,
  alpha: number,
  colour: string,
  glass: Rect | null,
) => {
  shade ??= document.createElement("canvas");
  if (shade.width !== SCENE_W) {
    shade.width = SCENE_W;
    shade.height = SCENE_H;
  }
  const off = shade.getContext("2d");
  if (!off) return;
  off.globalCompositeOperation = "copy";
  off.fillStyle = colour;
  off.fillRect(0, 0, SCENE_W, SCENE_H);
  off.globalCompositeOperation = "destination-out";
  if (holes) off.drawImage(holes.mask, 0, 0);
  if (glass) off.fillRect(glass.x, glass.y, glass.w, glass.h);
  off.globalCompositeOperation = "source-over";
  ctx.globalAlpha = alpha;
  ctx.drawImage(shade, 0, 0);
  ctx.globalAlpha = 1;
};

/**
 * The highest row a climber at column `x` can reach on its way up to `y`, `since` seconds into
 * friday: up the wall from the dado for as long as the wall still stands there.
 */
export const climbTo = (x: number, y: number, since: number, seed: number, setting: Setting) =>
  climb(ruinFor(seed, setting), x, y, since);

let onWall: HTMLCanvasElement | null = null;

/**
 * `paint` as something on the wall (a crack, a climber): what it puts where the wall has gone,
 * as last drawn, is not drawn; it went down with the wall. Painted at scene px, which is all
 * anything here ever draws at.
 */
export const drawOnWall = (
  ctx: CanvasRenderingContext2D,
  paint: (ctx: CanvasRenderingContext2D) => void,
) => {
  if (!holes) return paint(ctx);
  onWall ??= document.createElement("canvas");
  if (onWall.width !== SCENE_W) {
    onWall.width = SCENE_W;
    onWall.height = SCENE_H;
  }
  const off = onWall.getContext("2d");
  if (!off) return paint(ctx);
  off.clearRect(0, 0, SCENE_W, SCENE_H);
  off.imageSmoothingEnabled = false;
  paint(off);
  off.globalCompositeOperation = "destination-out";
  off.drawImage(holes.mask, 0, 0);
  off.globalCompositeOperation = "source-over";
  ctx.drawImage(onWall, 0, 0);
};
