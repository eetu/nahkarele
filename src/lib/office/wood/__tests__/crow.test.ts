import { describe, expect, it } from "vitest";

import { daylight } from "$lib/scene/sky";

import { crowAtJar, crowCue } from "../crow";
import { birdAt, cycleAt } from "../tit";
import { windowAt } from "../weather";

const WALL = {
  fixtures: { window: { x: 124, y: 16, w: 72, h: 46 } },
  openings: ["window"],
  fronts: [],
};

describe("the crow", () => {
  it("lands by the jar while the tit is on it, by day, and the tit goes", () => {
    let landings = 0;
    for (const seed of [1, 2, 3]) {
      const seen = new Set<number>();
      for (let t = 0; t < 20000; t += 13) {
        const land = crowAtJar(seed, t);
        if (land === null || seen.has(land)) continue;
        seen.add(land);
        landings++;
        const c = cycleAt(land);
        expect(c).toBeGreaterThanOrEqual(3);
        expect(c).toBeLessThan(13);
        expect(daylight(windowAt(land).progress)).toBeGreaterThan(0.2);
        expect(birdAt(land - 0.5, land)?.sit).toBe(true);
        expect(birdAt(land + 0.5, land)?.sit).toBe(false);
      }
    }
    expect(landings).toBeGreaterThan(5);
  });

  it("caws now and then, the same however finely the clock is read", () => {
    let coarse = 0;
    let fine = 0;
    for (let t = 0; t < 8000; t += 1) coarse += crowCue(t, t + 1, 5, WALL, {}).length;
    for (let t = 0; t < 8000; t += 0.25) fine += crowCue(t, t + 0.25, 5, WALL, {}).length;
    expect(coarse).toBeGreaterThan(5);
    expect(fine).toBe(coarse);
  });
});
