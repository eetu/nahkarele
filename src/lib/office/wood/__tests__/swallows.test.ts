import { describe, expect, it } from "vitest";

import { seasonAt, SEASONS_FROM } from "../seasons";
import { swallowCue } from "../swallows";

describe("the swallows", () => {
  it("twitter in the room from late spring to early autumn, and are gone south the rest", () => {
    let heard = 0;
    for (let t = SEASONS_FROM; t < SEASONS_FROM + 3 * 600; t += 0.5) {
      if (!swallowCue(t, t + 0.5).length) continue;
      heard++;
      const { k, p } = seasonAt(t + 0.5);
      expect(k === 0 || (k === 3 && p >= 0.55) || (k === 1 && p < 0.25)).toBe(true);
    }
    expect(heard).toBeGreaterThan(20);
  });
});
