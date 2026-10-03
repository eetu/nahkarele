import { describe, expect, it } from "vitest";

import { CLIMBERS, planClimber, planCurtain } from "../climbers";
import { planGrass } from "../grass";
import { rustleOf } from "../rustle";
import type { Look } from "../trees";

const SUMMER: Look = { k: 0, p: 0.5, leaves: 1, snow: 0 };
const ROOT = { x: 100, y: 150 };
const reach = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);

describe("climbers", () => {
  it("reach up from the floor: each stem there from its base out", () => {
    for (const kind of CLIMBERS) {
      for (let seed = 1; seed <= 8; seed++) {
        const plan = planClimber(seed * 17, ROOT, 100, kind);
        expect(planClimber(seed * 17, ROOT, 100, kind)).toEqual(plan);
        for (let k = 0; k < plan.stems; k++) {
          const ats = plan.pieces.filter((p) => p.stem === k).map((p) => p.at);
          expect(ats).toEqual([...ats].sort((a, b) => a - b));
        }
        for (const p of plan.pieces) expect(p.at).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keep the creeper on its AI", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const plan = planCurtain(seed, 6, 22, 150, 44);
      for (const p of plan.pieces) {
        expect(p.b.x).toBeGreaterThanOrEqual(7);
        expect(p.b.x).toBeLessThanOrEqual(48);
      }
    }
  });

  it("hold to the wall: in wind the creeper's stems stay, its leaves stir", () => {
    const plan = planClimber(5, ROOT, 100, "creeper");
    const pose = rustleOf(plan, 1, SUMMER, 3.3, () => 1.2);
    for (const d of [...pose.a, ...pose.b]) expect(reach(d)).toBeCloseTo(0, 9);
    expect(pose.clumps.some((d) => reach(d) > 0.2)).toBe(true);
  });
});

describe("grass", () => {
  it("comes up in tufts at their points", () => {
    const tufts = [
      { x: 60, y: 160, delay: 0 },
      { x: 90, y: 170, delay: 5 },
    ];
    const plan = planGrass(3, tufts);
    for (const blade of plan.blades) {
      const t = tufts[blade.tuft];
      expect(Math.abs(blade.base.x - t.x)).toBeLessThanOrEqual(4);
    }
  });

  it("bows to the wind from the root, the blades out of step with each other", () => {
    const plan = planGrass(4, [{ x: 160, y: 170, delay: 0 }]);
    const pose = rustleOf(plan, 1, SUMMER, 7.1, () => 1);
    plan.pieces.forEach((p, i) => {
      if (p.s0 === 0) expect(reach(pose.a[i])).toBeCloseTo(0, 9);
    });
    const tips = plan.pieces.flatMap((p, i) => (p.s1 === 1 ? [pose.b[i].x] : []));
    expect(Math.max(...tips) - Math.min(...tips)).toBeGreaterThan(0.1);
  });
});
