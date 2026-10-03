import { describe, expect, it } from "vitest";

import { daylight } from "$lib/scene/sky";

import { seasonAt, SEASONS_FROM } from "../seasons";
import { birdAt, birdCue, cycleAt, youngAt } from "../tit";
import { windowAt } from "../weather";

const YEARS = SEASONS_FROM + 3 * 600;

describe("the great tit", () => {
  it("comes by day and sleeps the nights", () => {
    let day = 0;
    let night = 0;
    for (let t = SEASONS_FROM; t < YEARS; t += 3.7) {
      const light = daylight(windowAt(t - cycleAt(t) + 3).progress);
      if (light < 0.3) {
        expect(birdAt(t)).toBeNull();
        night++;
      } else if (cycleAt(t) > 4 && cycleAt(t) < 12) {
        expect(birdAt(t)?.sit).toBe(true);
        day++;
      }
    }
    expect(day).toBeGreaterThan(50);
    expect(night).toBeGreaterThan(50);
  });

  it("stays the winter, fluffed up, sings in spring, and brings its young in summer", () => {
    const seen = { fluffed: 0, songs: 0, young: 0 };
    for (let t = SEASONS_FROM; t < YEARS; t += 0.5) {
      const { k } = seasonAt(t);
      const bird = birdAt(t);
      if (bird?.dress.fluff) {
        expect([1, 2, 3]).toContain(k);
        seen.fluffed++;
      }
      if (birdCue(t, t + 0.5) === "song") {
        expect(k).toBe(3);
        seen.songs++;
      }
      if (youngAt(t)) {
        expect(k).toBe(0);
        seen.young++;
      }
      if (k === 2 && bird) expect(bird.dress.fluff).toBe(true);
    }
    expect(seen.fluffed).toBeGreaterThan(0);
    expect(seen.songs).toBeGreaterThan(0);
    expect(seen.young).toBeGreaterThan(0);
  });
});
