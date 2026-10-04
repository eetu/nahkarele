import { describe, expect, it } from "vitest";

import { HOLD, layBond } from "../bond";
import { BASE } from "../types";
import { SPEC } from "./spec";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const inWindow = (x: number, y: number) => x >= 122 && x < 198 && y >= 14 && y < 64;

describe("laying the bond", () => {
  it("covers the wall exactly, the opening left open", () => {
    for (const seed of SEEDS) {
      const { owner, blocks } = layBond(SPEC, seed);
      for (let y = 0; y < SPEC.h; y++) {
        for (let x = 0; x < SPEC.w; x++) {
          expect(owner[y * SPEC.w + x] < 0).toBe(inWindow(x, y));
        }
      }
      const total = blocks.reduce((s, b) => s + b.n, 0);
      expect(total).toBe(SPEC.w * SPEC.h - 76 * 50);
      for (const b of blocks) for (const q of b.px) expect(owner[q]).toBe(b.i);
    }
  });

  it("lays some ninety whole blocks, no scraps", () => {
    for (const seed of SEEDS) {
      const { blocks } = layBond(SPEC, seed);
      expect(blocks.length).toBeGreaterThanOrEqual(75);
      expect(blocks.length).toBeLessThanOrEqual(110);
      for (const b of blocks) {
        expect(b.n).toBeGreaterThanOrEqual(12);
        expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("keeps each block in one piece", () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const { owner, blocks } = layBond(SPEC, seed);
      for (const b of blocks) {
        const seen = new Set([b.px[0]]);
        const queue = [b.px[0]];
        while (queue.length) {
          const q = queue.pop() as number;
          const x = q % SPEC.w;
          for (const n of [q + 1, q - 1, q + SPEC.w, q - SPEC.w]) {
            if ((n === q + 1 && x === SPEC.w - 1) || (n === q - 1 && x === 0)) continue;
            if (owner[n] === b.i && !seen.has(n)) {
              seen.add(n);
              queue.push(n);
            }
          }
        }
        expect(seen.size).toBe(b.n);
      }
    }
  });

  it("knows what rests on what, both ways, always on something lower", () => {
    for (const seed of SEEDS) {
      const { blocks } = layBond(SPEC, seed);
      for (const b of blocks) {
        for (const c of b.bed) {
          expect(c.n).toBeGreaterThanOrEqual(HOLD);
          if (c.j < 0) continue;
          const under = blocks[c.j];
          expect(under.course).toBeGreaterThan(b.course);
          expect(under.top.find((t) => t.j === b.i)?.n).toBe(c.n);
        }
      }
      // The bottom course rests on the base, all of it.
      const bottom = blocks.filter((b) => b.y + b.h === SPEC.h);
      expect(bottom.length).toBeGreaterThan(8);
      for (const b of bottom) expect(b.bed.some((c) => c.j === BASE)).toBe(true);
    }
  });

  it("lays the same wall for the same seed", () => {
    const a = layBond(SPEC, 42);
    const b = layBond(SPEC, 42);
    expect(Array.from(a.owner)).toEqual(Array.from(b.owner));
  });
});
