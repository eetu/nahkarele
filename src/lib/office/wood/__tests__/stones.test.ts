import { describe, expect, it } from "vitest";

import { bake } from "$lib/masonry/timeline";
import { WALL } from "$lib/office/draw";

import { paintStone } from "../stones";
import { specOf } from "../wall";

const W = 120;
const H = 120;

describe("a stone in flight", () => {
  it("keeps its shape moving a fraction of a pixel a frame, however it is turned", () => {
    const r = bake({ ...specOf(WALL), bond: "rubble", course: 12, unit: 18, thickness: 20 }, 1);
    const body = r.bodies.find((b) => b.w > 14) ?? r.bodies[0];
    const shot = (y: number, theta: number, phi: number) => {
      const px = new Uint32Array(W * H);
      paintStone(
        px,
        W,
        H,
        0,
        body,
        { x: 60, y, z: 4, phi, theta },
        {
          sink: 0,
          moss: 0,
          since: 0,
          ground: 999,
        },
      );
      return px;
    };
    for (const [theta, phi] of [
      [0, 0],
      [0.39, 0],
      [0.39, 1.18],
      [-0.2, 2.4],
    ]) {
      let changed = 0;
      let prev = shot(40, theta, phi);
      let prevAt = Math.round(40 + 1);
      for (let k = 1; k < 30; k++) {
        const y = 40 + k * 0.33;
        const now = shot(y, theta, phi);
        // Lined up by the whole pixels it has moved, it is the same picture.
        const dy = Math.round(y + 1) - prevAt;
        for (let q = 0; q < W * H; q++) {
          const before = q - dy * W;
          if (now[q] !== (before >= 0 && before < W * H ? prev[before] : 0)) changed++;
        }
        prev = now;
        prevAt = Math.round(y + 1);
      }
      expect(changed).toBe(0);
    }
  });
});
