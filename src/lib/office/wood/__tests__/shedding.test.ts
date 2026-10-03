import { describe, expect, it } from "vitest";

import { SCENE_W } from "../../engine";
import { SEASONS_FROM } from "../seasons";
import { shedCue } from "../shedding";

describe("friday's trees shedding", () => {
  it("drop dead branches now and then once the year turns, landing in the room", () => {
    for (const seed of [1, 2, 3]) {
      expect(shedCue(0, SEASONS_FROM, seed)).toEqual([]);
      const landed = shedCue(SEASONS_FROM, 8000, seed);
      expect(landed.length).toBeGreaterThan(5);
      for (const x of landed) {
        expect(x).toBeGreaterThan(-40);
        expect(x).toBeLessThan(SCENE_W + 40);
      }
    }
  });

  it("drop the same branches whichever way the clock is read", () => {
    const whole = shedCue(SEASONS_FROM, 6000, 4).length;
    let parts = 0;
    for (let t = SEASONS_FROM; t < 6000; t += 250) parts += shedCue(t, t + 250, 4).length;
    expect(parts).toBe(whole);
  });
});
