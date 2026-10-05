import { bake, lying } from "@anarkisti/korpi/masonry";
import { describe, expect, it } from "vitest";

import { WALL } from "$lib/office/draw";

import { faceOf, K, paintStone, THETA_STEP } from "../stones";
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

describe("a stone at rest", () => {
  const SW = 320;
  const SH = 180;
  const count = (px: Uint32Array) => px.reduce((n, p) => n + (p ? 1 : 0), 0);

  it("lying on the floor shows whole; sinking, it goes under pixel by pixel, top last", () => {
    let tried = 0;
    for (const build of Object.values(BUILDS)) {
      const spec = { ...specOf(WALL), ...build };
      const r = bake(spec, 1);
      for (const l of lying(r, 1800)) {
        const rest = l.body.lying;
        if (!rest || rest.base > 0) continue;
        const shot = (sink: number, floor?: number) => {
          const px = new Uint32Array(SW * SH);
          paintStone(px, SW, SH, 0, l.body, l.pose, {
            sink,
            moss: 0,
            since: 0,
            ground: SH,
            floor,
          });
          return count(px);
        };
        tried++;
        // Turned in the wall plane, a stone is sampled to the nearest pixel, which puts its
        // corners up to a pixel off its outline: they may go under a pixel early, or late.
        // Upright (or half round, drawn as upright), exactly.
        const turned = Math.round(l.pose.theta / THETA_STEP) % 16 !== 0;
        const off = turned ? 1 : 0;
        expect(shot(0, spec.ground + off)).toBe(shot(0));
        let last = Infinity;
        for (let sink = 0; sink < rest.top; sink++) {
          const n = shot(sink, spec.ground);
          expect(n).toBeLessThanOrEqual(last);
          last = n;
        }
        // As far down as it is still kept, and no further: gone.
        expect(shot(rest.top + off, spec.ground)).toBe(0);
      }
    }
    expect(tried).toBeGreaterThan(30);
  });

  it("shades toward a colour, and splits between two layers without losing a pixel", () => {
    const r = bake({ ...specOf(WALL), ...BUILDS.brick }, 1);
    // Split across them all: a chip lying flat can sit wholly in its middle row and below.
    let split = 0;
    for (const l of lying(r, 1800).slice(0, 20)) {
      const paint = { sink: 0, moss: 0, since: 0, ground: SH };
      const whole = new Uint32Array(SW * SH);
      paintStone(whole, SW, SH, 0, l.body, l.pose, paint);
      const dark = new Uint32Array(SW * SH);
      paintStone(dark, SW, SH, 0, l.body, l.pose, {
        ...paint,
        shade: { colour: "#000000", k: 0.5 },
      });
      const [a, b] = [new Uint32Array(SW * SH), new Uint32Array(SW * SH)];
      const y = Math.round(l.pose.y + K * l.pose.z);
      paintStone(a, SW, SH, 0, l.body, l.pose, {
        ...paint,
        split: { out: b, test: (_x, Y) => Y < y },
      });
      let wrong = 0;
      for (let o = 0; o < SW * SH; o++) {
        if ((a[o] && b[o]) || (a[o] || b[o]) !== whole[o]) wrong++;
        if (b[o]) split++;
        if (!whole[o]) continue;
        // Half way to black, each channel.
        for (const s of [0, 8, 16]) {
          if (Math.abs(((dark[o] >> s) & 0xff) - ((whole[o] >> s) & 0xff) / 2) >= 1) wrong++;
        }
      }
      expect(wrong).toBe(0);
    }
    expect(split).toBeGreaterThan(0);
  });
});
