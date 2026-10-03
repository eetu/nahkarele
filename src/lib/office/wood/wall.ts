// The office's back wall after the blast: a wall of pieces. With the roof come down in places it
// loosens from the top. The pieces nearest a collapse break away at the blast, and the damage
// creeps on from there, slower as the years go by but never done; more of the roof comes down
// now and then, and here and there a piece just works loose. Nothing hangs in the air: what
// loses its last firm hold on the standing wall comes down with what broke. A piece that breaks falls, tumbling, and lands at the wall's foot with a
// bump; what hangs on the wall (the window, the clock, the calendar, the signs) goes down with
// the piece it hangs from, and stands where it lands. The world outside shows where the wall
// was. On the floor the pieces gather moss from the ground up and, over a year or so, sink away
// into it. All by friday's clock and seed, like everything else here.

import { hash, smooth } from "$lib/scene/pixel";

import { FLOOR_Y, SCENE_W } from "../engine";
import { mossColour } from "./moss";
import type { Pt } from "./posed";
import { random } from "./trees";

export type Rect = { x: number; y: number; w: number; h: number };

/** What hangs on the wall, by name, where it hangs. */
export type Fixtures = Record<string, Rect>;

/**
 * The wall's room: what hangs on it, the fixtures that fill an opening in it rather than hang
 * (the window), and what stands on the floor in front of it (the AIs, the desk). Whatever
 * falls behind one of those comes to rest behind its base, out of sight.
 */
export type Setting = { fixtures: Fixtures; openings: string[]; fronts: Rect[] };

/** The wall that can break: down to the dado, scene px. */
const WALL_H = 97;
/** Pieces are about this many px across. */
const CELL = 9;
/** Gravity, scene px/s², and how long a landing bumps. */
const G = 240;
const BUMP_S = 0.3;
/** Pieces nearest a collapse go within this many seconds of it. */
const BURST_S = 15;
/** Beyond, the damage spreads `pace` px per (s ^ `SPREAD`): quick at first, slower for ever. */
const SPREAD = 0.55;
/** More roof comes down about this often, s, for as long as anyone could watch. */
const COLLAPSE_S = 900;
const COLLAPSES = 14;
/** And any piece may just work loose: some time in this many seconds, the top ones sooner. */
const LOOSE_S = 30000;
/** Pieces hold each other where they share at least this much edge, px; less is a crack. */
const HOLD_PX = 3;
/** Moss starts up a piece this long after it lands and has it covered this much later. */
const MOSS_FROM = 15;
const MOSS_S = 200;
/** A piece starts sinking this long after it lands, and is gone into the ground this much later. */
const SINK_FROM = 150;
const SINK_S = 900;

type Body = Rect & {
  /** When it breaks away, s into friday; Infinity if it never does. */
  at: number;
  /** Sideways drift as it falls, px/s; where its bottom comes to rest; its first quarter turn. */
  vx: number;
  land: number;
  k0: number;
  /** Pieces tumble as they fall; fixtures go down upright and stand where they land. */
  tumble: boolean;
};

type Wall = {
  seed: number;
  /** Which piece each wall pixel belongs to; -1 where the wall has an opening (the window). */
  owner: Int16Array;
  pieces: Body[];
  /** Piece indices by when they break. */
  order: number[];
  fixtures: Record<string, Body>;
  /** Openings in the wall, by the fixture that fills them. */
  openings: Record<string, Rect>;
  sprites: (HTMLCanvasElement | null)[];
  /** The sprites' pixels, read back once for the rubble. */
  data: (Uint8ClampedArray | null)[];
  pixels: { x: number; y: number }[][];
  /** How much edge each piece shares with each neighbour, px, and with the dado and the side
   *  walls. */
  holds: Map<number, number>[];
  anchored: Float32Array;
};

let built: Wall | null = null;

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Where something `w` wide landing at `x` comes to rest: on the floor, or behind what it fell
 *  behind. */
const restOn = (fronts: Rect[], x: number, w: number, floor: number) => {
  for (const f of fronts) {
    const overlap = Math.min(x + w, f.x + f.w) - Math.max(x, f.x);
    if (overlap > 0) return f.y + f.h - 1;
  }
  return floor;
};

/** How far something falls from `top` (its bottom at `bottom`) before it lands at `land`. */
const fallFrom = (bottom: number, land: number) => Math.sqrt((2 * Math.max(0, land - bottom)) / G);

/**
 * Bring down what nothing holds up. A piece stands while a chain of firm holds (`HOLD_PX` of
 * shared edge or more) runs from it to the dado under the wall or the side walls at its ends.
 * Breaking pieces in the order they go, whatever a break leaves without that chain comes down
 * a moment later, and may in turn leave others without theirs.
 */
const settle = (seed: number, owner: Int16Array, pieces: Body[]) => {
  const { holds, anchored } = holdsOf(owner, pieces.length);
  const n = pieces.length;
  const gone = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (!pieces[i].w) gone[i] = 1;
  for (;;) {
    let next = -1;
    for (let i = 0; i < n; i++) {
      if (!gone[i] && (next < 0 || pieces[i].at < pieces[next].at)) next = i;
    }
    if (next < 0 || !Number.isFinite(pieces[next].at)) break;
    const t = pieces[next].at;
    gone[next] = 1;
    const held = standing(holds, anchored, gone);
    for (let i = 0; i < n; i++) {
      if (gone[i] || held[i]) continue;
      pieces[i].at = Math.min(pieces[i].at, t + 0.2 + 0.6 * hash(seed, i, 7));
    }
  }
  return { holds, anchored };
};

/** How much edge each piece shares with each neighbour, and with the dado and side walls. */
const holdsOf = (owner: Int16Array, n: number) => {
  const holds: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  const anchored = new Float32Array(n);
  const touch = (a: number, b: number) => {
    holds[a].set(b, (holds[a].get(b) ?? 0) + 1);
    holds[b].set(a, (holds[b].get(a) ?? 0) + 1);
  };
  for (let y = 0; y < WALL_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      const o = owner[y * SCENE_W + x];
      if (o < 0) continue;
      if (y === WALL_H - 1 || x === 0 || x === SCENE_W - 1) anchored[o]++;
      const right = x + 1 < SCENE_W ? owner[y * SCENE_W + x + 1] : -1;
      const below = y + 1 < WALL_H ? owner[(y + 1) * SCENE_W + x] : -1;
      if (right >= 0 && right !== o) touch(o, right);
      if (below >= 0 && below !== o) touch(o, below);
    }
  }
  return { holds, anchored };
};

/** Which pieces still stand: those a chain of firm holds reaches from the anchors. */
const standing = (holds: Map<number, number>[], anchored: Float32Array, gone: Uint8Array) => {
  const n = holds.length;
  const held = new Uint8Array(n);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!gone[i] && anchored[i] >= HOLD_PX) {
      held[i] = 1;
      queue.push(i);
    }
  }
  while (queue.length) {
    const i = queue.pop() as number;
    for (const [j, edge] of holds[i]) {
      if (gone[j] || held[j] || edge < HOLD_PX) continue;
      held[j] = 1;
      queue.push(j);
    }
  }
  return held;
};

/** Break `seed`'s wall into pieces and work out when each goes. */
const wallOf = (seed: number, { fixtures, openings, fronts }: Setting): Wall => {
  if (built?.seed === seed) return built;
  const rand = random(seed ^ 0xbad);
  const cols = Math.ceil(SCENE_W / CELL);
  const rows = Math.ceil(WALL_H / CELL);
  const seeds: Pt[] = [];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      seeds.push({ x: (gx + rand()) * CELL, y: (gy + rand()) * CELL });
    }
  }
  const holes = Object.fromEntries(openings.map((n) => [n, fixtures[n]]));
  const owner = new Int16Array(SCENE_W * WALL_H).fill(-1);
  for (let y = 0; y < WALL_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      if (Object.values(holes).some((r) => inside(r, x, y))) continue;
      const gx = Math.floor(x / CELL);
      const gy = Math.floor(y / CELL);
      let best = -1;
      let near = Infinity;
      for (let j = gy - 1; j <= gy + 1; j++) {
        for (let i = gx - 1; i <= gx + 1; i++) {
          if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
          const s = seeds[j * cols + i];
          const d = (s.x - x) ** 2 + (s.y - y) ** 2;
          if (d < near) {
            near = d;
            best = j * cols + i;
          }
        }
      }
      owner[y * SCENE_W + x] = best;
    }
  }
  // Each piece's pixels and its box.
  const pixels: { x: number; y: number }[][] = seeds.map(() => []);
  for (let y = 0; y < WALL_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      const o = owner[y * SCENE_W + x];
      if (o >= 0) pixels[o].push({ x, y });
    }
  }
  // Where the roof comes down: two or three places at the blast, then more as the years go by.
  // Each takes what is nearest at once and spreads from there. Distance is wider than deep:
  // walls split along their courses.
  const falls: { x: number; start: number; burst: number; pace: number }[] = [];
  const first = 2 + Math.floor(rand() * 2);
  let start = 0;
  for (let n = 0; n < first + COLLAPSES; n++) {
    if (n >= first) start += COLLAPSE_S * (0.6 + 0.8 * rand());
    falls.push({
      x: 20 + rand() * (SCENE_W - 40),
      start,
      burst: (n < first ? 12 : 4) + rand() * (n < first ? 10 : 6),
      pace: 0.35 + 0.2 * rand(),
    });
  }
  const pieces: Body[] = pixels.map((px, i) => {
    if (!px.length)
      return { x: 0, y: 0, w: 0, h: 0, at: Infinity, vx: 0, land: 0, k0: 0, tumble: true };
    const xs = px.map((p) => p.x);
    const ys = px.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const cx = xs.reduce((s, v) => s + v, 0) / px.length;
    const cy = ys.reduce((s, v) => s + v, 0) / px.length;
    const jitter = 0.85 + 0.3 * hash(seed, i, 1);
    // Loose of its own accord some time, the top of the wall sooner than its foot.
    let at = 300 + LOOSE_S * hash(seed, i, 6) * (0.5 + cy / WALL_H);
    for (const f of falls) {
      const d = Math.hypot((cx - f.x) / 1.4, cy) * jitter;
      const t =
        d <= f.burst
          ? 1 + (d / f.burst) * BURST_S
          : BURST_S + ((d - f.burst) / f.pace) ** (1 / SPREAD);
      at = Math.min(at, f.start + t);
    }
    const w = Math.max(...xs) - x + 1;
    const h = Math.max(...ys) - y + 1;
    const vx = (hash(seed, i, 2) - 0.5) * 14;
    const floor = FLOOR_Y + 1 + Math.floor(hash(seed, i, 3) * 4);
    const land = restOn(fronts, x + vx * fallFrom(y + h, floor), w, floor);
    return { x, y, w, h, at, vx, land, k0: Math.floor(hash(seed, i, 4) * 4), tumble: true };
  });
  const { holds, anchored } = settle(seed, owner, pieces);
  // A fixture hangs from the piece just above it, and goes when that does.
  const fixtures2: Record<string, Body> = {};
  for (const [name, r] of Object.entries(fixtures)) {
    const ax = Math.round(r.x + r.w / 2);
    let anchor = -1;
    for (let ay = r.y - 3; ay >= 0 && anchor < 0; ay--) anchor = owner[ay * SCENE_W + ax];
    if (anchor < 0) anchor = owner[Math.max(0, r.y) * SCENE_W + ax];
    const vx = (hash(seed, ax, 5) - 0.5) * 4;
    fixtures2[name] = {
      ...r,
      at: anchor >= 0 ? pieces[anchor].at + 0.15 : Infinity,
      vx,
      land: restOn(fronts, r.x + vx * fallFrom(r.y + r.h, FLOOR_Y + 1), r.w, FLOOR_Y + 1),
      k0: 0,
      tumble: false,
    };
  }
  const order = pieces
    .map((_, i) => i)
    .filter((i) => Number.isFinite(pieces[i].at))
    .sort((a, b) => pieces[a].at - pieces[b].at);
  built = {
    seed,
    owner,
    pieces,
    order,
    fixtures: fixtures2,
    openings: holes,
    sprites: pieces.map(() => null),
    data: pieces.map(() => null),
    pixels,
    holds,
    anchored,
  };
  return built;
};

/**
 * How many pieces hang in the air `since` seconds into friday: standing, with no firm chain to
 * the dado or the side walls, and not about to fall within the second. None, if `settle` works.
 */
export const floatingAt = (since: number, seed: number, setting: Setting) => {
  const w = wallOf(seed, setting);
  const gone = Uint8Array.from(w.pieces, (p) => (!p.w || p.at <= since ? 1 : 0));
  const held = standing(w.holds, w.anchored, gone);
  return w.pieces.filter((p, i) => !gone[i] && !held[i] && p.at > since + 1).length;
};

/** Where a body is: still on the wall, falling, or down (with how long it has lain there). */
type Where = { phase: "wall" | "falling" | "down"; x: number; y: number; k: number; age: number };

const whereAt = (b: Body, since: number): Where => {
  const t = since - b.at;
  if (!(t >= 0)) return { phase: "wall", x: b.x, y: b.y, k: 0, age: 0 };
  const fall = fallFrom(b.y + b.h, b.land);
  const turn = (s: number) => (b.tumble ? (b.k0 + Math.floor(s * 7)) % 4 : 0);
  if (t < fall) {
    return { phase: "falling", x: b.x + b.vx * t, y: b.y + 0.5 * G * t * t, k: turn(t), age: 0 };
  }
  const k = turn(fall);
  const h = k % 2 ? b.w : b.h;
  const u = t - fall;
  const bump = u < BUMP_S ? Math.sin((u / BUMP_S) * Math.PI) * 2 : 0;
  const slide = b.vx * 0.3 * Math.min(u, BUMP_S);
  return { phase: "down", x: b.x + b.vx * fall + slide, y: b.land - h - bump, k, age: u };
};

/** When a body lands, s into friday. */
const landsAt = (b: Body) => b.at + fallFrom(b.y + b.h, b.land);

// --- Drawing ---------------------------------------------------------------------------

const WALL = "#b9c0c4";
const EDGE = "#8d969c";
const GRIT = "#a9b1b5";
const RIM = "#5d5a55";

/** A piece's own pixels: wall, a darker broken edge, a little grit. */
const spriteOf = (w: Wall, i: number) => {
  const known = w.sprites[i];
  if (known) return known;
  const p = w.pieces[i];
  const c = document.createElement("canvas");
  c.width = p.w;
  c.height = p.h;
  const ctx = c.getContext("2d");
  if (ctx) {
    for (const { x, y } of w.pixels[i]) {
      const edge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return (
          nx < 0 || ny < 0 || nx >= SCENE_W || ny >= WALL_H || w.owner[ny * SCENE_W + nx] !== i
        );
      });
      ctx.fillStyle = edge ? EDGE : hash(x, y, 13) < 0.08 ? GRIT : WALL;
      ctx.fillRect(x - p.x, y - p.y, 1, 1);
    }
  }
  w.sprites[i] = c;
  return c;
};

/** `img` drawn `k` quarter turns round, its turned box's corner at `x`, `y`. */
const drawTurned = (
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  x: number,
  y: number,
  k: number,
) => {
  const { width: w, height: h } = img;
  const at = [
    [0, 0],
    [h, 0],
    [w, h],
    [0, w],
  ][k];
  ctx.save();
  ctx.translate(Math.round(x) + at[0], Math.round(y) + at[1]);
  ctx.rotate((k * Math.PI) / 2);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
};

let holes: {
  key: string;
  mask: HTMLCanvasElement;
  rim: HTMLCanvasElement;
  view: HTMLCanvasElement;
} | null = null;

/** How many pieces have broken by `since`. */
const brokenBy = (w: Wall, since: number) => {
  let lo = 0;
  let hi = w.order.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (w.pieces[w.order[mid]].at <= since) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/** The gaps as whole pixels, and their rim of broken plaster. */
const bakeHoles = (w: Wall, broken: number, open: string[]) => {
  const gone = new Uint8Array(SCENE_W * WALL_H);
  for (let n = 0; n < broken; n++)
    for (const { x, y } of w.pixels[w.order[n]]) gone[y * SCENE_W + x] = 1;
  for (const name of open) {
    const r = w.openings[name];
    for (let y = Math.max(0, r.y); y < Math.min(WALL_H, r.y + r.h); y++) {
      for (let x = Math.max(0, r.x); x < Math.min(SCENE_W, r.x + r.w); x++)
        gone[y * SCENE_W + x] = 1;
    }
  }
  const canvas = () => {
    const c = document.createElement("canvas");
    c.width = SCENE_W;
    c.height = WALL_H;
    return c;
  };
  const mask = canvas();
  const rim = canvas();
  const m = mask.getContext("2d");
  const r = rim.getContext("2d");
  if (!m || !r) return null;
  m.fillStyle = "#fff";
  r.fillStyle = RIM;
  for (let y = 0; y < WALL_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      if (gone[y * SCENE_W + x]) {
        m.fillRect(x, y, 1, 1);
        continue;
      }
      const edge =
        (x > 0 && gone[y * SCENE_W + x - 1]) ||
        (x < SCENE_W - 1 && gone[y * SCENE_W + x + 1]) ||
        (y > 0 && gone[(y - 1) * SCENE_W + x]) ||
        (y < WALL_H - 1 && gone[(y + 1) * SCENE_W + x]);
      if (edge) r.fillRect(x, y, 1, 1);
    }
  }
  return { mask, rim, view: canvas() };
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
  const b = wallOf(seed, setting).fixtures[name];
  const at = whereAt(b, since);
  return {
    on: at.phase === "wall",
    rect: { x: Math.round(at.x), y: Math.round(at.y), w: b.w, h: b.h },
  };
};

/**
 * The wall's gaps `since` seconds into friday, `outside` showing through them (a canvas the
 * size of the wall, or null for none), and their rims. Drawn with the room, under what still
 * hangs on the wall.
 */
export const drawWall = (
  ctx: CanvasRenderingContext2D,
  outside: HTMLCanvasElement | null,
  since: number,
  seed: number,
  setting: Setting,
) => {
  const w = wallOf(seed, setting);
  const broken = brokenBy(w, since);
  const open = setting.openings.filter((n) => whereAt(w.fixtures[n], since).phase !== "wall");
  if (!broken && !open.length) return;
  const key = `${seed}|${broken}|${open.join()}`;
  if (!holes || holes.key !== key) {
    const fresh = bakeHoles(w, broken, open);
    if (!fresh) return;
    holes = { key, ...fresh };
  }
  ctx.drawImage(holes.rim, 0, 0);
  if (!outside) return;
  const off = holes.view.getContext("2d");
  if (!off) return;
  off.globalCompositeOperation = "copy";
  off.drawImage(holes.mask, 0, 0);
  off.globalCompositeOperation = "source-atop";
  off.drawImage(outside, 0, 0);
  off.globalCompositeOperation = "source-over";
  ctx.drawImage(holes.view, 0, 0);
};

let rubble: { key: string; canvas: HTMLCanvasElement } | null = null;
/** The strip of floor the fallen pieces lie on. */
const RUBBLE_TOP = FLOOR_Y - 26;
const RUBBLE_H = 34;

/** The pieces that have come to rest, mossed and sunk as far as their time on the floor says. */
const paintRubble = (w: Wall, lying: { i: number; at: Where }[], since: number) => {
  const canvas = rubble?.canvas ?? document.createElement("canvas");
  canvas.width = SCENE_W;
  canvas.height = RUBBLE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, SCENE_W, RUBBLE_H);
  for (const { i, at } of lying) {
    const p = w.pieces[i];
    const odd = at.k % 2 === 1;
    const tw = odd ? p.h : p.w;
    const th = odd ? p.w : p.h;
    const sink = smooth((at.age - SINK_FROM) / SINK_S);
    const showing = Math.ceil(th * (1 - sink));
    if (showing <= 0) continue;
    const moss = (at.age - MOSS_FROM) / MOSS_S;
    w.data[i] ??= spriteOf(w, i).getContext("2d")?.getImageData(0, 0, p.w, p.h).data ?? null;
    const sprite = w.data[i];
    if (!sprite) continue;
    for (let v = th - showing; v < th; v++) {
      for (let u = 0; u < tw; u++) {
        // The turned pixel back to the piece's own.
        const [sx, sy] = [
          [u, v],
          [v, p.h - 1 - u],
          [p.w - 1 - u, p.h - 1 - v],
          [p.w - 1 - v, u],
        ][at.k];
        const a = sprite[(sy * p.w + sx) * 4 + 3];
        if (!a) continue;
        const x = Math.round(at.x) + u;
        const y = Math.round(at.y) + v + Math.round(th * sink) - RUBBLE_TOP;
        // Moss climbs from the ground: the lowest pixels first.
        const climb = (th - 1 - v) / th;
        const mossy = moss > climb * 0.8 + hash(x, v, i) * 0.25;
        if (mossy) ctx.fillStyle = mossColour(x, y + RUBBLE_TOP, v === th - showing, since);
        else {
          const [r, g, b] = sprite.slice((sy * p.w + sx) * 4, (sy * p.w + sx) * 4 + 3);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        }
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return canvas;
};

/**
 * What has come off the wall `since` seconds into friday: pieces falling and lying, and the
 * fixtures that went with them, drawn by `fixture` at their place (by name, top-left corner).
 * Drawn behind the trees: it all comes down at the wall's foot.
 */
export const drawRubble = (
  ctx: CanvasRenderingContext2D,
  since: number,
  seed: number,
  setting: Setting,
  fixture: (ctx: CanvasRenderingContext2D, name: string, x: number, y: number) => void,
) => {
  const w = wallOf(seed, setting);
  const broken = brokenBy(w, since);
  const lying: { i: number; at: Where }[] = [];
  const moving: { i: number; at: Where }[] = [];
  for (let n = 0; n < broken; n++) {
    const i = w.order[n];
    const at = whereAt(w.pieces[i], since);
    if (at.phase !== "down" || at.age < BUMP_S) moving.push({ i, at });
    // Gone into the ground: nothing left to draw.
    else if (at.age < SINK_FROM + SINK_S) lying.push({ i, at });
  }
  if (lying.length) {
    // Repainted only when some piece has mossed or sunk a step further.
    const key = `${seed}|${lying
      .map(
        ({ i, at }) =>
          `${i}:${Math.min(12, Math.floor(((at.age - MOSS_FROM) / MOSS_S) * 12))}:${Math.round(smooth((at.age - SINK_FROM) / SINK_S) * 16)}`,
      )
      .join(",")}`;
    if (!rubble || rubble.key !== key) rubble = { key, canvas: paintRubble(w, lying, since) };
    ctx.drawImage(rubble.canvas, 0, RUBBLE_TOP);
  }
  for (const { i, at } of moving) drawTurned(ctx, spriteOf(w, i), at.x, at.y, at.k);
  for (const name of Object.keys(w.fixtures)) {
    const at = whereAt(w.fixtures[name], since);
    if (at.phase !== "wall") fixture(ctx, name, Math.round(at.x), Math.round(at.y));
  }
};

/** Where pieces and fixtures hit the floor between two moments of friday: for the thuds. */
export const rubbleCue = (
  from: number,
  to: number,
  seed: number,
  setting: Setting,
): { x: number; big: boolean }[] => {
  if (to <= from) return [];
  const w = wallOf(seed, setting);
  const hits: { x: number; big: boolean }[] = [];
  for (const i of w.order) {
    const p = w.pieces[i];
    if (p.at > to) break;
    const t = landsAt(p);
    if (t > from && t <= to) hits.push({ x: p.x + p.w / 2, big: false });
  }
  for (const b of Object.values(w.fixtures)) {
    const t = landsAt(b);
    if (t > from && t <= to) hits.push({ x: b.x + b.w / 2, big: true });
  }
  return hits;
};
