import { describe, expect, it } from "vitest";

import { archOf, planAt } from "../growth";
import { poseOf, rigOf } from "../sway";
import { type Look, SPECIES, type Species } from "../trees";

const SUMMER: Look = { k: 0, p: 0.5, leaves: 1, snow: 0 };
const ROOT = { x: 160, y: 150 };
const reach = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);
const mean = (ps: { x: number; y: number }[]) => ps.reduce((s, p) => s + reach(p), 0) / ps.length;
/** A young tree, six years old, whole. */
const young = (seed: number, species: Species) => planAt(archOf(seed, ROOT, species, 12), 6, false);

describe("sway", () => {
  it("hangs every piece of every kind on an earlier one, or on the root", () => {
    for (const species of SPECIES) {
      for (let seed = 1; seed <= 10; seed++) {
        const rig = rigOf(young(seed * 977, species));
        expect(rig.joints[0].piece).toBe(-1);
        rig.joints.forEach((j, k) => expect(j.piece).toBeLessThan(k));
      }
    }
  });

  it("holds still without wind", () => {
    for (const species of SPECIES) {
      const plan = young(5, species);
      const pose = poseOf(plan, 1, SUMMER, 12.3, () => 0);
      for (const d of [...pose.a, ...pose.b, ...pose.clumps, ...pose.fruit, pose.perch]) {
        expect(reach(d)).toBeCloseTo(0, 9);
      }
    }
  });

  it("keeps the roots where they are and moves the twigs more than the trunk", () => {
    for (const species of SPECIES) {
      const plan = young(11, species);
      const pose = poseOf(plan, 1, SUMMER, 3.7, () => 1);
      rigOf(plan).joints.forEach((j, k) => {
        if (j.piece < 0) expect(reach(pose.a[k])).toBeCloseTo(0, 9);
      });
      const thin = plan.limbs.flatMap((l, k) => (l.w <= 1 ? [pose.b[k]] : []));
      if (thin.length) expect(mean(thin)).toBeGreaterThan(reach(pose.b[0]));
    }
  });

  it("leans and holds in a steady wind, the wood still from one moment to the next", () => {
    for (const species of SPECIES) {
      const plan = young(13, species);
      const early = poseOf(plan, 1, SUMMER, 5, () => 0.6);
      const late = poseOf(plan, 1, SUMMER, 9.3, () => 0.6);
      expect(reach(early.b[early.b.length - 1])).toBeGreaterThan(0);
      early.b.forEach((d, k) =>
        expect(reach({ x: d.x - late.b[k].x, y: d.y - late.b[k].y })).toBeCloseTo(0, 9),
      );
    }
  });

  it("bends further at the height of a gust than before it", () => {
    const plan = young(3, "birch");
    const gust = (time: number) => 0.3 + (time > 10 ? 1 : 0);
    const tops = (t: number) => mean(poseOf(plan, 1, SUMMER, t, (_, ago) => gust(t - ago)).b);
    expect(tops(11.5)).toBeGreaterThan(2 * tops(9.5));
  });

  it("moves further in a harder wind", () => {
    const plan = young(3, "birch");
    let calm = 0;
    let gale = 0;
    for (let t = 0; t < 10; t += 0.37) {
      calm += mean(poseOf(plan, 1, SUMMER, t, () => 0.3).clumps);
      gale += mean(poseOf(plan, 1, SUMMER, t, () => 1.5).clumps);
    }
    expect(gale).toBeGreaterThan(2 * calm);
  });
});
