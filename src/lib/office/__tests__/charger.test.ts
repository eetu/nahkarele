import { describe, expect, it } from "vitest";

import { daylight } from "$lib/scene/sky";

import { dockAt, dockCue, openAt, opensAt, roundAt, tiltAt } from "../charger";
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

  it("comes down once a night, all the way, and is up and away by sunrise", () => {
    const from = opensAt() + 3;
    let flights = 0;
    let peak = 0;
    const cues = { land: 0, rise: 0 };
    for (let t = from; t < from + 4 * 600; t += 0.1) {
      const d = dockAt(t);
      if (d > 0) peak = Math.max(peak, d);
      else if (peak > 0) {
        // Each spell off its round is a whole night on the pad, never a dip.
        expect(peak).toBe(1);
        flights++;
        peak = 0;
      }
      const cue = dockCue(t, t + 0.1);
      if (cue) cues[cue]++;
    }
    expect(flights).toBeGreaterThan(30);
    // The last night may not be over yet.
    expect(cues.land - cues.rise).toBeGreaterThanOrEqual(0);
    expect(cues.land - cues.rise).toBeLessThanOrEqual(1);
    expect(Math.abs(cues.land - flights)).toBeLessThanOrEqual(1);
  });

  it("flies to the pad from where it left its round, and back to where the round has got", () => {
    const from = opensAt() + 3;
    let checked = 0;
    for (let t = from; t < from + 2 * 600; t += 0.37) {
      const d = dockAt(t);
      if (d <= 0 || d >= 1) {
        expect(roundAt(t)).toBe(t);
        continue;
      }
      // Off its round between the moment it left and the moment it is back on it.
      const edge = roundAt(t);
      expect(dockAt(edge)).toBe(0);
      expect(Math.abs(edge - t)).toBeLessThan(20);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
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
