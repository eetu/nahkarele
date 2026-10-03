import { describe, expect, it } from "vitest";

import { DAY_S, dayAt } from "../daylight";
import { SEASON_S, SEASONS_FROM, STORM_S } from "../seasons";

/** A day of samples starting at `from`. */
const day = (from: number) =>
  Array.from({ length: 240 }, (_, i) => dayAt(from + (i / 240) * DAY_S));

const MIDSUMMER = SEASONS_FROM + 0.5 * SEASON_S;
const MIDWINTER = SEASONS_FROM + 2.5 * SEASON_S;

describe("friday's days", () => {
  it("are long in summer and short in winter", () => {
    const up = (from: number) => day(from).filter((d) => d.sun).length;
    expect(up(MIDSUMMER)).toBeGreaterThan(2.5 * up(MIDWINTER));
  });

  it("send the sun high in summer and barely over the ridge in winter", () => {
    const top = (from: number) => Math.max(...day(from).map((d) => d.sun?.up ?? 0));
    expect(top(MIDSUMMER)).toBeGreaterThan(0.9);
    expect(top(MIDWINTER)).toBeLessThan(0.25);
  });

  it("break first as the storm clears", () => {
    const after = Array.from({ length: 20 }, (_, i) => dayAt(STORM_S + i * 0.5));
    expect(after.some((d) => d.sun)).toBe(true);
    expect(dayAt(STORM_S).sun).toBeNull();
  });

  it("have the moon at night only, waxing to full and waning again", () => {
    const phases: number[] = [];
    for (let t = SEASONS_FROM; t < SEASONS_FROM + 8 * DAY_S; t += 1) {
      const d = dayAt(t);
      if (d.sun) expect(d.moon).toBeNull();
      if (d.moon) phases.push(d.moon.phase);
    }
    expect(Math.min(...phases)).toBeLessThan(0.15);
    expect(phases.some((p) => Math.abs(p - 0.5) < 0.05)).toBe(true);
    expect(Math.max(...phases)).toBeGreaterThan(0.85);
  });
});
