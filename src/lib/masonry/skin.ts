// Plaster over a wall's face, coming off in patches: each patch in its own time (it wears, and
// sooner up the wall, where the wet gets in from the top), and soon after the wall beside it has
// gone, the plaster's edge left open to the weather. A patch on a piece that falls goes with
// the piece. What is left of the coat is read at any moment from when each patch goes.

import { hash } from "$lib/scene/pixel";

import type { Bond } from "./types";

/** Plaster patches: which patch each pixel of the face is under (-1 for none), and when each
 *  patch comes off. */
export type Skin = { patch: Int32Array; lost: Float64Array };

/** A patch is about this wide, px; plaster wears on this scale, s, and shape; a patch next to
 *  a gap goes within this long of it, s. */
const PATCH = 14;
const ETA = 20000;
const BETA = 2;
const EDGE_S = 1200;

/** The plaster on `bond`'s face for `seed`, given when each piece leaves the wall. */
export const bakeSkin = (bond: Bond, seed: number, releaseAt: Float64Array): Skin => {
  const { w: W, h: H } = bond.spec;
  const { owner } = bond;
  // Patches: the nearest of seeds on a jittered grid, measured a little roughly.
  const cols = Math.ceil(W / PATCH) + 1;
  const rows = Math.ceil(H / PATCH) + 1;
  const seeds: [number, number][] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      seeds.push([
        (i + 0.2 + 0.6 * hash(seed, i, j, 21)) * PATCH,
        (j + 0.2 + 0.6 * hash(seed, i, j, 22)) * PATCH,
      ]);
    }
  }
  const patch = new Int32Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (owner[y * W + x] < 0) continue;
      // Asked from a point jostled a little, so patch edges come out ragged.
      const jog = hash(x >> 1, y >> 1, seed, 23);
      const px = x + (jog - 0.5) * 5;
      const py = y + (((jog * 7.31) % 1) - 0.5) * 5;
      const [gi, gj] = [Math.floor(px / PATCH), Math.floor(py / PATCH)];
      let best = -1;
      let near = Infinity;
      for (let j = gj - 1; j <= gj + 1; j++) {
        for (let i = gi - 1; i <= gi + 1; i++) {
          if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
          const [sx, sy] = seeds[j * cols + i];
          const d = (px - sx) * (px - sx) + (py - sy) * (py - sy);
          if (d < near) [best, near] = [j * cols + i, d];
        }
      }
      patch[y * W + x] = best;
    }
  }
  // When each goes: worn through (sooner up the wall), or left open by a gap beside it.
  const lost = new Float64Array(seeds.length).fill(Infinity);
  const opened = new Float64Array(seeds.length).fill(Infinity);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = patch[y * W + x];
      if (p < 0) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const [nx, ny] = [x + dx, y + dy];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const o = owner[ny * W + nx];
        if (o >= 0 && o !== owner[y * W + x]) opened[p] = Math.min(opened[p], releaseAt[o]);
      }
    }
  }
  seeds.forEach(([, sy], p) => {
    const up = 0.45 + 0.75 * Math.min(1, sy / H);
    const worn = ETA * up * (-Math.log(1 - hash(seed, p, 24))) ** (1 / BETA);
    lost[p] = Math.min(worn, opened[p] + 60 + EDGE_S * hash(seed, p, 25));
  });
  return { patch, lost };
};

/** Whether the face at `x`, `y` is still plastered at `t`. */
export const plasteredAt = (skin: Skin, w: number, x: number, y: number, t: number) => {
  const p = skin.patch[y * w + x];
  return p >= 0 && skin.lost[p] > t;
};
