import { describe, expect, it } from "vitest";

import { SEASON_S, SEASONS_FROM } from "../seasons";
import { fallen, fellCue, type Life, standing } from "../stand";

const UNTIL = 20000;

/** Every tree that stands some time before `UNTIL`, by slot, in order. */
const livesOf = (seed: number): Life[][] => {
  const slots: Life[][] = [];
  for (let t = 0; t < UNTIL; t += 10) {
    for (const l of standing(seed, t)) {
      slots[l.slot] ??= [];
      if (!slots[l.slot].includes(l)) slots[l.slot].push(l);
    }
  }
  return slots;
};

describe("friday's stand", () => {
  it("grows, dies standing in a spring, goes over, and only then makes room", () => {
    for (let seed = 1; seed <= 6; seed++) {
      for (const lives of livesOf(seed)) {
        lives.forEach((l, k) => {
          expect(l.n).toBe(k);
          expect(l.born + l.grows).toBeLessThan(l.dies);
          expect(l.dies).toBeLessThan(l.falls);
          expect(((l.dies - SEASONS_FROM) / SEASON_S) % 4).toBeCloseTo(3);
          if (k > 0) expect(l.born).toBeGreaterThan(lives[k - 1].falls);
        });
      }
    }
  });

  it("keeps the apple tree's slot for apple trees, and changes the others' kind", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const slots = livesOf(seed);
      const apple = slots.filter((lives) => lives[0].plan.species === "apple");
      expect(apple).toHaveLength(1);
      expect(apple[0].every((l) => l.plan.species === "apple")).toBe(true);
      for (const lives of slots) {
        if (lives[0].plan.species === "apple") continue;
        lives.forEach((l, k) => {
          expect(l.plan.species).not.toBe("apple");
          if (k > 0) expect(l.plan.species).not.toBe(lives[k - 1].plan.species);
        });
      }
    }
  });

  it("brings some trees down within a few hours of friday, and lets them rot away", () => {
    const down = new Set<Life>();
    for (let t = 0; t < UNTIL; t += 10) for (const l of fallen(1, t)) down.add(l);
    expect(down.size).toBeGreaterThan(2);
    for (const l of down) {
      expect(fallen(1, l.falls + 1)).toContain(l);
      expect(fallen(1, l.falls + 2.4 + l.rots + 1)).not.toContain(l);
    }
  });

  it("cracks as a tree starts to go over, and crashes as it lands", () => {
    const l = [...livesOf(1).flat()].sort((a, b) => a.falls - b.falls)[0];
    expect(fellCue(l.falls - 0.5, l.falls + 0.5, 1)).toEqual([{ x: l.plan.root.x, kind: "crack" }]);
    const crash = fellCue(l.falls + 1, l.falls + 3, 1);
    expect(crash.map((c) => c.kind)).toEqual(["crash"]);
    expect(Math.sign(crash[0].x - l.plan.root.x)).toBe(l.side);
    expect(fellCue(l.falls + 3, l.falls + 60, 1)).toEqual([]);
  });

  it("is the same wood whatever moment is asked about first", () => {
    const late = standing(2, 15000).map((l) => [l.slot, l.n, l.born, l.plan.species]);
    standing(3, 100);
    standing(2, 100);
    standing(2, 5000);
    expect(standing(2, 15000).map((l) => [l.slot, l.n, l.born, l.plan.species])).toEqual(late);
  });
});
