import { describe, expect, it } from "vitest";

import { FLOOR_Y } from "../../engine";
import { healAt } from "../outside";
import { fixtureAt, rubbleCue } from "../wall";

const FIXTURES = {
  window: { x: 124, y: 16, w: 72, h: 46 },
  clock: { x: 212, y: 22, w: 44, h: 20 },
  speaker: { x: 61, y: 4, w: 13, h: 10 },
  exit: { x: 149, y: 4, w: 22, h: 8 },
};
const OPENINGS = ["window"];

describe("the back wall", () => {
  it("holds everything until the blast", () => {
    for (const seed of [1, 2, 3]) {
      for (const name of Object.keys(FIXTURES)) {
        expect(fixtureAt(name, 0, seed, FIXTURES, OPENINGS).on).toBe(true);
      }
    }
  });

  it("comes down at the blast and keeps crumbling for years", () => {
    for (const seed of [4, 5, 6]) {
      expect(rubbleCue(0, 60, seed, FIXTURES, OPENINGS).length).toBeGreaterThan(0);
      expect(rubbleCue(600, 1800, seed, FIXTURES, OPENINGS).length).toBeGreaterThan(0);
      expect(rubbleCue(0, 60, seed, FIXTURES, OPENINGS)).toEqual(
        rubbleCue(0, 60, seed, FIXTURES, OPENINGS),
      );
    }
  });

  it("stands what fell at the wall's foot", () => {
    for (const seed of [7, 8, 9, 10]) {
      for (const name of Object.keys(FIXTURES)) {
        const { on, rect } = fixtureAt(name, 5000, seed, FIXTURES, OPENINGS);
        if (!on) expect(rect.y + rect.h).toBe(FLOOR_Y + 1);
      }
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
