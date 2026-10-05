import { bake, type Knock, lying, moving, type Ruin, type Spec } from "@anarkisti/korpi/masonry";
import { describe, expect, it } from "vitest";

import { WALL } from "$lib/office/draw";

import { specOf } from "../wall";

const BUILDS = {
  block: {},
  brick: { bond: "brick", course: 4, unit: 10, thickness: 9 },
  rubble: { bond: "rubble", course: 12, unit: 18, thickness: 20 },
} as const;

/** What of `r` shows at `t`: what is falling and what lies, where. */
const seenAt = (r: Ruin, t: number) => ({
  moving: moving(r, t).map(({ body, pose }) => [body.id, body.block, pose]),
  lying: lying(r, t).map(({ body, pose, sink }) => [body.id, body.block, pose, sink]),
});

/** `r` up to `t`: every release, cue, insert, hung thing and patch of plaster gone by then,
 *  and what shows on the way there. */
const pastOf = (r: Ruin, t: number) => ({
  releases: r.releases.filter((x) => x.t < t),
  cues: r.cues.filter((x) => x.t < t),
  inserts: Array.from(r.insertAt, (a) => Math.min(a, t)),
  hangs: Object.values(r.hangAt).map((a) => Math.min(a, t)),
  plaster: r.skin ? Array.from(r.skin.lost, (a) => Math.min(a, t)) : null,
  seen: [121, 119, 60, 10, 2, 0.5, 0.1, 0.017, 1e-6]
    .map((d) => t - d)
    .filter((s) => s >= 0)
    .map((s) => seenAt(r, s)),
});

describe("a tap on the wall", () => {
  it("changes nothing before it, whatever it hits and whenever", () => {
    for (const build of Object.values(BUILDS)) {
      const spec: Spec = { ...specOf(WALL), ...build };
      const window = spec.inserts[0].rect;
      const taps: Knock[][] = [
        // Low, high, at the ends, into the window; the roof, near and far.
        [{ t: 20, x: 150, y: 88, kind: "block" }],
        [{ t: 150, x: 90, y: 6, kind: "block" }],
        [{ t: 600, x: 2, y: 50, kind: "block" }],
        [{ t: 3600, x: spec.w - 2, y: 70, kind: "block" }],
        [{ t: 150, x: window.x + 10, y: window.y + 10, kind: "block" }],
        [{ t: 20, x: 40, y: 0, kind: "roof" }],
        [{ t: 150, x: 160, y: 0, kind: "roof" }],
        [{ t: 900, x: 290, y: 0, kind: "roof" }],
        [{ t: 3600, x: 34, y: 0, kind: "roof" }],
        // Two at once.
        [
          { t: 150, x: 150, y: 80, kind: "block" },
          { t: 150, x: 200, y: 0, kind: "roof" },
        ],
      ];
      for (const seed of [1, 2]) {
        const base = bake(spec, seed);
        for (const tap of taps) {
          const t = tap[0].t;
          const tapped = bake({ ...spec, knocks: tap }, seed);
          expect(pastOf(tapped, t)).toEqual(pastOf(base, t));
        }
        // A second tap, on what the first knocked out and next to it.
        const first: Knock = { t: 30, x: 150, y: 70, kind: "block" };
        const once = bake({ ...spec, knocks: [first] }, seed);
        for (const second of [
          { ...first, t: 31 },
          { ...first, t: 31, x: 160 },
        ]) {
          const twice = bake({ ...spec, knocks: [first, second] }, seed);
          expect(pastOf(twice, 31)).toEqual(pastOf(once, 31));
        }
      }
    }
    // Some 70 bakes.
  }, 60_000);
});
