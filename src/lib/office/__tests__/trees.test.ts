import { describe, expect, it } from "vitest";

import { FLOOR_Y, SCENE_W } from "../engine";
import { planTree, SPECIES } from "../trees";

const ROOT = { x: 136, y: FLOOR_Y + 3 };

describe("friday's trees", () => {
  it("grow the same from the same seed", () => {
    for (const species of SPECIES) {
      expect(planTree(7, ROOT, 90, species)).toEqual(planTree(7, ROOT, 90, species));
    }
  });

  it("grow differently from another seed", () => {
    for (const species of SPECIES) {
      expect(planTree(7, ROOT, 90, species).limbs).not.toEqual(
        planTree(8, ROOT, 90, species).limbs,
      );
    }
  });

  it("stay inside the room, however tall they are asked to be", () => {
    for (const species of SPECIES) {
      for (let seed = 0; seed < 40; seed++) {
        for (const x of [8, 160, 312]) {
          const plan = planTree(seed, { x, y: ROOT.y }, 160, species);
          const points = [
            ...plan.limbs.flatMap((l) => [l.a, l.b]),
            ...plan.clumps.map((c) => ({ x: c.x - c.r, y: c.y - c.r })),
            ...plan.clumps.map((c) => ({ x: c.x + c.r, y: c.y })),
          ];
          for (const p of points) {
            expect(p.y).toBeGreaterThanOrEqual(5.9);
            expect(p.x).toBeGreaterThanOrEqual(1.9);
            expect(p.x).toBeLessThanOrEqual(SCENE_W - 1.9);
          }
        }
      }
    }
  });

  it("hang fruit on the fruit trees, and only there", () => {
    const fruiting = ["apple", "cherry", "plum"];
    for (const species of SPECIES) {
      const { fruit } = planTree(5, ROOT, 70, species);
      if (fruiting.includes(species)) expect(fruit.length).toBeGreaterThan(3);
      else expect(fruit).toEqual([]);
    }
  });

  it("give the owl a branch within the tree", () => {
    for (const species of SPECIES) {
      const plan = planTree(3, ROOT, 90, species);
      expect(plan.perch.y).toBeLessThan(ROOT.y);
      expect(plan.perch.y).toBeGreaterThan(ROOT.y - plan.height);
    }
  });
});
