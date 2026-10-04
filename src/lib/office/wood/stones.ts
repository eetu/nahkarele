// The wall's stones as the room shows them: a block of the back wall, or a piece of one, at
// any pose. The floor is seen from a little above, so a px of depth shows K px lower down. A
// stone is drawn column by column through its own pixels: each column's cross-section (the
// block's height by the wall's thickness) is turned out of the wall's plane, and whichever of
// its faces look at the viewer fill the rows it projects to: the inside face (the room's
// plaster), the outside face (render, weathered), or the stone of its beds, lighter facing
// up. A small turn in the plane comes after. Lying, a slab shows edge-on: its bed toward the
// viewer, a strip of its face on top. Moss climbs it from the ground; sinking, it goes down
// behind the floor line. Pixels go into a word buffer, as the sheets take them.

import type { Pose } from "$lib/masonry/fall";
import type { Body } from "$lib/masonry/rubble";
import { hash } from "$lib/scene/pixel";

import { mossColour } from "./moss";

/** How far down the screen a px of depth shows. */
export const K = 0.25;

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

/** Where a stone is drawn and what is done to it: how far it has sunk, how far moss has
 *  climbed it (0 to 1), the floor at its depth, and what hides it (true: not drawn). */
export type Paint = {
  sink: number;
  moss: number;
  since: number;
  ground: number;
  hidden?: (x: number, y: number) => boolean;
};

const scratch = { buf: new Uint32Array(64 * 64), w: 64, h: 64 };
const scratchOf = (w: number, h: number) => {
  if (scratch.buf.length < w * h) scratch.buf = new Uint32Array(w * h * 2);
  scratch.w = w;
  scratch.h = h;
  scratch.buf.fill(0, 0, w * h);
  return scratch.buf;
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
  const { w, h, T, mask, fresh } = body;
  const cf = Math.cos(pose.phi);
  const sf = Math.sin(pose.phi);
  const project = (y: number, z: number) => y * cf + z * sf + K * (-y * sf + z * cf);
  const front = cf - K * sf > 0;
  const back = -cf + K * sf > 0;
  const upper = sf + K * cf > 0;
  const lower = -sf - K * cf > 0;
  // The columns, upright in the plane: rows from the stone's centre, which sits at `oy`.
  const reach =
    Math.ceil((Math.abs(h * cf) + Math.abs(T * sf)) / 2 + (K * (Math.abs(h * sf) + T)) / 2) + 2;
  const bh = reach * 2 + 1;
  const buf = scratchOf(w, bh);
  const oy = reach;
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
    if (outside)
      return edge ? OUTSIDE.edge : hash(body.block, c, r, 81) < 0.15 ? OUTSIDE.stain : OUTSIDE.face;
    if (fresh?.[r * w + c]) return BED.fresh;
    return edge ? INSIDE.edge : hash(body.block, c, r, 13) < 0.08 ? INSIDE.grit : INSIDE.face;
  };
  const fill = (c: number, s0: number, s1: number, colour: (u: number) => number) => {
    const a = Math.round(Math.min(s0, s1));
    const b = Math.round(Math.max(s0, s1));
    for (let s = a; s <= b; s++) {
      const row = oy + s;
      if (row < 0 || row >= bh) continue;
      const u = b > a ? (s - a) / (b - a) : 0.5;
      buf[row * w + c] = colour(s0 <= s1 ? u : 1 - u);
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
      const at = (u: number) => r0 + Math.min(span, Math.max(0, Math.round(u * span)));
      if (upper) {
        const fr = fresh?.[r0 * w + c];
        fill(c, project(ya, -T / 2), project(ya, T / 2), () =>
          fr ? BED.fresh : sf > 0.5 ? BED.side : BED.up,
        );
      }
      if (lower) {
        const fr = fresh?.[(r1 - 1) * w + c];
        fill(c, project(yb, -T / 2), project(yb, T / 2), () => (fr ? BED.fresh : BED.down));
      }
      if (front) fill(c, project(ya, T / 2), project(yb, T / 2), (u) => faceWord(c, at(u), false));
      if (back) fill(c, project(ya, -T / 2), project(yb, -T / 2), (u) => faceWord(c, at(u), true));
    }
  }
  // Into the scene, turned in the plane about the stone's centre, sunk, mossed and clipped.
  const sx = pose.x;
  const sy = pose.y + K * pose.z + paint.sink;
  const ct = Math.cos(pose.theta);
  const st = Math.sin(pose.theta);
  const turned = Math.abs(pose.theta) > 0.03;
  const half = Math.ceil(Math.hypot(w, bh) / 2) + 1;
  const [x0, x1] = turned
    ? [Math.floor(sx - half), Math.ceil(sx + half)]
    : [Math.round(sx - w / 2), Math.round(sx - w / 2) + w - 1];
  const [y0, y1] = turned
    ? [Math.floor(sy - half), Math.ceil(sy + half)]
    : [Math.round(sy) - oy, Math.round(sy) - oy + bh - 1];
  // Moss climbs from the lowest drawn row.
  let bottom = -Infinity;
  let highest = Infinity;
  const src = (X: number, Y: number) => {
    let u: number;
    let v: number;
    if (turned) {
      const dx = X + 0.5 - sx;
      const dy = Y + 0.5 - sy;
      u = Math.floor(dx * ct + dy * st + w / 2);
      v = Math.floor(-dx * st + dy * ct + oy + 0.5);
    } else {
      u = X - Math.round(sx - w / 2);
      v = Y - (Math.round(sy) - oy);
    }
    return u < 0 || v < 0 || u >= w || v >= bh ? 0 : buf[v * w + u];
  };
  for (let Y = y0; Y <= y1; Y++) {
    for (let X = x0; X <= x1; X++) {
      if (src(X, Y)) {
        bottom = Math.max(bottom, Y);
        highest = Math.min(highest, Y);
      }
    }
  }
  if (bottom < highest) return null;
  const tall = bottom - highest + 1;
  let touched = false;
  for (let Y = y0; Y <= y1; Y++) {
    if (Y > paint.ground || Y < top || Y >= top + H) continue;
    for (let X = Math.max(0, x0); X <= Math.min(W - 1, x1); X++) {
      let px = src(X, Y);
      if (!px || paint.hidden?.(X, Y)) continue;
      if (paint.moss > 0) {
        const climb = (bottom - Y) / tall;
        if (paint.moss > climb * 0.8 + hash(X, Y, body.id, 77) * 0.25) {
          px = wordOf(mossColour(X, Y, !src(X, Y - 1), paint.since));
        }
      }
      out[(Y - top) * W + X] = px;
      touched = true;
    }
  }
  return touched ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
};
