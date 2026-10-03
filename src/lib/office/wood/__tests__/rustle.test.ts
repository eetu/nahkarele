import { describe, expect, it } from "vitest";

import { rustleOf } from "../rustle";
import { planShrub, SHRUBS } from "../shrubs";
import type { Look } from "../trees";

const SUMMER: Look = { k: 0, p: 0.5, leaves: 1, snow: 0 };
const ROOT = { x: 160, y: 170 };
const reach = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

describe("shrubs", () => {
  it("grow the same from the same seed, and stay rooted where planted", () => {
    for (const kind of SHRUBS) {
      for (let seed = 1; seed <= 10; seed++) {
        const plan = planShrub(seed * 31, ROOT, 20, kind);
        expect(planShrub(seed * 31, ROOT, 20, kind)).toEqual(plan);
        expect(plan.stems).toBeGreaterThan(0);
        for (const p of plan.pieces) expect(p.a.y).toBeLessThanOrEqual(ROOT.y + 0.01);
        for (const c of plan.clumps) expect(c.stem).toBeLessThan(plan.stems);
      }
    }
  });
});

describe("rustle", () => {
  it("holds still without wind", () => {
    for (const kind of SHRUBS) {
      const pose = rustleOf(planShrub(7, ROOT, 20, kind), 1, SUMMER, 4.2, () => 0);
      for (const d of [...pose.a, ...pose.b, ...pose.clumps, ...pose.fruit]) {
        expect(reach(d)).toBeCloseTo(0, 9);
      }
      expect(pose.flip?.some(Boolean)).toBe(false);
    }
  });

  it("bends each stem from its base, its tip furthest", () => {
    const plan = planShrub(3, ROOT, 20, "raspberry");
    const pose = rustleOf(plan, 1, SUMMER, 6, () => 1);
    plan.pieces.forEach((p, i) => {
      if (p.s0 === 0) expect(reach(pose.a[i])).toBeCloseTo(0, 9);
      expect(reach(pose.b[i])).toBeGreaterThanOrEqual(reach(pose.a[i]));
    });
  });

  it("ripples on in a steady wind, where a tree would hold its lean", () => {
    const plan = planShrub(5, ROOT, 20, "lilac");
    const at = (t: number) => rustleOf(plan, 1, SUMMER, t, () => 1).clumps;
    const moved = at(5).some(
      (d, i) => reach({ x: d.x - at(5.6)[i].x, y: d.y - at(5.6)[i].y }) > 0.1,
    );
    expect(moved).toBe(true);
  });

  it("turns leaves over only in a stiff wind, and the juniper's never", () => {
    const flipped = (kind: (typeof SHRUBS)[number], wind: number) => {
      const plan = planShrub(9, ROOT, 20, kind);
      let n = 0;
      for (let t = 0; t < 10; t += 0.31)
        n += rustleOf(plan, 1, SUMMER, t, () => wind).flip?.filter(Boolean).length ?? 0;
      return n;
    };
    expect(flipped("raspberry", 0.3)).toBe(0);
    expect(flipped("raspberry", 1.5)).toBeGreaterThan(0);
    expect(flipped("juniper", 2)).toBe(0);
  });
});
