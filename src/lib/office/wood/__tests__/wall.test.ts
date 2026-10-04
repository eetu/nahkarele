import { describe, expect, it } from "vitest";

import { FLOOR_Y } from "../../engine";
import { healAt } from "../outside";
import { fixtureAt, floatingAt, rubbleCue } from "../wall";

const FIXTURES = {
  window: { x: 124, y: 16, w: 72, h: 46 },
  clock: { x: 212, y: 22, w: 44, h: 20 },
  speaker: { x: 61, y: 4, w: 13, h: 10 },
  exit: { x: 149, y: 4, w: 22, h: 8 },
};
const WALL = { fixtures: FIXTURES, openings: ["window"], fronts: [] };

describe("the back wall", () => {
  it("holds everything until the blast", () => {
    for (const seed of [1, 2, 3]) {
      for (const name of Object.keys(FIXTURES)) {
        expect(fixtureAt(name, 0, seed, WALL).on).toBe(true);
      }
    }
  });

  it("comes down at the blast and keeps crumbling through its first hours", () => {
    for (const seed of [4, 5, 6]) {
      expect(rubbleCue(0, 60, seed, WALL).length).toBeGreaterThan(0);
      expect(rubbleCue(600, 1800, seed, WALL).length).toBeGreaterThan(0);
      expect(rubbleCue(1800, 7200, seed, WALL).length).toBeGreaterThan(0);
      expect(rubbleCue(0, 60, seed, WALL)).toEqual(rubbleCue(0, 60, seed, WALL));
    }
  });

  it("stands what fell at the wall's foot", () => {
    for (const seed of [7, 8, 9, 10]) {
      for (const name of Object.keys(FIXTURES)) {
        const { on, rect } = fixtureAt(name, 5000, seed, WALL);
        if (!on) expect(rect.y + rect.h).toBe(FLOOR_Y + 1);
      }
    }
  });

  it("brings the exit down in front of the furniture, where it can still be pressed", () => {
    // The wall is cached by seed: a setting of its own wants seeds of its own.
    const front = { ...WALL, fronts: [{ x: 104, y: 118, w: 114, h: 32 }], before: ["exit"] };
    for (const seed of [11, 12, 13, 14]) {
      const { on, rect } = fixtureAt("exit", 40000, seed, front);
      expect(on).toBe(false);
      expect(rect.y + rect.h).toBe(FLOOR_Y + 14);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(320);
    }
  });
});

describe("the world outside", () => {
  it("heals from nothing at the blast to whole in a few years", () => {
    expect(healAt(0)).toBe(0);
    expect(healAt(600)).toBeGreaterThan(0);
    expect(healAt(600)).toBeLessThan(healAt(1200));
    expect(healAt(3000)).toBe(1);
  });
});

describe("what is left of the wall", () => {
  it("never hangs in the air", () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      for (const since of [10, 100, 600, 2000, 5000, 9000]) {
        expect(floatingAt(since, seed, WALL)).toBe(0);
      }
    }
  });
});
