// The wall's stones as the room shows them: a block of the back wall, or a piece of one, at
// any pose. The floor is seen from a little above, so a px of depth shows K px lower down. A
// stone is drawn column by column through its own pixels: each column's cross-section (the
// block's height by the wall's thickness) is turned out of the wall's plane, and whichever of
// its faces look at the viewer fill the rows it projects to: the inside face (the room's
// plaster), the outside face (render, weathered), or the stone of its beds, lighter facing
// up. A small turn in the plane comes after. Lying, a slab shows edge-on: its bed toward the
// viewer, a strip of its face on top. Moss climbs it from the ground; sinking, it goes down
// behind the floor line. Pixels go into a word buffer, as the sheets take them.

import { DEPTH_SLOPE, type Pose, TURN_STEP } from "$lib/masonry/fall";
import type { Body } from "$lib/masonry/rubble";
import { hash } from "$lib/scene/pixel";

import { mossColour } from "./moss";

/** How far down the screen a px of depth shows: the one the masonry lays its rests by. */
export const K = DEPTH_SLOPE;
/** The steps a stone is drawn turned in, rad: the ones the masonry turns it to rest by. */
const PHI_STEP = TURN_STEP.phi;
export const THETA_STEP = TURN_STEP.theta;

const word = (hex: string) => {
  const v = parseInt(hex.slice(1, 7), 16);
  return ((255 << 24) | ((v & 0xff) << 16) | (v & 0xff00) | (v >> 16)) >>> 0;
};
const words = new Map<string, number>();
const wordOf = (hex: string) => {
  let w = words.get(hex);
  if (w === undefined) {
    w = word(hex);
    words.set(hex, w);
  }
  return w;
};

const INSIDE = { face: word("#b9c0c4"), edge: word("#8d969c"), grit: word("#a9b1b5") };
const OUTSIDE = { face: word("#9d978b"), edge: word("#7d776c"), stain: word("#8a8377") };
const BED = {
  up: word("#a4a198"),
  down: word("#6f6d68"),
  side: word("#8a8780"),
  fresh: word("#d6d2c8"),
};

/** What a face looks like at a pixel of the wall it came from, and whether that pixel is on
 *  the stone's outline. */
export type Face = (x: number, y: number, edge: boolean) => number;

/** Where a stone is drawn and what is done to it: how far it has sunk, how far moss has
 *  climbed it (0 to 1), the floor at its depth, what hides it (true: not drawn), and its faces
 *  inside and out (by default the room's plaster, and render). */
export type Paint = {
  sink: number;
  moss: number;
  since: number;
  ground: number;
  hidden?: (x: number, y: number) => boolean;
  face?: Face;
  back?: Face;
  /** Only what is in front of the wall's face, or only what is behind it: a stone leaving
   *  the wall is drawn twice, its parts still in the wall seen only through the gaps. */
  depth?: "front" | "back";
  /** The nearest depth drawn so far at each pixel of `out` (from `nearOf`): stones passing
   *  through each other show whichever is nearer pixel by pixel, whatever order they come in. */
  near?: Float32Array;
  /** The floor, scene y: whatever of the stone is below it at its own depth is not drawn, so
   *  sinking, a stone goes down behind the floor pixel by pixel and its top goes last. */
  floor?: number;
  /** The light it lies in: `k` (0 to 1) of `colour` over it. */
  shade?: { colour: string; k: number };
  /** Pixels for which `test` (scene x, y, depth toward the viewer) holds go into `out` here
   *  instead: a stone split between a layer drawn before something and one drawn after. With
   *  `near`, `test` must never put a nearer pixel in the earlier layer than a farther one at
   *  the same place. */
  split?: { out: Uint32Array; test: (x: number, y: number, z: number) => boolean };
};

const nears = new Map<string, Float32Array>();
/** A depth buffer `size` long, kept by `name` and cleared to nothing drawn, for a frame. */
export const nearOf = (name: string, size: number) => {
  let near = nears.get(name);
  if (!near || near.length !== size) {
    near = new Float32Array(size);
    nears.set(name, near);
  }
  return near.fill(-Infinity);
};

/** A colour as a word, darker by `k` (0 to 1). */
const darker = (w: number, k: number) => {
  const f = 1 - k;
  const r = Math.round((w & 0xff) * f);
  const g = Math.round(((w >> 8) & 0xff) * f);
  const b = Math.round(((w >> 16) & 0xff) * f);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
};
const lighter = (w: number, k: number) => {
  const up = (v: number) => Math.round(v + (255 - v) * k);
  return (
    ((255 << 24) | (up((w >> 16) & 0xff) << 16) | (up((w >> 8) & 0xff) << 8) | up(w & 0xff)) >>> 0
  );
};
/** A colour as a word, `k` (0 to 1) of the way to `to`. */
const toward = (w: number, to: number, k: number) => {
  const at = (s: number) => {
    const v = (w >> s) & 0xff;
    return Math.round(v + (((to >> s) & 0xff) - v) * k);
  };
  return ((255 << 24) | (at(16) << 16) | (at(8) << 8) | at(0)) >>> 0;
};

/** The units of each way of building, and their mortar. */
const MASONRY = {
  block: { units: ["#b4b2aa", "#aaa89f", "#bcbab2"], mortar: "#8f8c84" },
  brick: {
    units: ["#8c4a36", "#96543c", "#7f4232", "#9b5a42", "#874836", "#a0604a", "#7a3e2e"],
    mortar: "#a49c8e",
  },
  rubble: {
    units: ["#8f8a7e", "#9d9789", "#7f7a70", "#a49b86", "#8a8274", "#968f7f", "#aaa290"],
    mortar: "#b8b1a0",
  },
};
const PLASTER = { face: word("#b9c0c4"), grit: word("#a9b1b5"), rim: word("#8d969c") };

/**
 * A wall's face at `t`, pixel by pixel in wall px: plaster where its coat still is (a darker
 * rim where the coat ends), else its masonry in its mortar: each unit its own shade of its
 * kind, a stone or block lit along its top and shaded along its foot, a brick flat and
 * speckled. `skin` null: no plaster.
 */
export const faceOf = (
  bond: {
    spec: { w: number; bond?: string };
    owner: Int16Array;
    joint: Uint8Array;
    unit: Int32Array;
  },
  skin: { patch: Int32Array; lost: Float64Array } | null,
  t: number,
): Face => {
  const W = bond.spec.w;
  const kind = MASONRY[(bond.spec.bond ?? "block") as keyof typeof MASONRY];
  const units = kind.units.map(word);
  const mortar = word(kind.mortar);
  const bricks = bond.spec.bond === "brick";
  const coated = (q: number) => {
    if (!skin) return false;
    const p = skin.patch[q];
    return p >= 0 && skin.lost[p] > t;
  };
  return (x, y, edge) => {
    const q = y * W + x;
    if (coated(q)) {
      const open =
        (x > 0 && !coated(q - 1) && bond.owner[q - 1] >= 0) ||
        (x < W - 1 && !coated(q + 1) && bond.owner[q + 1] >= 0) ||
        (q >= W && !coated(q - W) && bond.owner[q - W] >= 0) ||
        (q + W < bond.owner.length && !coated(q + W) && bond.owner[q + W] >= 0);
      const w = open ? PLASTER.rim : hash(x, y, 13) < 0.08 ? PLASTER.grit : PLASTER.face;
      return edge ? darker(w, 0.2) : w;
    }
    // Bare masonry needs no darkened outline: its mortar outlines it.
    if (bond.joint[q]) return mortar;
    const u = bond.unit[q];
    let w = units[Math.floor(hash(u, 5) * units.length)];
    if (bricks) {
      // Fired clay is flat and matte: no bevel, a speckle of darker and paler grains.
      const grain = hash(x, y, 31);
      if (grain < 0.1) w = darker(w, 0.12);
      else if (grain > 0.95) w = lighter(w, 0.1);
    } else if (q >= W && bond.joint[q - W]) w = lighter(w, 0.12);
    else if (q + W < bond.joint.length && bond.joint[q + W]) w = darker(w, 0.12);
    return w;
  };
};

/** A stone's own pixels before they go into the scene, and the depth of each from the
 *  stone's centre. */
const scratch = { buf: new Uint32Array(64 * 64), depth: new Float32Array(64 * 64) };
const scratchOf = (w: number, h: number) => {
  if (scratch.buf.length < w * h) {
    scratch.buf = new Uint32Array(w * h * 2);
    scratch.depth = new Float32Array(w * h * 2);
  }
  scratch.buf.fill(0, 0, w * h);
  return scratch;
};

/** A mask `w` by `h` turned half round: upside down and back to front. Made once a mask. */
const halves = new WeakMap<Uint8Array, Uint8Array>();
const halfRound = (m: Uint8Array, w: number, h: number) => {
  let out = halves.get(m);
  if (!out) {
    out = new Uint8Array(w * h);
    for (let q = 0; q < w * h; q++) out[q] = m[w * h - 1 - q];
    halves.set(m, out);
  }
  return out;
};

/**
 * Paint `body` at `pose` into `out`, a word buffer `W` by `H` whose top-left is scene (0, 0)
 * offset by `top` rows (a buffer for the wall's band starts at 0; one for the floor's strip
 * lower). Returns the scene box it touched, or null.
 */
export const paintStone = (
  out: Uint32Array,
  W: number,
  H: number,
  top: number,
  body: Body,
  pose: Pose,
  paint: Paint,
) => {
  const { w, h, T } = body;
  // Turned in steps, as pixel art turns: a sixteenth of a turn out of the plane, a
  // thirty-second in it. Turned smoothly, a stone's pixels are sampled afresh every frame and
  // its grain crawls; in steps, it shows a new pose every few frames, like drawn frames.
  let phi = Math.round(pose.phi / PHI_STEP) * PHI_STEP;
  let theta = Math.round(pose.theta / THETA_STEP) * THETA_STEP;
  theta -= 2 * Math.PI * Math.round(theta / (2 * Math.PI));
  // The turn in the plane turns the drawing, the floor's slant already in it: right for a
  // small turn, but half round it would put what faces up underneath. Turned more than a
  // quarter either way, a stone is drawn as itself turned half round in its own plane (upside
  // down and back to front, its tilt the other way round) and turned the rest.
  const flip = Math.abs(theta) > Math.PI / 2 + 1e-9;
  if (flip) {
    theta -= Math.sign(theta) * Math.PI;
    phi = -phi;
  }
  const mask = flip ? halfRound(body.mask, w, h) : body.mask;
  const fresh = body.fresh && flip ? halfRound(body.fresh, w, h) : body.fresh;
  // A column and row of the drawing, as the stone's own (for its grain and its face).
  const ownC = (c: number) => (flip ? w - 1 - c : c);
  const ownR = (r: number) => (flip ? h - 1 - r : r);
  const cf = Math.cos(phi);
  const sf = Math.sin(phi);
  const project = (y: number, z: number) => y * cf + z * sf + K * (-y * sf + z * cf);
  const front = cf - K * sf > 0;
  const back = -cf + K * sf > 0;
  const upper = sf + K * cf > 0;
  const lower = -sf - K * cf > 0;
  // The columns, upright in the plane: rows from the stone's centre, which sits at `oy`.
  const reach =
    Math.ceil((Math.abs(h * cf) + Math.abs(T * sf)) / 2 + (K * (Math.abs(h * sf) + T)) / 2) + 2;
  const bh = reach * 2 + 1;
  const { buf, depth } = scratchOf(w, bh);
  const oy = reach;
  // Depth from the stone's centre of a point of it, turned: toward the viewer positive.
  const deep = (y: number, z: number) => -y * sf + z * cf;
  const edgeAt = (c: number, r: number) =>
    c === 0 ||
    r === 0 ||
    c === w - 1 ||
    r === h - 1 ||
    !mask[r * w + c - 1] ||
    !mask[r * w + c + 1] ||
    !mask[(r - 1) * w + c] ||
    !mask[(r + 1) * w + c];
  const faceWord = (c: number, r: number, outside: boolean) => {
    const edge = edgeAt(c, r);
    const custom = outside ? paint.back : paint.face;
    // A fresh break: the stone's own colour, paler; or plain new stone.
    const [oc, or] = [ownC(c), ownR(r)];
    if (fresh?.[r * w + c])
      return custom ? lighter(custom(body.ox + oc, body.oy + or, false), 0.3) : BED.fresh;
    if (custom) return custom(body.ox + oc, body.oy + or, edge);
    if (outside)
      return edge
        ? OUTSIDE.edge
        : hash(body.block, oc, or, 81) < 0.15
          ? OUTSIDE.stain
          : OUTSIDE.face;
    return edge ? INSIDE.edge : hash(body.block, oc, or, 13) < 0.08 ? INSIDE.grit : INSIDE.face;
  };
  // A face's span down column `c`, from projected row `s0` to `s1`, its depth going from `z0`
  // to `z1`: the rows whose middles it covers (row `s` spans `s` to `s + 1` from the centre),
  // each taking its colour and depth at its middle. Upright, a stone 3 px tall covers 3 rows,
  // as it did in the wall, and its top's front row is behind the wall's face, not on it.
  const fill = (
    c: number,
    s0: number,
    s1: number,
    z0: number,
    z1: number,
    colour: (u: number) => number,
  ) => {
    const lo = Math.min(s0, s1);
    const span = Math.abs(s1 - s0);
    // Rounding half down, against the half up that puts the centre on a row: on a tie
    // both rounding up would paint the column a row low.
    const a = Math.ceil(lo - 0.5);
    const b = Math.max(a, Math.ceil(lo + span - 0.5) - 1);
    for (let s = a; s <= b; s++) {
      const row = oy + s;
      if (row < 0 || row >= bh) continue;
      const u = span > 0 ? Math.min(1, Math.max(0, (s + 0.5 - lo) / span)) : 0.5;
      const along = s0 <= s1 ? u : 1 - u;
      const z = z0 + (z1 - z0) * along;
      // Nearest wins: in a notched stone, the top of the part below the notch is behind
      // the face of the part above it.
      if (buf[row * w + c] && depth[row * w + c] > z) continue;
      buf[row * w + c] = colour(along);
      depth[row * w + c] = z;
    }
  };
  for (let c = 0; c < w; c++) {
    let r = 0;
    while (r < h) {
      if (!mask[r * w + c]) {
        r++;
        continue;
      }
      const r0 = r;
      while (r < h && mask[r * w + c]) r++;
      const r1 = r;
      const [ya, yb] = [r0 - h / 2, r1 - h / 2];
      const span = r1 - r0 - 1;
      const at = (u: number) => r0 + Math.min(span, Math.floor(u * (span + 1)));
      // Its top and bottom: fresh where it broke; its own stone (taken from the middle of the
      // column, clear of the mortar round it), lit facing up and shaded facing down; or plain
      // bed.
      const own = (r: number) =>
        paint.face
          ? paint.face(body.ox + ownC(c), body.oy + ownR(Math.min(r1 - 1, Math.max(r0, r))), false)
          : 0;
      if (upper) {
        const fr = fresh?.[r0 * w + c];
        const word = fr
          ? own((r0 + r1) >> 1)
            ? lighter(own((r0 + r1) >> 1), 0.3)
            : BED.fresh
          : own((r0 + r1) >> 1)
            ? lighter(own((r0 + r1) >> 1), 0.1)
            : sf > 0.5
              ? BED.side
              : BED.up;
        fill(
          c,
          project(ya, -T / 2),
          project(ya, T / 2),
          deep(ya, -T / 2),
          deep(ya, T / 2),
          () => word,
        );
      }
      if (lower) {
        const fr = fresh?.[(r1 - 1) * w + c];
        const word = fr
          ? own((r0 + r1) >> 1)
            ? lighter(own((r0 + r1) >> 1), 0.3)
            : BED.fresh
          : own((r0 + r1) >> 1)
            ? darker(own((r0 + r1) >> 1), 0.25)
            : BED.down;
        fill(
          c,
          project(yb, -T / 2),
          project(yb, T / 2),
          deep(yb, -T / 2),
          deep(yb, T / 2),
          () => word,
        );
      }
      if (front) {
        fill(c, project(ya, T / 2), project(yb, T / 2), deep(ya, T / 2), deep(yb, T / 2), (u) =>
          faceWord(c, at(u), false),
        );
      }
      if (back) {
        fill(c, project(ya, -T / 2), project(yb, -T / 2), deep(ya, -T / 2), deep(yb, -T / 2), (u) =>
          faceWord(c, at(u), true),
        );
      }
    }
  }
  // Into the scene, turned in the plane about the stone's centre, sunk, mossed and clipped.
  // Its left column and centre row on whole pixels. Turned about a centre that moves between
  // pixels, a stone moving a fraction of a pixel a frame is sampled afresh every frame: its
  // outline and grain shimmer. Pinned to the pixels, its turned image only moves, a whole
  // pixel at a time, and turned or not it samples the same pixels of itself where they meet.
  const left = Math.round(pose.x - w / 2);
  const sx = left + w / 2;
  const centre = pose.y + K * pose.z + paint.sink;
  const sy = Math.round(centre);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const turned = theta !== 0;
  const half = Math.ceil(Math.hypot(w, bh) / 2) + 1;
  const [x0, x1] = turned ? [Math.floor(sx - half), Math.ceil(sx + half)] : [left, left + w - 1];
  const [y0, y1] = turned ? [sy - half, sy + half] : [sy - oy, sy - oy + bh - 1];
  let bottom = -Infinity;
  let highest = Infinity;
  // The stone's own pixel under scene pixel `X`, `Y`, as an index into its buffer (-1: none).
  const at2 = (X: number, Y: number) => {
    let u: number;
    let v: number;
    if (turned) {
      // About the centre: across the middle of the stone's columns, and between the rows its
      // faces were laid from (scene row `sy` begins there, as its buffer's row `oy` does). A
      // centre half a row off moves a stone turned half round a whole row.
      const dx = X + 0.5 - sx;
      const dy = Y + 0.5 - sy;
      u = Math.floor(dx * ct + dy * st + w / 2);
      v = Math.floor(-dx * st + dy * ct + oy);
    } else {
      u = X - left;
      v = Y - (sy - oy);
    }
    return u < 0 || v < 0 || u >= w || v >= bh ? -1 : v * w + u;
  };
  const src = (X: number, Y: number) => {
    const q = at2(X, Y);
    return q < 0 ? 0 : buf[q];
  };
  // Moss climbs from the stone's lowest row, sunk or not.
  if (paint.moss > 0) {
    for (let Y = y0; Y <= y1; Y++) {
      for (let X = x0; X <= x1; X++) {
        if (src(X, Y)) {
          bottom = Math.max(bottom, Y);
          highest = Math.min(highest, Y);
        }
      }
    }
  }
  const tall = bottom - highest + 1;
  const { floor, split, near } = paint;
  const shade = paint.shade && paint.shade.k > 0 ? paint.shade : null;
  const dusk = shade ? wordOf(shade.colour) : 0;
  let touched = false;
  for (let Y = y0; Y <= y1; Y++) {
    if (Y > paint.ground || Y < top || Y >= top + H) continue;
    for (let X = Math.max(0, x0); X <= Math.min(W - 1, x1); X++) {
      const q = at2(X, Y);
      if (q < 0) continue;
      let px = buf[q];
      if (!px) continue;
      const z = pose.z + depth[q];
      // In front of the wall's face, or behind it, as asked.
      if (paint.depth && (paint.depth === "front" ? z < 0 : z >= 0)) continue;
      // The height of the point of the stone it shows: the middle of its row, where the
      // stone would be unrounded, less what its depth puts on it. A top sunk level with the
      // floor is under it (depths are single floats: a thousandth to spare).
      if (floor !== undefined && Y + 0.5 + centre - sy - K * z > floor - 1e-3) continue;
      if (paint.hidden?.(X, Y)) continue;
      const o = (Y - top) * W + X;
      if (near) {
        if (z <= near[o]) continue;
        near[o] = z;
      }
      if (paint.moss > 0) {
        const climb = (bottom - Y) / tall;
        if (paint.moss > climb * 0.8 + hash(X, Y, body.id, 77) * 0.25) {
          px = wordOf(mossColour(X, Y, !src(X, Y - 1), paint.since));
        }
      }
      if (shade) px = toward(px, dusk, shade.k);
      if (split?.test(X, Y, z)) split.out[o] = px;
      else out[o] = px;
      touched = true;
    }
  }
  return touched ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
};
