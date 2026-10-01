import { describe, expect, it } from "vitest";

import { CUES, TAPE_SECONDS } from "../orientation";
import script from "../orientation.json";

describe("orientation tape", () => {
  it("was recorded from the current script", () => {
    // Edited a line? Run `uv run scripts/gen-tape.py` to record it again.
    expect(CUES.map((c) => c.text)).toEqual(script.lines);
  });

  it("holds each caption until the next one starts", () => {
    for (const [i, c] of CUES.entries()) {
      expect(c.end).toBeGreaterThan(c.start);
      expect(c.end).toBe(CUES[i + 1]?.start ?? TAPE_SECONDS);
    }
  });
});
