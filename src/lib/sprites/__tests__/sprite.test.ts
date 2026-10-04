// The reader draws parts the way dab does: behind ones first, then the node's
// own grid, then the rest — each at its parent's frame, clamped to its own strip.
import { describe, expect, test } from "vitest";

import { layers, type Sprite } from "../sprite";

const grid = (w: number, h: number, ch = "A") => Array.from({ length: h }, () => ch.repeat(w));

/** A body with a leg in front and a one-frame tail behind. */
const deer = (): Sprite => ({
  name: "deer",
  w: 10,
  h: 4,
  palette: { A: "#8a5a34" },
  animations: { walk: [0, 1, 2] },
  frames: [grid(10, 4), grid(10, 4), grid(10, 4)],
  parts: [
    {
      name: "leg",
      x: 1,
      y: 2,
      w: 2,
      h: 2,
      palette: { A: "#6a4426" },
      frames: [grid(2, 2), grid(2, 2), grid(2, 2)],
    },
    {
      name: "tail",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      behind: true,
      palette: { A: "#6a4426" },
      frames: [grid(1, 1)],
    },
  ],
});

describe("drawing a sprite with parts", () => {
  test("behind parts first, then the body, then the rest, each where it is placed", () => {
    expect(layers(deer(), 2).map((l) => [l.key, l.x, l.y, l.frame])).toEqual([
      ["deer/tail", 0, 0, 0],
      ["deer", 0, 0, 2],
      ["deer/leg", 1, 2, 2],
    ]);
  });

  test("a sprite without parts is one layer, as it always was", () => {
    const plain = { ...deer(), parts: undefined };
    expect(layers(plain, 1)).toEqual([
      { key: "deer", body: plain, frame: 1, x: 0, y: 0, flip: undefined },
    ]);
  });

  test("mirrored, the parts move to the mirrored places and mirror too", () => {
    const flipped = layers(deer(), 0, "h");
    expect(flipped.map((l) => [l.key, l.x, l.flip])).toEqual([
      ["deer/tail", 9, "h"],
      ["deer", 0, "h"],
      ["deer/leg", 7, "h"],
    ]);
  });
});
