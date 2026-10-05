// The office's back wall after the blast, as masonry (`@anarkisti/korpi/masonry`): blocks laid in courses,
// a window in it, a clock, a calendar and signs hung on it. The roof comes down at the blast
// and for its first years; blocks work loose from the top and the edges of the gaps, decade by
// decade, and whatever is left without support comes down with them; the foot stands for good.
// What comes off tips out of the wall into the room (or outside, seen through the gaps),
// tumbles, hops, maybe breaks, and lies on the heap at the wall's foot until moss has it and it
// sinks away. What hangs on the wall goes with the block above it and falls upright, landing
// where it always did. The world outside shows where the wall was. All by friday's clock and
// seed, like everything else here. This file is the room's side of it: the wall's numbers, its
// fixtures, and the drawing.

import {
  type Body,
  climb,
  cuesBetween,
  hanging,
  type Knock,
  lying,
  lyingKey,
  moving,
  releasedBy,
  type Ruin,
  ruinOf,
  type Spec,
  warningAt,
} from "@anarkisti/korpi/masonry";

import { hash, smooth } from "$lib/scene/pixel";

import { FLOOR_Y, G, SCENE_H, SCENE_W } from "../engine";
import { drawSheet, grow, type Sheet, sheetOf } from "./posed";
import { ROOT_Y } from "./stand";
import { faceOf, K, nearOf, paintStone } from "./stones";

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
  /** Blows given from the room, in time order: blocks poked out. */
  knocks?: Knock[];
};

/** The wall that can break: down to the dado, scene px. */
const WALL_H = 97;
/** Where a fixture that comes down in front of the furniture rests: the near floor. */
const NEAR_FLOOR = FLOOR_Y + 14;
/** How long a fixture's landing bumps, s. */
const BUMP_S = 0.3;
/** Moss starts up a stone this long after it comes to rest, s, and has it covered this much
 *  later. */
export const MOSS_FROM = 120;
const MOSS_S = 3600;

const specs = new WeakMap<Setting, Spec>();

/** The masonry the room's wall is: cement blocks 16 by 8 px (40 by 20 cm), 8 px thick, over the
 *  dado; the window an insert, the rest hung on it. */
export const specOf = (setting: Setting): Spec => {
  const known = specs.get(setting);
  if (known) return known;
  const spec: Spec = {
    w: SCENE_W,
    h: WALL_H,
    course: 8,
    unit: 16,
    thickness: 8,
    plaster: true,
    ground: FLOOR_Y,
    g: G,
    inserts: setting.openings.map((name) => ({ name, rect: setting.fixtures[name] })),
    hangs: Object.entries(setting.fixtures)
      .filter(([name]) => !setting.openings.includes(name))
      .map(([name, rect]) => ({ name, rect })),
    knocks: setting.knocks,
  };
  specs.set(setting, spec);
  return spec;
};

/** Each wall's ruins by seed, baked once: the last few seeds asked for. */
const ruins = new WeakMap<Spec, Map<number, Ruin>>();
const ruinFor = (seed: number, setting: Setting) => {
  const spec = specOf(setting);
  const bySeed = ruins.get(spec) ?? new Map<number, Ruin>();
  ruins.set(spec, bySeed);
  const known = bySeed.get(seed);
  if (known) return known;
  const ruin = ruinOf(spec, seed);
  bySeed.set(seed, ruin);
  if (bySeed.size > 4) bySeed.delete(bySeed.keys().next().value as number);
  return ruin;
};

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

type Holes = {
  key: string;
  mask: HTMLCanvasElement;
  rim: HTMLCanvasElement;
  view: HTMLCanvasElement;
};

let holes: Holes | null = null;

/** Where the plaster has come off the standing wall: the blocks and their joints, and the
 *  coat's broken edge round them; as last baked, for which key. */
let bare: { key: string; image: ImageData; canvas: HTMLCanvasElement } | null = null;

/** The wall's coat at `t`, laid over the room's plaster: nothing where it still is, the
 *  masonry where it has come off, a darker line where it ends. */
const drawBare = (ctx: CanvasRenderingContext2D, r: Ruin, seed: number, t: number) => {
  const skin = r.skin;
  if (!skin) return;
  let lost = 0;
  for (const at of skin.lost) if (at <= t) lost++;
  if (!lost) return;
  const key = `${seed}|${lost}`;
  if (!bare || bare.key !== key) {
    bare ??= {
      key,
      image: new ImageData(SCENE_W, WALL_H),
      canvas: canvasOf(SCENE_W, WALL_H),
    };
    const words = new Uint32Array(bare.image.data.buffer).fill(0);
    const face = faceOf(r.bond, skin, t);
    const { owner } = r.bond;
    const W = SCENE_W;
    const off = (q: number) => {
      const k = skin.patch[q];
      return owner[q] >= 0 && !(k >= 0 && skin.lost[k] > t);
    };
    for (let y = 0; y < WALL_H; y++) {
      for (let x = 0; x < W; x++) {
        const q = y * W + x;
        if (owner[q] < 0) continue;
        const ends =
          (x > 0 && off(q - 1)) ||
          (x < W - 1 && off(q + 1)) ||
          (y > 0 && off(q - W)) ||
          (y < WALL_H - 1 && off(q + W));
        if (off(q) || ends) words[q] = face(x, y, false);
      }
    }
    bare.canvas.getContext("2d")?.putImageData(bare.image, 0, 0);
    bare.key = key;
  }
  ctx.drawImage(bare.canvas, 0, 0);
};

/** A stone's faces: its front as the wall's was where it came from when it left (its coat,
 *  or the block bare), its top and bottom the block bare, its back the outside's render. */
type Faces = { face: ReturnType<typeof faceOf>; bed: ReturnType<typeof faceOf> };
const faces = new WeakMap<Ruin, { bed: ReturnType<typeof faceOf>; at: Map<number, Faces> }>();
export const facesFor = (r: Ruin, body: Body) => {
  let known = faces.get(r);
  if (!known) {
    known = { bed: faceOf(r.bond, null, 0), at: new Map() };
    faces.set(r, known);
  }
  let made = known.at.get(body.start);
  if (!made) {
    made = { face: faceOf(r.bond, r.skin, body.start), bed: known.bed };
    known.at.set(body.start, made);
  }
  return made;
};

const canvasOf = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/** The buffers and canvases the gaps are baked into, made once. */
let kit: (Holes & { gone: Uint8Array; maskPx: ImageData; rimPx: ImageData }) | null = null;

/** The gaps as whole pixels, and their rim of broken plaster. */
const bakeHoles = (r: Ruin, broken: number, open: Rect[], key: string): Holes => {
  const W = SCENE_W;
  kit ??= {
    key,
    gone: new Uint8Array(W * WALL_H),
    maskPx: new ImageData(W, WALL_H),
    rimPx: new ImageData(W, WALL_H),
    mask: canvasOf(W, WALL_H),
    rim: canvasOf(W, WALL_H),
    view: canvasOf(W, WALL_H),
  };
  const { gone, maskPx, rimPx } = kit;
  gone.fill(0);
  for (let n = 0; n < broken; n++) for (const q of r.bond.blocks[r.releases[n].i].px) gone[q] = 1;
  for (const o of open) {
    for (let y = Math.max(0, o.y); y < Math.min(WALL_H, o.y + o.h); y++) {
      for (let x = Math.max(0, o.x); x < Math.min(W, o.x + o.w); x++) gone[y * W + x] = 1;
    }
  }
  const mask = new Uint32Array(maskPx.data.buffer).fill(0);
  const rim = new Uint32Array(rimPx.data.buffer).fill(0);
  const [rr, rg, rb] = [1, 3, 5].map((i) => parseInt(RIM.slice(i, i + 2), 16));
  const rimWord = ((255 << 24) | (rb << 16) | (rg << 8) | rr) >>> 0;
  for (let y = 0; y < WALL_H; y++) {
    for (let x = 0; x < W; x++) {
      const q = y * W + x;
      if (gone[q]) {
        mask[q] = 0xffffffff;
        continue;
      }
      const edge =
        (x > 0 && gone[q - 1]) ||
        (x < W - 1 && gone[q + 1]) ||
        (y > 0 && gone[q - W]) ||
        (y < WALL_H - 1 && gone[q + W]);
      if (edge) rim[q] = rimWord;
    }
  }
  kit.mask.getContext("2d")?.putImageData(maskPx, 0, 0);
  kit.rim.getContext("2d")?.putImageData(rimPx, 0, 0);
  kit.key = key;
  return kit;
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

/** A shade over what is drawn: `k` (0 to 1) of `colour`. */
export type Shade = { colour: string; k: number };

/**
 * The wall's gaps `since` seconds into friday, `outside` showing through them (a canvas the
 * size of the wall, or null for none), what falls behind the wall with it in the outside's own
 * `night`, and the gaps' rims; then the cracks of what is about to go. Drawn with the room,
 * under what still hangs on the wall. It leaves the gaps for `drawShade` and `drawOnWall`
 * later in the same frame.
 */
export const drawWall = (
  ctx: CanvasRenderingContext2D,
  outside: HTMLCanvasElement | null,
  since: number,
  seed: number,
  setting: Setting,
  night?: Shade,
) => {
  const r = ruinFor(seed, setting);
  drawBare(ctx, r, seed, since);
  const broken = releasedBy(r, since);
  const open = setting.openings.filter((_, k) => r.insertAt[k] <= since);
  if (!broken && !open.length) {
    holes = null;
    drawWarnings(ctx, r, since);
    return;
  }
  const key = `${seed}|${broken}|${open.join()}`;
  if (!holes || holes.key !== key) {
    holes = bakeHoles(
      r,
      broken,
      open.map((n) => setting.fixtures[n]),
      key,
    );
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
  const near = nearOf("stones-behind", SCENE_W * WALL_H);
  for (const { body, pose } of moving(r, since)) {
    const box = paintStone(sheet.pixels, SCENE_W, WALL_H, 0, body, pose, {
      ...facesFor(r, body),
      sink: 0,
      moss: 0,
      since,
      ground: WALL_H,
      depth: "back",
      near,
      shade: night,
    });
    if (box) grow(sheet, box);
  }
  drawSheet(off, sheet);
  off.globalCompositeOperation = "source-over";
  ctx.drawImage(holes.view, 0, 0);
};

// --- What has come down ----------------------------------------------------------------

/** The band the heap at the wall's foot is drawn in: from well up the dado to the bottom of
 *  the scene, as far out as a stone runs. */
export const RUBBLE_TOP = FLOOR_Y - 48;
export const RUBBLE_H = SCENE_H - RUBBLE_TOP;
/** How far out from the wall the back trees stand, px of depth. */
const TREES_Z = (ROOT_Y - FLOOR_Y) / K;

/** Whether a stone's pixel at scene row `y`, depth `z`, is behind the back trees: nearer the
 *  wall than they stand, and up off the floor. What is on the floor stays over the grass and
 *  the litter drawn after the trees. */
export const behindTrees = (_x: number, y: number, z: number) => z < TREES_Z && y < FLOOR_Y;

/** Stone pixels in front of the back trees and behind them, and how near each is. */
export type Stones = { front: Uint32Array; behind: Uint32Array; near: Float32Array };

/** The stones lying at rest `since` seconds into friday, mossed and sunk as far as their time
 *  on the heap says, in `shade`, into `into` (the band at the wall's foot). */
export const paintLying = (r: Ruin, since: number, fronts: Rect[], shade: Shade, into: Stones) => {
  into.front.fill(0);
  into.behind.fill(0);
  into.near.fill(-Infinity);
  const hidden = behindFront(fronts);
  for (const { body, pose, sink, age } of lying(r, since)) {
    paintStone(into.front, SCENE_W, RUBBLE_H, RUBBLE_TOP, body, pose, {
      ...facesFor(r, body),
      sink,
      moss: smooth((age - MOSS_FROM) / MOSS_S),
      since,
      ground: SCENE_H,
      floor: FLOOR_Y,
      hidden,
      near: into.near,
      shade,
      split: { out: into.behind, test: behindTrees },
    });
  }
};

/** The stones falling `since` seconds into friday, in `shade`, into `into` (the whole scene):
 *  in front of the wall's face, and behind what lies at rest (`lain`, the band's depths)
 *  wherever that is nearer. The boxes they cover go to `cover`. */
export const paintFalling = (
  r: Ruin,
  since: number,
  fronts: Rect[],
  shade: Shade,
  lain: Float32Array,
  into: Stones,
  cover: (box: Rect) => void,
) => {
  into.near.fill(-Infinity);
  into.near.set(lain, RUBBLE_TOP * SCENE_W);
  const hidden = behindFront(fronts);
  for (const { body, pose } of moving(r, since)) {
    const box = paintStone(into.front, SCENE_W, SCENE_H, 0, body, pose, {
      ...facesFor(r, body),
      sink: 0,
      moss: 0,
      since,
      ground: SCENE_H,
      floor: FLOOR_Y,
      hidden,
      depth: "front",
      near: into.near,
      shade,
      split: { out: into.behind, test: behindTrees },
    });
    if (box) cover(box);
  }
};

/** What lies at rest as last painted: its pixels, as canvases the band's size, and depths. */
let lain: {
  key: string;
  stones: Stones;
  front: { image: ImageData; canvas: HTMLCanvasElement };
  behind: { image: ImageData; canvas: HTMLCanvasElement };
} | null = null;
/** The falling stones as last painted, and the frame they were painted for. */
let falling: { frame: string; front: Sheet; behind: Sheet } | null = null;

const layerOf = () => {
  const image = new ImageData(SCENE_W, RUBBLE_H);
  return { image, pixels: new Uint32Array(image.data.buffer), canvas: canvasOf(SCENE_W, RUBBLE_H) };
};

/** The stones `since` seconds into friday in the room's light: lying (repainted only when what
 *  lies changes, or the light by a step) and falling (each frame), each split about the back
 *  trees. */
const stonesAt = (since: number, seed: number, setting: Setting, room: Shade) => {
  const r = ruinFor(seed, setting);
  // In steps of a hundredth, so the light changing does not repaint the heap every frame.
  const shade = { colour: room.colour, k: Math.round(room.k * 100) / 100 };
  if (!lain) {
    const [front, behind] = [layerOf(), layerOf()];
    const near = new Float32Array(SCENE_W * RUBBLE_H);
    lain = { key: "", stones: { front: front.pixels, behind: behind.pixels, near }, front, behind };
  }
  const key = `${seed}|${lyingKey(r, since)}|${shade.k}|${shade.colour}`;
  if (lain.key !== key) {
    paintLying(r, since, setting.fronts, shade, lain.stones);
    lain.front.canvas.getContext("2d")?.putImageData(lain.front.image, 0, 0);
    lain.behind.canvas.getContext("2d")?.putImageData(lain.behind.image, 0, 0);
    lain.key = key;
  }
  const frame = `${key}|${since}`;
  if (!falling || falling.frame !== frame) {
    const front = sheetOf("stones", SCENE_W, SCENE_H);
    const behind = sheetOf("stones-behind-trees", SCENE_W, SCENE_H);
    const into = {
      front: front.pixels,
      behind: behind.pixels,
      near: nearOf("stones", SCENE_W * SCENE_H),
    };
    paintFalling(r, since, setting.fronts, shade, lain.stones.near, into, (box) => {
      grow(front, box);
      grow(behind, box);
    });
    falling = { frame, front, behind };
  }
  return { lain, falling };
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
 * What of the stones off the wall is behind the back trees `since` seconds into friday: up
 * off the floor, nearer the wall than the trees stand. In the room's light, `room`, as the
 * wall they came from. Drawn before the back trees.
 */
export const drawRubbleBehind = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  setting: Setting,
  room: Shade,
) => {
  const { lain, falling } = stonesAt(since, seed, setting, room);
  ctx.drawImage(lain.behind.canvas, 0, RUBBLE_TOP);
  drawSheet(ctx, falling.behind);
};

/**
 * What has come off the wall `since` seconds into friday, in front of the back trees: stones
 * lying on the heap and falling in the room, in the room's light, `room`, the dust of
 * landings, and the fixtures that went, drawn by `fixture` at their place (by name, top-left
 * corner).
 */
export const drawRubble = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  setting: Setting,
  room: Shade,
  fixture: Fixture,
) => {
  const r = ruinFor(seed, setting);
  const { lain, falling } = stonesAt(since, seed, setting, room);
  ctx.drawImage(lain.front.canvas, 0, RUBBLE_TOP);
  drawSheet(ctx, falling.front);
  drawDust(ctx, r, since);
  const down = Object.entries(fixturesOf(r, setting))
    .map(([name, b]) => ({ name, at: placeOf(b, since) }))
    .filter(({ at }) => !at.on);
  if (!down.length) return;
  // In the room's light, as they were on the wall: their bodies all on one layer, shaded
  // together (a layer drawn once a frame); what lights itself after, as lit as it was.
  fixtures ??= canvasOf(SCENE_W, SCENE_H);
  const off = fixtures.getContext("2d");
  if (!off) return;
  off.clearRect(0, 0, SCENE_W, SCENE_H);
  for (const { name, at } of down) fixture(off, name, Math.round(at.x), Math.round(at.y), "body");
  if (room.k > 0) {
    off.globalCompositeOperation = "source-atop";
    off.globalAlpha = room.k;
    off.fillStyle = room.colour;
    off.fillRect(0, 0, SCENE_W, SCENE_H);
    off.globalCompositeOperation = "source-over";
    off.globalAlpha = 1;
  }
  ctx.drawImage(fixtures, 0, 0);
  for (const { name, at } of down) fixture(ctx, name, Math.round(at.x), Math.round(at.y), "light");
};

/** Draws a fallen fixture by name at its top-left corner: its body, or what lights itself. */
export type Fixture = (
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  part: "body" | "light",
) => void;
let fixtures: HTMLCanvasElement | null = null;

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

/** How long after a poke its block goes, s: long enough to bake the wall again first. */
const POKE_LEAD = 0.15;

/**
 * A poke at scene `x`, `y`, `since` seconds into friday: the blow that knocks out the block
 * there, or null where none stands to take it (a gap, the window) or something is in front
 * of it (what hangs on it, what stands before it).
 */
export const pokeAt = (
  x: number,
  y: number,
  since: number,
  seed: number,
  setting: Setting,
): Knock | null => {
  const [px, py] = [Math.floor(x), Math.floor(y)];
  if (px < 0 || px >= SCENE_W || py < 0 || py >= WALL_H) return null;
  const t = since + POKE_LEAD;
  const over = (f: Rect) => px >= f.x && px < f.x + f.w && py >= f.y && py < f.y + f.h;
  if (setting.fronts.some(over)) return null;
  for (const name of Object.keys(setting.fixtures)) {
    const { on, rect } = fixtureAt(name, t, seed, setting);
    if (on && over(rect)) return null;
  }
  const r = ruinFor(seed, setting);
  const o = r.bond.owner[py * SCENE_W + px];
  return o >= 0 && r.releaseAt[o] > t ? { t, x: px, y: py, kind: "block" } : null;
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
