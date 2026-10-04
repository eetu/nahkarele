import { describe, expect, it } from "vitest";

import { bake } from "$lib/masonry/timeline";
import { WALL } from "$lib/office/draw";

import { faceOf, paintStone, THETA_STEP } from "../stones";
import { specOf } from "../wall";

const W = 120;
const H = 120;

const BUILDS = {
  block: {},
  brick: { bond: "brick", course: 4, unit: 10, thickness: 9 },
  rubble: { bond: "rubble", course: 12, unit: 18, thickness: 20 },
} as const;

describe("a stone in flight", () => {
  it("keeps its shape moving a fraction of a pixel a frame, however it is turned", () => {
    const r = bake({ ...specOf(WALL), ...BUILDS.rubble }, 1);
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

  it("leaves its mortar behind and, where it sat, covers its own pixels and no others", () => {
    for (const build of Object.values(BUILDS)) {
      const spec = { ...specOf(WALL), ...build };
      const r = bake(spec, 1);
      const face = faceOf(r.bond, null, 0);
      for (const body of r.bodies.filter((b) => b.parent === null).slice(0, 40)) {
        const px = new Uint32Array(spec.w * spec.h);
        const pose = {
          x: body.ox + body.w / 2,
          y: body.oy + body.h / 2,
          z: -body.T / 2,
          phi: 0,
          theta: 0,
        };
        // Its front, on the wall's face: what shows in front of the wall.
        const paint = { sink: 0, moss: 0, since: 0, ground: 999, face, depth: "front" as const };
        paintStone(px, spec.w, spec.h, 0, body, pose, paint);
        for (let y = 0; y < body.h; y++) {
          for (let x = 0; x < body.w; x++) {
            const q = (body.oy + y) * spec.w + body.ox + x;
            expect(Boolean(px[q])).toBe(Boolean(body.mask[y * body.w + x]));
            if (body.mask[y * body.w + x]) expect(r.bond.joint[q]).toBe(0);
          }
        }
        let painted = 0;
        for (const p of px) if (p) painted++;
        expect(painted).toBe(body.n);
      }
    }
  });

  it("stays where it was when it turns its first step", () => {
    const r = bake({ ...specOf(WALL), ...BUILDS.rubble }, 2);
    const middle = (theta: number, body: (typeof r.bodies)[number]) => {
      const px = new Uint32Array(W * H);
      paintStone(
        px,
        W,
        H,
        0,
        body,
        { x: 60.3, y: 60.6, z: 4, phi: 0, theta },
        {
          sink: 0,
          moss: 0,
          since: 0,
          ground: 999,
        },
      );
      let [n, sx, sy] = [0, 0, 0];
      for (let q = 0; q < W * H; q++) {
        if (!px[q]) continue;
        n++;
        sx += q % W;
        sy += Math.floor(q / W);
      }
      return [sx / n, sy / n];
    };
    // Odd and even widths and heights.
    const kinds = new Set<string>();
    for (const body of r.bodies) {
      const kind = `${body.w % 2}${body.h % 2}`;
      if (kinds.has(kind) || body.w < 8) continue;
      kinds.add(kind);
      const [ax, ay] = middle(0, body);
      for (const turn of [THETA_STEP, -THETA_STEP]) {
        const [bx, by] = middle(turn, body);
        expect(Math.abs(bx - ax)).toBeLessThan(0.5);
        expect(Math.abs(by - ay)).toBeLessThan(0.5);
      }
    }
    expect(kinds.size).toBe(4);
  });
});
