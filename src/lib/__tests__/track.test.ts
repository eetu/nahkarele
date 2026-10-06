import { describe, expect, it } from "vitest";

import { track, type Tracker } from "../track";

describe("track", () => {
  it("reports each name once a visit, and nothing without a tracker on the page", async () => {
    const names: string[] = [];
    const tracker = async (): Promise<Tracker> => ({
      event: async (name) => {
        names.push(name);
      },
    });
    track("test:a", tracker);
    track("test:a", tracker);
    track("test:b", tracker);
    track("test:none");
    await new Promise((r) => setTimeout(r, 0));
    expect(names).toEqual(["test:a", "test:b"]);
  });

  it("swallows a tracker that fails", async () => {
    track("test:fails", async () => {
      throw new Error("blocked");
    });
    await new Promise((r) => setTimeout(r, 0));
  });
});
