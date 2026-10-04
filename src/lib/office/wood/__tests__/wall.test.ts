import { describe, expect, it } from "vitest";

import { lying, moving, ruinOf } from "$lib/masonry/query";

import { FLOOR_Y, SCENE_H, SCENE_W } from "../../engine";
import { healAt } from "../outside";
import { paintStone } from "../stones";
import {
  facesFor,
  fixtureAt,
  floatingAt,
  MOSS_FROM,
  paintFalling,
  paintLying,
  RUBBLE_H,
  RUBBLE_TOP,
  rubbleCue,
  specOf,
} from "../wall";

const FIXTURES = {
  window: { x: 124, y: 16, w: 72, h: 46 },
  clock: { x: 212, y: 22, w: 44, h: 20 },
  speaker: { x: 61, y: 4, w: 13, h: 10 },
  exit: { x: 149, y: 4, w: 22, h: 8 },
};
const WALL = { fixtures: FIXTURES, openings: ["window"], fronts: [] };

describe("the back wall", () => {
  it("holds everything until the blast", () => {
    for (const seed of [1, 2, 3]) {
      for (const name of Object.keys(FIXTURES)) {
        expect(fixtureAt(name, 0, seed, WALL).on).toBe(true);
      }
    }
  });

  it("comes down at the blast and keeps crumbling through its first hours", () => {
    for (const seed of [4, 5, 6]) {
      expect(rubbleCue(0, 60, seed, WALL).length).toBeGreaterThan(0);
      expect(rubbleCue(600, 1800, seed, WALL).length).toBeGreaterThan(0);
      expect(rubbleCue(1800, 7200, seed, WALL).length).toBeGreaterThan(0);
      expect(rubbleCue(0, 60, seed, WALL)).toEqual(rubbleCue(0, 60, seed, WALL));
    }
  });

  it("stands what fell at the wall's foot", () => {
    for (const seed of [7, 8, 9, 10]) {
      for (const name of Object.keys(FIXTURES)) {
        const { on, rect } = fixtureAt(name, 5000, seed, WALL);
        if (!on) expect(rect.y + rect.h).toBe(FLOOR_Y + 1);
      }
    }
  });

  it("brings the exit down in front of the furniture, where it can still be pressed", () => {
    // The wall is cached by seed: a setting of its own wants seeds of its own.
    const front = { ...WALL, fronts: [{ x: 104, y: 118, w: 114, h: 32 }], before: ["exit"] };
    for (const seed of [11, 12, 13, 14]) {
      const { on, rect } = fixtureAt("exit", 40000, seed, front);
      expect(on).toBe(false);
      expect(rect.y + rect.h).toBe(FLOOR_Y + 14);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(320);
    }
  });
});

describe("the world outside", () => {
  it("heals from nothing at the blast to whole in a few years", () => {
    expect(healAt(0)).toBe(0);
    expect(healAt(600)).toBeGreaterThan(0);
    expect(healAt(600)).toBeLessThan(healAt(1200));
    expect(healAt(3000)).toBe(1);
  });
});

describe("what is left of the wall", () => {
  it("never hangs in the air", () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      for (const since of [10, 100, 600, 2000, 5000, 9000]) {
        expect(floatingAt(since, seed, WALL)).toBe(0);
      }
    }
  });
});

describe("the stones in the room", () => {
  const N = SCENE_W * SCENE_H;
  const shade = { colour: "#0a0f1c", k: 0.2 };

  it("drawn in layers about the back trees, over and under what lies, are the nearest stone at each pixel", () => {
    let frames = 0;
    let behind = 0;
    let covered = 0;
    let wrong = 0;
    for (const seed of [1, 2, 3]) {
      const r = ruinOf(specOf(WALL), seed);
      // The blast and its first two minutes: much falling onto much lying, none of it mossed.
      for (let since = 1; since < MOSS_FROM; since += 0.37) {
        const down = lying(r, since);
        const flying = moving(r, since);
        if (!down.length || !flying.length) continue;
        frames++;
        const band = SCENE_W * RUBBLE_H;
        const lain = {
          front: new Uint32Array(band),
          behind: new Uint32Array(band),
          near: new Float32Array(band),
        };
        paintLying(r, since, WALL.fronts, shade, lain);
        const fell = {
          front: new Uint32Array(N),
          behind: new Uint32Array(N),
          near: new Float32Array(N),
        };
        paintFalling(r, since, WALL.fronts, shade, lain.near, fell, () => {});
        // In the order they are drawn.
        const shown = new Uint32Array(N);
        const off = RUBBLE_TOP * SCENE_W;
        for (const [layer, at] of [
          [lain.behind, off],
          [fell.behind, 0],
          [lain.front, off],
          [fell.front, 0],
        ] as const) {
          layer.forEach((p, o) => {
            if (p) shown[o + at] = p;
          });
        }
        // Everything in one buffer, nearest wins.
        const one = new Uint32Array(N);
        const near = new Float32Array(N).fill(-Infinity);
        const base = { moss: 0, since, ground: SCENE_H, floor: FLOOR_Y, near, shade };
        for (const l of down)
          paintStone(one, SCENE_W, SCENE_H, 0, l.body, l.pose, {
            ...base,
            ...facesFor(r, l.body),
            sink: l.sink,
          });
        const alone = new Uint32Array(N);
        const free = new Float32Array(N).fill(-Infinity);
        for (const m of flying) {
          const paint = { ...base, ...facesFor(r, m.body), sink: 0, depth: "front" as const };
          paintStone(one, SCENE_W, SCENE_H, 0, m.body, m.pose, paint);
          paintStone(alone, SCENE_W, SCENE_H, 0, m.body, m.pose, { ...paint, near: free });
        }
        for (let o = 0; o < N; o++) {
          if (shown[o] !== one[o]) wrong++;
          if (alone[o] && shown[o] !== alone[o]) covered++;
        }
        behind += lain.behind.reduce((n, p) => n + (p ? 1 : 0), 0);
        behind += fell.behind.reduce((n, p) => n + (p ? 1 : 0), 0);
      }
    }
    expect(frames).toBeGreaterThan(10);
    expect(wrong).toBe(0);
    // It was put to the test: stones behind the trees, and falling stones behind lying ones.
    expect(behind).toBeGreaterThan(0);
    expect(covered).toBeGreaterThan(0);
  });

  it("lie within the band they are drawn in", () => {
    for (const seed of [1, 2, 3]) {
      const r = ruinOf(specOf(WALL), seed);
      const px = new Uint32Array(N);
      for (const l of lying(r, 3600)) {
        paintStone(px, SCENE_W, SCENE_H, 0, l.body, l.pose, {
          sink: l.sink,
          moss: 0,
          since: 3600,
          ground: SCENE_H,
          floor: FLOOR_Y,
        });
      }
      for (let o = 0; o < RUBBLE_TOP * SCENE_W; o++) expect(px[o]).toBe(0);
    }
    expect(RUBBLE_TOP + RUBBLE_H).toBe(SCENE_H);
  });
});
