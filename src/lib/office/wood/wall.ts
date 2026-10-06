// The office's back wall after the blast, as masonry (`@anarkisti/korpi/masonry`): blocks laid in courses,
// a window in it, a clock, a calendar and signs hung on it. The roof comes down at the blast
// and for its first years; blocks work loose from the top and the edges of the gaps, decade by
// decade, and whatever is left without support comes down with them; the foot stands for good.
// What comes off tips out of the wall into the room (or outside, seen through the gaps),
// tumbles, hops, maybe breaks, and lies on the heap at the wall's foot until moss has it and it
// sinks away. What hangs on the wall goes with the block above it and falls upright, landing
// where it always did. The world outside shows where the wall was. All by friday's clock and
// seed, like everything else here. This file is the room's side of it: the wall's numbers, its
// fixtures, and where it stands in the room; korpi's painter paints it.

import { mix, rgb, type Rgba } from "@anarkisti/korpi/core";
import {
  climb,
  cuesBetween,
  hanging,
  type Knock,
  type Ruin,
  type Spec,
  type Wall,
  wallOf,
} from "@anarkisti/korpi/masonry";
import {
  WALL_PALETTE,
  type WallPainter,
  wallPainter,
  type WallPalette,
} from "@anarkisti/korpi/masonry/paint";
import { masked, type Pen, type Raster } from "@anarkisti/korpi/paint";
import type { ObliqueView } from "@anarkisti/korpi/view";

import { hash, smooth } from "$lib/scene/pixel";

import { PX_M } from "../depth";
import { FLOOR_Y, G, SCENE_W } from "../engine";
import { mossColour } from "./moss";
import { SEASONS_FROM } from "./seasons";

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

/** The wall's face starts at the top of the scene, over the floor line at the back. */
const AT = { x: 0, y: FLOOR_Y / PX_M, z: 0 };

/** The ruin's grime: its walls, its floor and its stones a little toward the night's colour, by
 *  day as by night. Paint, not light: the room's light falls on them as on everything else. */
const GRIME = rgb("#0a0f1c");
const GRIME_K = 0.15;
const grimy = (c: Rgba): Rgba => ((mix(c, GRIME, GRIME_K) & 0xffffff) | (c & 0xff000000)) >>> 0;

/** `pen` laying the ruin's grime into every colour. */
export const grimed = (pen: Pen): Pen => {
  const out: Pen = {
    fill: (c, x, y, w, h, d) => pen.fill(grimy(c), x, y, w, h, d),
    span: (c, x0, x1, y, d0, dd) => pen.span(grimy(c), x0, x1, y, d0, dd),
  };
  const { glowing } = pen;
  return glowing ? { ...out, glowing: (g) => grimed(glowing(g)) } : out;
};

const grimedPalette = (p: WallPalette): WallPalette => ({
  block: { units: p.block.units.map(grimy), mortar: grimy(p.block.mortar) },
  brick: { units: p.brick.units.map(grimy), mortar: grimy(p.brick.mortar) },
  rubble: { units: p.rubble.units.map(grimy), mortar: grimy(p.rubble.mortar) },
  plaster: { face: grimy(p.plaster.face), rim: grimy(p.plaster.rim) },
  inside: { face: grimy(p.inside.face), edge: grimy(p.inside.edge), grit: grimy(p.inside.grit) },
  outside: {
    face: grimy(p.outside.face),
    edge: grimy(p.outside.edge),
    stain: grimy(p.outside.stain),
  },
  bed: {
    up: grimy(p.bed.up),
    down: grimy(p.bed.down),
    side: grimy(p.bed.side),
    fresh: grimy(p.bed.fresh),
  },
  rim: grimy(p.rim),
  crack: grimy(p.crack),
  dust: [grimy(p.dust[0]), grimy(p.dust[1])],
});
const PALETTE = grimedPalette(WALL_PALETTE);

/** Moss on the heap, summer's: what lies there is repainted only when something comes to rest. */
const MOSS = {
  amount: (age: number) => smooth((age - MOSS_FROM) / MOSS_S),
  colour: (x: number, y: number, top: boolean) => grimy(mossColour(x, y, top, SEASONS_FROM)),
};

/** Each wall by seed, baked once, with its painter: the last few seeds asked for. */
const walls = new WeakMap<Spec, Map<number, { wall: Wall; painter: WallPainter }>>();
const wallFor = (seed: number, setting: Setting) => {
  const spec = specOf(setting);
  const bySeed = walls.get(spec) ?? new Map<number, { wall: Wall; painter: WallPainter }>();
  walls.set(spec, bySeed);
  const known = bySeed.get(seed);
  if (known) return known;
  const wall = wallOf({ spec, seed, at: AT });
  const made = { wall, painter: wallPainter(wall, { moss: MOSS, palette: PALETTE }) };
  bySeed.set(seed, made);
  if (bySeed.size > 4) bySeed.delete(bySeed.keys().next().value as number);
  return made;
};
const ruinFor = (seed: number, setting: Setting): Ruin => wallFor(seed, setting).wall.ruin;

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

/** The fixtures off the wall `since` seconds into friday, by name, and where each is now. */
export const fallenAt = (since: number, seed: number, setting: Setting) =>
  Object.keys(setting.fixtures)
    .map((name) => ({ name, ...fixtureAt(name, since, seed, setting) }))
    .filter(({ on }) => !on);

/** Where a fixture's bottom rests once down, scene row: the floor it stands at the depth of. */
export const landOf = (name: string, seed: number, setting: Setting) =>
  fixturesOf(ruinFor(seed, setting), setting)[name].land;

/** How many fixtures came off the wall before `name`: what comes down later lies in front of
 *  what is already down where it lands. */
export const fallRank = (name: string, seed: number, setting: Setting) => {
  const all = fixturesOf(ruinFor(seed, setting), setting);
  return Object.values(all).filter((f) => f.at < all[name].at).length;
};

// --- The wall, standing and coming down -----------------------------------------------------

/**
 * The wall `since` seconds into friday, into `scene` through the room's view, each pixel at its
 * own depth: its face (the coat, the blocks where it has come off, the broken rim round the
 * gaps, the cracks of what is about to go), the stones falling and lying at its foot, in the room
 * or out under the sky, and the dust of their landing.
 */
export const paintWall = (
  scene: Raster,
  view: ObliqueView,
  since: number,
  seed: number,
  setting: Setting,
) => wallFor(seed, setting).painter.paint(scene, view, since);

/** Whether the wall still stands at scene pixel (x, y) `since` seconds into friday; below the
 *  masonry, the dado always does. */
export const standsAt = (since: number, seed: number, setting: Setting) => {
  const { wall } = wallFor(seed, setting);
  return (x: number, y: number) =>
    y >= WALL_H || (x >= 0 && x < SCENE_W && y >= 0 && wall.occupied(x, y, since));
};

/**
 * `pen` for something on the wall (a crack, a climber): what it puts where the wall has gone is
 * not painted; it went down with the wall.
 */
export const onWall = (pen: Pen, since: number, seed: number, setting: Setting): Pen =>
  masked(pen, standsAt(since, seed, setting));

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

/**
 * The highest row a climber at column `x` can reach on its way up to `y`, `since` seconds into
 * friday: up the wall from the dado for as long as the wall still stands there.
 */
export const climbTo = (x: number, y: number, since: number, seed: number, setting: Setting) =>
  climb(ruinFor(seed, setting), x, y, since);
