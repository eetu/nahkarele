import { describe, expect, it } from "vitest";

import { FLOOR_Y } from "../../engine";
import { archOf, fruitAt, planAt, PX_M } from "../growth";
import { FRUIT, SPECIES, type Species } from "../trees";

const ROOT = { x: 136, y: FLOOR_Y + 3 };
const lifeOf = (seed: number, species: Species, years = 30) => archOf(seed, ROOT, species, years);

describe("friday's trees, growing", () => {
  it("grow the same from the same seed, and laying a life down further changes what it grew", () => {
    for (const species of SPECIES) {
      expect(planAt(lifeOf(7, species, 30), 10, false)).toEqual(
        planAt(lifeOf(7, species, 31), 10, false),
      );
    }
  });

  it("grow differently from another seed", () => {
    for (const species of SPECIES) {
      expect(planAt(lifeOf(7, species), 10, false).limbs).not.toEqual(
        planAt(lifeOf(8, species), 10, false).limbs,
      );
    }
  });

  it("only grow: taller, thicker at the foot, and no stem or branch moves as it grows", () => {
    for (const species of SPECIES) {
      for (const seed of [1, 2, 3]) {
        const arch = lifeOf(seed, species);
        let was = planAt(arch, 1, false);
        for (const age of [2, 4, 8, 12, 20, 29]) {
          const now = planAt(arch, age, false);
          expect(now.height).toBeGreaterThanOrEqual(was.height);
          expect(now.limbs[0].w).toBeGreaterThanOrEqual(was.limbs[0].w);
          const at = new Map(was.ids?.map((id, k) => [id, was.limbs[k].a]));
          now.ids?.forEach((id, k) => {
            const a = at.get(id);
            // Twigs (ids 128 and up within their branch) are drawn at their length: they grow.
            if (!a || id % 256 >= 128) return;
            expect(now.limbs[k].a.x).toBeCloseTo(a.x, 6);
            expect(now.limbs[k].a.y).toBeCloseTo(a.y, 6);
          });
          was = now;
        }
      }
    }
  });

  it("come in a couple of metres tall at five, and grow past the room in time", () => {
    for (const species of SPECIES) {
      const arch = lifeOf(4, species);
      const five = planAt(arch, 5, false).height / PX_M;
      expect(five).toBeGreaterThan(1);
      expect(five).toBeLessThan(4);
      if (["birch", "oak", "maple", "spruce", "pine"].includes(species)) {
        expect(planAt(arch, 29, false).height).toBeGreaterThan(ROOT.y);
      }
    }
  });

  it("raise their crowns: the lowest leaves climb, and the branches below die and drop", () => {
    for (const species of ["birch", "pine", "maple"] as Species[]) {
      const arch = lifeOf(5, species);
      const lowest = (age: number) => Math.max(...planAt(arch, age, false).clumps.map((c) => c.y));
      expect(lowest(25)).toBeLessThan(lowest(6));
      expect(planAt(arch, 25, false).limbs.some((l) => (l.dead ?? 0) > 0)).toBe(true);
    }
  });

  it("hang every piece on an earlier one, or on the root", () => {
    for (const species of SPECIES) {
      for (const age of [3, 12, 25]) {
        const plan = planAt(lifeOf(6, species), age);
        plan.parents?.forEach((p, k) => expect(p.piece).toBeLessThan(k));
        plan.clumpOn?.forEach((on) => expect(on).toBeLessThan(plan.limbs.length));
      }
    }
  });

  it("hang fruit on the fruit trees, and only there", () => {
    for (const species of SPECIES) {
      const fruit = fruitAt(planAt(lifeOf(5, species), 8), 0, FRUIT[species] ?? 0, 8);
      if (FRUIT[species]) expect(fruit.length).toBeGreaterThan(3);
      else expect(fruit).toEqual([]);
    }
  });

  it("give the owl a branch in the room, if there is one", () => {
    for (const species of SPECIES) {
      for (const age of [4, 10, 25]) {
        const { perch } = planAt(lifeOf(3, species), age);
        if (!perch) continue;
        expect(perch.y).toBeGreaterThanOrEqual(28);
        expect(perch.y).toBeLessThanOrEqual(ROOT.y - 30);
      }
    }
  });
});
