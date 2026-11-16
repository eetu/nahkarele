import { describe, expect, it } from "vitest";

import { behindText } from "../still";

describe("the note over friday's still", () => {
  it("says how far behind in one unit, rounded", () => {
    expect(behindText(0.4)).toBe("1 s");
    expect(behindText(42)).toBe("42 s");
    expect(behindText(600)).toBe("10 min");
    expect(behindText(3600)).toBe("60 min");
    expect(behindText(6 * 3600)).toBe("6 h");
    expect(behindText(7 * 86400)).toBe("7 d");
  });
});
