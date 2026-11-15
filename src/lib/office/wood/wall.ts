// The office's back wall after the blast, as masonry (`@anarkisti/korpi/masonry`): blocks laid in courses,
// a window in it, a clock, a calendar and signs hung on it. The roof comes down at the blast
// and for its first years; blocks work loose from the top and the edges of the gaps, decade by
// decade, and whatever is left without support comes down with them; the foot stands for good.
// What hangs on the wall goes with the block above it and falls upright, landing where it
// always did (korpi's `hung`). The world outside shows where the wall was. All by friday's clock
// and seed, like everything else here. This file is the room's side of it: the wall's numbers,
// its fixtures and where they land, and where it stands in the room; korpi's painter paints
// what stands.

import { mix, rgb, type Rgba } from "@anarkisti/korpi/core";
import {
  climb,
  hanging,
  hungGoneAt,
  insertGoneAt,
  type Knock,
  pieceOf,
  releasedBy,
  type Spec,
  stands,
  type Wall,
  wallOf,
} from "@anarkisti/korpi/masonry";
import {
  WALL_PALETTE,
  type WallPainter,
  wallPainter,
  type WallPalette,
} from "@anarkisti/korpi/masonry/paint";
import { masked, type Pen, type PenMask, type Raster } from "@anarkisti/korpi/paint";
import type { ObliqueView } from "@anarkisti/korpi/view";

import { PX_M } from "../depth";
import { FLOOR_Y, G, SCENE_H, SCENE_W } from "../engine";

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
/** A fixture has come to rest this long after it goes, s: down from the top of the wall and its
 *  landing's bump over. */
const LANDED_S = 5;

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

const PALETTE: WallPalette = {
  block: { units: WALL_PALETTE.block.units.map(grimy), mortar: grimy(WALL_PALETTE.block.mortar) },
  brick: { units: WALL_PALETTE.brick.units.map(grimy), mortar: grimy(WALL_PALETTE.brick.mortar) },
  rubble: {
    units: WALL_PALETTE.rubble.units.map(grimy),
    mortar: grimy(WALL_PALETTE.rubble.mortar),
  },
  plaster: { face: grimy(WALL_PALETTE.plaster.face), rim: grimy(WALL_PALETTE.plaster.rim) },
  rim: grimy(WALL_PALETTE.rim),
  crack: grimy(WALL_PALETTE.crack),
};

/** Where something `w` wide landing at `x` comes to rest: on the floor, or behind what it fell
 *  behind. */
const restOn = (fronts: Rect[], x: number, w: number, floor: number) => {
  for (const f of fronts) {
    const overlap = Math.min(x + w, f.x + f.w) - Math.max(x, f.x);
    if (overlap > 0) return f.y + f.h - 1;
  }
  return floor;
};

/** Where a fixture coming down at `x` lands in the room, scene row: the exit sign on the near
 *  floor, the rest on the floor or behind the furniture they fell behind. */
const landIn =
  (setting: Setting) =>
  (name: string, x: number, w: number): number =>
    setting.before?.includes(name) ? NEAR_FLOOR : restOn(setting.fronts, x, w, FLOOR_Y + 1);

/** A wall as friday keeps it: baked once, with its painter and what stood of it last asked. */
type Made = { wall: Wall; painter: WallPainter; standing: { key: string; mask: PenMask } | null };

/** Each wall by seed: the last few seeds asked for. */
const walls = new WeakMap<Spec, Map<number, Made>>();
const wallFor = (seed: number, setting: Setting): Made => {
  const spec = specOf(setting);
  const bySeed = walls.get(spec) ?? new Map<number, Made>();
  walls.set(spec, bySeed);
  const known = bySeed.get(seed);
  if (known) return known;
  const wall = wallOf({ spec, seed, at: AT, land: landIn(setting) });
  const made: Made = { wall, painter: wallPainter(wall, { palette: PALETTE }), standing: null };
  bySeed.set(seed, made);
  if (bySeed.size > 4) bySeed.delete(bySeed.keys().next().value as number);
  return made;
};

// --- Fixtures --------------------------------------------------------------------------

/** When fixture `name` came off `wall`, if it has by `t`; else Infinity. */
const goneAt = (wall: Wall, setting: Setting, name: string, t: number) => {
  const k = setting.openings.indexOf(name);
  return k >= 0 ? insertGoneAt(wall.ruin, k, t) : hungGoneAt(wall.ruin, name, t);
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
  const { on, rect } = wallFor(seed, setting).wall.hung(name, since);
  return { on, rect: { ...rect, x: Math.round(rect.x), y: Math.round(rect.y) } };
};

/** The fixtures off the wall `since` seconds into friday, by name, and where each is now. */
export const fallenAt = (since: number, seed: number, setting: Setting) =>
  Object.keys(setting.fixtures)
    .map((name) => ({ name, ...fixtureAt(name, since, seed, setting) }))
    .filter(({ on }) => !on);

/** Where fixture `name`'s bottom rests once down, scene row, if it has come off by `since`: the
 *  floor it stands at the depth of. */
export const landOf = (name: string, since: number, seed: number, setting: Setting) => {
  const { wall } = wallFor(seed, setting);
  const goes = goneAt(wall, setting, name, since);
  if (!Number.isFinite(goes)) return FLOOR_Y + 1;
  const { rect } = wall.hung(name, goes + LANDED_S);
  return rect.y + rect.h;
};

/** How many fixtures came off the wall before `name`, once it has by `since`: what comes down
 *  later lies in front of what is already down where it lands. */
export const fallRank = (name: string, since: number, seed: number, setting: Setting) => {
  const { wall } = wallFor(seed, setting);
  const at = goneAt(wall, setting, name, since);
  return Object.keys(setting.fixtures).filter((n) => goneAt(wall, setting, n, since) < at).length;
};

// --- The wall, standing and coming down -----------------------------------------------------

/**
 * The wall `since` seconds into friday, into `scene` through the room's view, each pixel at its
 * own depth: its face (the coat, the blocks where it has come off, the broken rim round the
 * gaps, the cracks of what is about to go), and its top and the beds its gaps leave, running
 * back through its thickness.
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

/** What stands of the wall `since` seconds into friday, as a mask of the scene: made again only
 *  once something more has come off it. */
const standingMask = (since: number, seed: number, setting: Setting): PenMask => {
  const made = wallFor(seed, setting);
  const r = made.wall.ruin;
  const inserts = setting.openings.map((_, k) => insertGoneAt(r, k, since) <= since);
  const key = `${releasedBy(r, since)}|${inserts.join()}`;
  if (made.standing?.key !== key) {
    const stands = standsAt(since, seed, setting);
    const bits = new Uint8Array(SCENE_W * SCENE_H);
    for (let y = 0; y < SCENE_H; y++)
      for (let x = 0; x < SCENE_W; x++) bits[y * SCENE_W + x] = stands(x, y) ? 1 : 0;
    made.standing = { key, mask: { x0: 0, y0: 0, w: SCENE_W, h: SCENE_H, bits } };
  }
  return made.standing.mask;
};

/**
 * `pen` for something on the wall (a crack, a climber): what it puts where the wall has gone is
 * not painted; it went down with the wall. A mask, so korpi's posed paintings keep their fast
 * paths through it.
 */
export const onWall = (pen: Pen, since: number, seed: number, setting: Setting): Pen =>
  masked(pen, standingMask(since, seed, setting));

/** What is heard of the wall between two moments of friday, and where: blocks coming loose,
 *  and fixtures landing. */
export const rubbleCue = (
  from: number,
  to: number,
  seed: number,
  setting: Setting,
): { x: number; big: boolean }[] => {
  if (to <= from) return [];
  const { wall } = wallFor(seed, setting);
  const r = wall.ruin;
  const { releases } = r.by(to);
  const hits: { x: number; big: boolean }[] = [];
  for (let k = releasedBy(r, from); k < releases.length && releases[k].t <= to; k++) {
    const p = pieceOf(r.bond, r.bond.blocks[releases[k].i]);
    hits.push({ x: p.x + p.w / 2, big: false });
  }
  for (const c of wall.cues(from, to)) hits.push({ x: c.p.x * PX_M, big: true });
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
  const r = wallFor(seed, setting).wall.ruin;
  const o = r.bond.owner[py * SCENE_W + px];
  return o >= 0 && stands(r, o, t) ? { t, x: px, y: py, kind: "block" } : null;
};

/** How many blocks hang in the air `since` seconds into friday: none, if the ruin is right. */
export const floatingAt = (since: number, seed: number, setting: Setting) =>
  hanging(wallFor(seed, setting).wall.ruin, since);

/**
 * The highest row a climber at column `x` can reach on its way up to `y`, `since` seconds into
 * friday: up the wall from the dado for as long as the wall still stands there.
 */
export const climbTo = (x: number, y: number, since: number, seed: number, setting: Setting) =>
  climb(wallFor(seed, setting).wall.ruin, x, y, since);
