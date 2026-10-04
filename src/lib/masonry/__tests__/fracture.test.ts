import { describe, expect, it } from "vitest";

import { layBond } from "../bond";
import { breakOdds, fracture } from "../fracture";
import { pieceOf } from "../rubble";
import { bake } from "../timeline";
import { SPEC } from "./spec";

describe("breaking", () => {
  it("shares a block's pixels out exactly, each piece in one piece", () => {
    let tried = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const bond = layBond(SPEC, seed);
      for (const b of bond.blocks.filter((x) => x.n >= 60)) {
        const { mask, w, h } = pieceOf(bond, b);
        const pieces = fracture(mask, w, h, seed * 1000 + b.i, 40 + (b.i % 5) * 30);
        tried++;
        expect(pieces.length).toBeGreaterThanOrEqual(2);
        const cover = new Uint8Array(w * h);
        for (const p of pieces) {
          expect(p.n).toBeGreaterThan(0);
          let count = 0;
          const cells: number[] = [];
          for (let y = 0; y < p.h; y++) {
            for (let x = 0; x < p.w; x++) {
              if (!p.mask[y * p.w + x]) continue;
              count++;
              const q = (y + p.dy) * w + (x + p.dx);
              expect(cover[q]).toBe(0);
              cover[q] = 1;
              cells.push(y * p.w + x);
            }
          }
          expect(count).toBe(p.n);
          // Connected: everything reached from its first pixel.
          const seen = new Set([cells[0]]);
          const queue = [cells[0]];
          while (queue.length) {
            const q = queue.pop() as number;
            const x = q % p.w;
            const y = (q - x) / p.w;
            for (const [nx, ny] of [
              [x + 1, y],
              [x - 1, y],
              [x, y + 1],
              [x, y - 1],
            ]) {
              const n = ny * p.w + nx;
              if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h || !p.mask[n] || seen.has(n)) continue;
              seen.add(n);
              queue.push(n);
            }
          }
          expect(seen.size).toBe(p.n);
        }
        expect(Array.from(cover)).toEqual(Array.from(mask));
      }
    }
    expect(tried).toBeGreaterThan(200);
  });

  it("breaks more often the further a block falls", () => {
    expect(breakOdds(10, false, false)).toBeLessThan(breakOdds(60, false, false));
    expect(breakOdds(60, false, false)).toBeLessThan(breakOdds(130, false, false));
    let high = 0;
    let highBroke = 0;
    let low = 0;
    let lowBroke = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const r = bake(SPEC, seed);
      for (const im of r.impacts.filter((x) => !x.out && x.n >= 60)) {
        const body = r.bodies.find((b) => b.parent === null && b.lands === im.t);
        if (!body) continue;
        if (im.fall > 100) [high, highBroke] = [high + 1, highBroke + (body.broken ? 1 : 0)];
        else if (im.fall < 60) [low, lowBroke] = [low + 1, lowBroke + (body.broken ? 1 : 0)];
      }
    }
    expect(high).toBeGreaterThan(20);
    expect(highBroke / high).toBeGreaterThan(low ? lowBroke / low : 0);
  });
});
