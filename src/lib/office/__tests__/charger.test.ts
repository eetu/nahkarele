import { describe, expect, it } from "vitest";

import { daylight } from "$lib/scene/sky";

import { dockAt, openAt, opensAt, tiltAt } from "../charger";
import { dayAt } from "../wood/daylight";
import { STORM_S } from "../wood/seasons";
import { windowAt } from "../wood/weather";

const light = (t: number) => daylight(windowAt(t).progress);

describe("the drone's charger", () => {
  it("comes out of its box once, as friday's first day ends", () => {
    const at = opensAt();
    expect(at).toBeGreaterThan(STORM_S);
    expect(openAt(at - 0.1)).toBe(0);
    expect(openAt(at + 3)).toBe(1);
    // Daylight when it opens, dusk soon after.
    expect(light(at)).toBeGreaterThan(0.3);
    let t = at;
    while (light(t) > 0.3) t += 0.25;
    expect(t - at).toBeLessThan(10);
  });

  it("has the drone asleep on it the nights, and about the room the days", () => {
    expect(dockAt(opensAt() - 1)).toBe(0);
    let nights = 0;
    let days = 0;
    for (let t = opensAt() + 3; t < opensAt() + 3 + 20 * 60; t += 1.7) {
      if (light(t) < 0.15) {
        expect(dockAt(t)).toBe(1);
        nights++;
      } else if (light(t) > 0.45) {
        expect(dockAt(t)).toBe(0);
        days++;
      }
    }
    expect(nights).toBeGreaterThan(20);
    expect(days).toBeGreaterThan(20);
  });

  it("turns its panel to the sun, and lays it flat at night", () => {
    for (let t = STORM_S; t < STORM_S + 20 * 60; t += 0.9) {
      const sun = dayAt(t).sun;
      if (!sun) expect(tiltAt(t)).toBe(0);
      else if (sun.across < 0.3) expect(tiltAt(t)).toBeLessThan(0);
      else if (sun.across > 0.7) expect(tiltAt(t)).toBeGreaterThan(0);
    }
  });
});
