import { describe, expect, it } from "vitest";

import { SCENE_W } from "../../engine";
import { SEASON_S, SEASONS_FROM } from "../seasons";
import {
  applesDown,
  appleTreeAt,
  fallen,
  fellCue,
  FRONT_ROOT_Y,
  inLane,
  type Life,
  ROOT_Y,
  sceneOf,
  shakeApple,
  standing,
} from "../stand";

const UNTIL = 20000;

/** Every tree that stands some time before `UNTIL`, by slot, in order. */
const livesOf = (seed: number): Life[][] => {
  const slots: Life[][] = [];
  for (let t = 0; t < UNTIL; t += 10) {
    for (const l of standing(seed, t)) {
      slots[l.slot] ??= [];
      if (!slots[l.slot].includes(l)) slots[l.slot].push(l);
    }
  }
  return slots;
};

describe("friday's stand", () => {
  it("stands its six slots where the room has them, three in front of the furniture", () => {
    const first = livesOf(1).map((lives) => lives[0]);
    expect(first.map((l) => Math.round(sceneOf(l, { x: 0, y: 0 }).x))).toEqual([
      62, 100, 140, 190, 232, 262,
    ]);
    expect(first.map((l) => inLane(l, true))).toEqual([true, false, false, false, true, true]);
    for (const l of first)
      expect(sceneOf(l, { x: 0, y: 0 }).y).toBeCloseTo(inLane(l, true) ? FRONT_ROOT_Y : ROOT_Y, 9);
  });

  it("keeps the apple tree's slot for apple trees, and changes the others' kind", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const slots = livesOf(seed);
      const apple = slots.filter((lives) => lives[0].species === "apple");
      expect(apple).toHaveLength(1);
      expect(apple[0].every((l) => l.species === "apple")).toBe(true);
      for (const lives of slots) {
        if (lives[0].species === "apple") continue;
        lives.forEach((l, k) => {
          expect(l.species).not.toBe("apple");
          if (k > 0) expect(l.species).not.toBe(lives[k - 1].species);
        });
      }
    }
  });

  it("cracks at a tree's root as it starts to go over, and crashes in the room as it lands", () => {
    const l = [...livesOf(1).flat()].sort((a, b) => a.falls - b.falls)[0];
    const root = sceneOf(l, { x: 0, y: 0 }).x;
    const crack = fellCue(l.falls - 0.5, l.falls + 0.5, 1);
    expect(crack.map((c) => c.kind)).toEqual(["crack"]);
    expect(crack[0].x).toBeCloseTo(root, 9);
    const crash = fellCue(l.falls + 1, l.falls + 3, 1);
    expect(crash.map((c) => c.kind)).toEqual(["crash"]);
    expect(Math.sign(crash[0].x - root)).toBe(l.side);
    expect(crash[0].x).toBeGreaterThanOrEqual(0);
    expect(crash[0].x).toBeLessThanOrEqual(SCENE_W);
    expect(fallen(1, l.falls + 1)).toContain(l);
  });

  it("drops its apples on the floor in front of the wall, and a shake brings one down at once", () => {
    let shaken = 0;
    for (let seed = 1; seed <= 4; seed++) {
      for (let y = 2; y < 12; y++) {
        const autumn = SEASONS_FROM + (4 * y + 1) * SEASON_S;
        for (const a of applesDown(autumn + 0.9 * SEASON_S, seed, {})) {
          expect(a.x).toBeGreaterThanOrEqual(2);
          expect(a.x).toBeLessThanOrEqual(SCENE_W - 3);
          expect(a.y).toBeGreaterThanOrEqual(152);
          expect(a.y).toBeLessThanOrEqual(167);
        }
        const t = autumn + 0.01 * SEASON_S;
        const key = shakeApple(t, seed, {});
        if (!key) continue;
        expect(appleTreeAt(t, seed, {})).not.toBeNull();
        const down = applesDown(t + 1, seed, { [key]: t }).find((a) => a.key === key);
        expect(down?.landed).toBeCloseTo(t + 0.6, 9);
        shaken++;
      }
    }
    expect(shaken).toBeGreaterThan(10);
  });
});
