// A block breaking where it lands: one or two cracks across it (usually across its length),
// each wandering a pixel either way as it goes, splitting it into two or three pieces, and a
// few chips knocked off its corners and the cracks' edges. The pieces share out the block's
// own pixels exactly; the pixels along a crack are marked fresh, for the pale of new stone.

import { hash } from "$lib/scene/pixel";

import { stream } from "./rand";

/** A piece of a broken block: its pixels over its own box, where that box sat in the block's,
 *  which of its pixels are fresh break, and whether it is a chip. */
export type Piece = {
  mask: Uint8Array;
  fresh: Uint8Array;
  w: number;
  h: number;
  dx: number;
  dy: number;
  n: number;
  chip: boolean;
};

/** The odds that a block breaks landing: likelier the further it fell, landing on an edge,
 *  or landing on rubble. */
export const breakOdds = (fall: number, edge: boolean, onRubble: boolean) => {
  const f = Math.min(1, Math.max(0, fall / 110));
  return Math.min(
    0.85,
    0.04 + 0.55 * f * f * (3 - 2 * f) + (edge ? 0.2 : 0) + (onRubble ? 0.1 : 0),
  );
};

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Break a block's `mask` (`w` by `h`) that fell `fall` px, for `seed`. */
export const fracture = (mask: Uint8Array, w: number, h: number, seed: number, fall: number) => {
  const rand = stream(Math.floor(hash(seed, 51) * 2 ** 31));
  const far = Math.min(1, Math.max(0, fall / 120));
  const three = rand() < 0.25 + 0.4 * far && Math.max(w, h) >= 18;
  // Cracks run across the long way of the block, mostly: down it when it is wider than tall.
  const down = w >= h ? rand() < 0.8 : rand() < 0.2;
  const [len, across] = down ? [h, w] : [w, h];
  const cracks = (three ? [0.33, 0.67] : [0.3 + 0.4 * rand()]).map((at) => {
    const path: number[] = [];
    let p = Math.round(at * across + (three ? (rand() - 0.5) * 3 : 0));
    for (let k = 0; k < len; k++) {
      path.push(p);
      const r = rand();
      p = Math.min(across - 2, Math.max(1, p + (r < 0.25 ? -1 : r > 0.75 ? 1 : 0)));
    }
    return path;
  });
  // Keep two cracks apart.
  if (cracks.length === 2) {
    for (let k = 0; k < len; k++) cracks[1][k] = Math.max(cracks[1][k], cracks[0][k] + 2);
  }
  const label = new Int16Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const [k, p] = down ? [y, x] : [x, y];
      label[y * w + x] = cracks.filter((c) => p >= c[k]).length;
    }
  }
  let labels = cracks.length + 1;
  // Chips off the edges, near the cracks and the corners.
  const chips = 1 + Math.floor(rand() * (2 + 3 * far));
  const edge: number[] = [];
  for (let q = 0; q < w * h; q++) {
    if (label[q] < 0) continue;
    const x = q % w;
    const y = (q - x) / w;
    const rim = NEIGHBOURS.some(([dx, dy]) => {
      const [nx, ny] = [x + dx, y + dy];
      return nx < 0 || ny < 0 || nx >= w || ny >= h || label[ny * w + nx] !== label[q];
    });
    if (rim) edge.push(q);
  }
  for (let c = 0; c < chips && edge.length; c++) {
    const start = edge[Math.floor(rand() * edge.length)];
    const from = label[start];
    if (from < 0 || from >= cracks.length + 1) continue;
    const size = 3 + Math.floor(rand() * 8);
    const queue = [start];
    let got = 0;
    while (queue.length && got < size) {
      const q = queue.shift() as number;
      if (label[q] !== from) continue;
      label[q] = labels;
      got++;
      const x = q % w;
      const y = (q - x) / w;
      for (const [dx, dy] of NEIGHBOURS) {
        const [nx, ny] = [x + dx, y + dy];
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && label[ny * w + nx] === from) {
          queue.push(ny * w + nx);
        }
      }
    }
    if (got) labels++;
  }
  // Each label in one piece: what a chip cut off its piece becomes a chip of its own.
  const seen = new Uint8Array(w * h);
  const pieces: Piece[] = [];
  const firstChip = cracks.length + 1;
  const kept = new Set<number>();
  for (let q = 0; q < w * h; q++) {
    if (label[q] < 0 || seen[q]) continue;
    const l = label[q];
    const px: number[] = [];
    const queue = [q];
    seen[q] = 1;
    while (queue.length) {
      const p = queue.pop() as number;
      px.push(p);
      const x = p % w;
      const y = (p - x) / w;
      for (const [dx, dy] of NEIGHBOURS) {
        const [nx, ny] = [x + dx, y + dy];
        const n = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[n] && label[n] === l) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    const chip = l >= firstChip || kept.has(l) || px.length < 12;
    kept.add(l);
    let [x0, y0, x1, y1] = [w, h, -1, -1];
    for (const p of px) {
      const x = p % w;
      const y = (p - x) / w;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
    const pw = x1 - x0 + 1;
    const ph = y1 - y0 + 1;
    const m = new Uint8Array(pw * ph);
    const fresh = new Uint8Array(pw * ph);
    for (const p of px) {
      const x = p % w;
      const y = (p - x) / w;
      m[(y - y0) * pw + (x - x0)] = 1;
      // Fresh where it broke from another piece.
      fresh[(y - y0) * pw + (x - x0)] = NEIGHBOURS.some(([dx, dy]) => {
        const [nx, ny] = [x + dx, y + dy];
        return (
          nx >= 0 &&
          ny >= 0 &&
          nx < w &&
          ny < h &&
          label[ny * w + nx] >= 0 &&
          label[ny * w + nx] !== l
        );
      })
        ? 1
        : 0;
    }
    pieces.push({ mask: m, fresh, w: pw, h: ph, dx: x0, dy: y0, n: px.length, chip });
  }
  return pieces;
};
