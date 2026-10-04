import { describe, expect, it } from "vitest";

import { HOLD, layBond } from "../bond";
import { BASE, type Spec } from "../types";
import { SPEC } from "./spec";

/** The same wall built three ways, with how many pieces each should come to. */
const BUILDS: [Spec, number, number][] = [
  [SPEC, 75, 110],
  [{ ...SPEC, bond: "brick", course: 4, unit: 10, thickness: 9 }, 550, 800],
  [{ ...SPEC, bond: "rubble", course: 12, unit: 18, thickness: 20 }, 120, 230],
];

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const inWindow = (x: number, y: number) => x >= 122 && x < 198 && y >= 14 && y < 64;

describe("laying the bond", () => {
  it.each(BUILDS)("covers the wall exactly, the opening left open (%#)", (spec) => {
    for (const seed of SEEDS) {
      const { owner, blocks, joint, unit } = layBond(spec, seed);
      expect(joint.length).toBe(SPEC.w * SPEC.h);
      expect(unit.length).toBe(SPEC.w * SPEC.h);
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

  it.each(BUILDS)("lays whole pieces, no scraps (%#)", (spec, lo, hi) => {
    for (const seed of SEEDS) {
      const { blocks } = layBond(spec, seed);
      expect(blocks.length).toBeGreaterThanOrEqual(lo);
      expect(blocks.length).toBeLessThanOrEqual(hi);
      for (const b of blocks) {
        expect(b.n).toBeGreaterThanOrEqual(Math.min(12, (spec.unit * spec.course) / 4));
        expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(Math.min(5, spec.course - 1));
      }
    }
  });

  it.each(BUILDS)("keeps each piece in one piece (%#)", (spec) => {
    for (const seed of SEEDS.slice(0, 4)) {
      const { owner, blocks } = layBond(spec, seed);
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

  it.each(BUILDS)("knows what rests on what, both ways, always on something lower (%#)", (spec) => {
    for (const seed of SEEDS) {
      const { blocks } = layBond(spec, seed);
      for (const b of blocks) {
        for (const c of b.bed) {
          expect(c.n).toBeGreaterThanOrEqual(HOLD);
          if (c.j < 0) continue;
          const under = blocks[c.j];
          expect(under.course > b.course || (under.course === b.course && under.cy > b.cy)).toBe(
            true,
          );
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
