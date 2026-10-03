import { describe, expect, it } from "vitest";

import { SCENE_W } from "../../engine";
import { SEASON_S, SEASONS_FROM } from "../seasons";
import { driftOf, windAt, windDir } from "../wind";

const mean = (from: number, to: number, seed: number) => {
  let sum = 0;
  for (let t = from; t < to; t += 0.5) sum += Math.abs(windAt(t, seed));
  return sum / ((to - from) / 0.5);
};

describe("wind", () => {
  it("is a function of time and the seed, blowing the wood's way", () => {
    for (const seed of [1, 2, 3, 99]) {
      for (let t = 0; t < 1200; t += 7.3) {
        const w = windAt(t, seed, 100);
        expect(windAt(t, seed, 100)).toBe(w);
        expect(Math.sign(w) * windDir(seed)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("blows hardest in the storm, then in autumn, least in summer", () => {
    const summer = mean(SEASONS_FROM, SEASONS_FROM + SEASON_S * 0.7, 5);
    const autumn = mean(SEASONS_FROM + SEASON_S, SEASONS_FROM + SEASON_S * 1.7, 5);
    expect(mean(5, 85, 5)).toBeGreaterThan(autumn);
    expect(autumn).toBeGreaterThan(2 * summer);
  });

  it("reaches the downwind wall about four seconds after the upwind one", () => {
    const seed = [1, 2, 3, 4].find((s) => windDir(s) > 0) ?? 1;
    for (let t = 400; t < 460; t += 1.1) {
      expect(windAt(t + SCENE_W / 80, seed, SCENE_W)).toBeCloseTo(windAt(t, seed, 0), 9);
    }
  });

  it("carries things the way it blows, further the longer they are in it", () => {
    const seed = 7;
    const short = driftOf(500, 502, seed, 160);
    const long = driftOf(500, 510, seed, 160);
    expect(Math.sign(long)).toBe(windDir(seed));
    expect(Math.abs(long)).toBeGreaterThan(Math.abs(short));
    expect(driftOf(510, 500, seed, 160)).toBe(0);
  });
});
