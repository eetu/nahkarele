import { type Knock, ruinOf } from "@anarkisti/korpi/masonry";
import { raster, rasterPen } from "@anarkisti/korpi/paint";
import { describe, expect, it } from "vitest";

import { PX_M, ROOM_VIEW } from "../../depth";
import { FLOOR_Y, SCENE_H, SCENE_W } from "../../engine";
import { healAt } from "../outside";
import {
  fixtureAt,
  floatingAt,
  heapIn,
  onWall,
  paintWall,
  pokeAt,
  specOf,
  standsAt,
  wallIn,
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

  it("comes down at the blast and keeps coming down through its first hours, into a heap that sinks away", () => {
    for (const seed of [4, 5, 6]) {
      const lying = (since: number) => heapIn(since, seed, WALL).ww.things.list.length;
      const [early, later, hours, days] = [60, 1800, 7200, 400000].map(lying);
      expect(early).toBeGreaterThan(0);
      expect(later).toBeGreaterThan(early);
      expect(hours).toBeGreaterThan(later);
      expect(days).toBeLessThan(hours);
      // Read again at a moment, the heap is as it was.
      expect(lying(1800)).toBe(later);
    }
  });

  it("is heard landing, frame by frame through the blast", () => {
    for (const seed of [4, 5]) {
      let heard = 0;
      for (let k = 1; k <= 600; k++)
        heard += heapIn(k / 30, seed, WALL).ww.things.landings((k - 1) / 30, k / 30).length;
      expect(heard).toBeGreaterThan(0);
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

describe("the wall in the room", () => {
  const near = (d: number, z: number) => Math.abs(d + z) < 1e-6;

  it("puts its face at the wall and its tops behind it, within its thickness", () => {
    // Counted, then asserted once: an expect per pixel of a hundred frames is most of the time.
    const seen = { face: 0, tops: 0, room: 0, past: 0, glowing: 0 };
    const deep = specOf(WALL).thickness / PX_M;
    for (const seed of [1, 2, 3]) {
      // The blast and its first minutes: much coming down.
      for (let since = 1; since < 240; since += 7.3) {
        const scene = raster(SCENE_W, SCENE_H);
        // A glowing sky behind it all.
        scene.glow.fill(255);
        paintWall(scene, ROOM_VIEW, since, seed, WALL);
        for (let i = 0; i < scene.px.length; i++) {
          if (!scene.px[i]) continue;
          const d = scene.depth[i];
          // Nothing it paints gives light of its own.
          if (scene.glow[i]) seen.glowing++;
          // The cracks round what is about to go lie a hair over the face.
          if (Math.abs(d) < 1e-3) seen.face++;
          else if (d < 0) seen.room++;
          else if (d <= deep + 1e-6) seen.tops++;
          else seen.past++;
        }
      }
    }
    expect(seen).toMatchObject({ glowing: 0, room: 0, past: 0 });
    expect(seen.face).toBeGreaterThan(0);
    expect(seen.tops).toBeGreaterThan(0);
  });

  it("leaves its gaps for what is beyond it, and what is on it goes with it", () => {
    for (const seed of [4, 5]) {
      const since = 900;
      const scene = raster(SCENE_W, SCENE_H);
      paintWall(scene, ROOM_VIEW, since, seed, WALL);
      const stands = standsAt(since, seed, WALL);
      const ivy = raster(SCENE_W, SCENE_H);
      onWall(rasterPen(ivy), since, seed, WALL).fill(0xff00ff00, 0, 0, SCENE_W, 97);
      let gaps = 0;
      for (let y = 0; y < 97; y++) {
        for (let x = 0; x < SCENE_W; x++) {
          const i = y * SCENE_W + x;
          if (stands(x, y)) continue;
          gaps++;
          expect(near(scene.depth[i], 0)).toBe(false);
          expect(ivy.px[i]).toBe(0);
        }
      }
      expect(gaps).toBeGreaterThan(0);
    }
  });
});

describe("a poke at the wall", () => {
  it("knocks out the block it lands on, and nothing where no block stands to take it", () => {
    for (const seed of [21, 22, 23]) {
      const since = 30;
      // Low on the wall, clear of what hangs there: the foot stands for good.
      const knock = pokeAt(40, 90, since, seed, WALL);
      expect(knock).toMatchObject({ x: 40, y: 90, kind: "block" });
      expect(knock && knock.t).toBeGreaterThan(since);
      const before = ruinOf(specOf(WALL), seed);
      const block = before.bond.owner[90 * SCENE_W + 40];
      expect(before.releaseAt[block]).toBeGreaterThan(since + 1);
      const poked = { ...WALL, knocks: knock ? [knock] : [] };
      expect(ruinOf(specOf(poked), seed).releaseAt[block]).toBe(knock?.t);
      // The window, the clock hung over the wall, the dado below it.
      expect(pokeAt(150, 30, since, seed, WALL)).toBeNull();
      expect(pokeAt(220, 30, since, seed, WALL)).toBeNull();
      expect(pokeAt(40, 120, since, seed, WALL)).toBeNull();
      // Nor through what stands in front of the wall.
      const slab = { ...WALL, fronts: [{ x: 30, y: 32, w: 20, h: 118 }] };
      expect(pokeAt(40, 90, since, seed + 10, slab)).toBeNull();
    }
  });

  it("brings what stood over a poked-out foot down onto the feet, for good, and moves it again", () => {
    const deep = -specOf(WALL).thickness / 2 / PX_M;
    for (const seed of [31, 32, 33]) {
      // The bottom course poked out across three blocks, a second apart.
      let knocks: Knock[] = [];
      let since = 3000;
      for (const x of [56, 72, 88]) {
        const knock = pokeAt(x, 93, since, seed, { ...WALL, knocks });
        if (knock) knocks = [...knocks, knock];
        since++;
      }
      expect(knocks).toHaveLength(3);
      const poked = { ...WALL, knocks };
      const wall = wallIn(seed, poked);
      /** The cells of the foot where something lies in the wall's own depth at `t`. */
      const onFeet = (t: number) => {
        const cells: [number, number][] = [];
        for (let y = 89; y < 97; y++)
          for (let x = 48; x < 104; x++) if (wall.lyingAt(x, y, t)?.z === deep) cells.push([x, y]);
        return cells;
      };
      const settled = onFeet(since + 60);
      expect(settled.length).toBeGreaterThan(100);
      // A day on, it lies there still.
      expect(onFeet(since + 86400).length).toBeGreaterThanOrEqual(settled.length);
      // A poke where a block lies shoves it along the feet.
      const [x, y] = settled[0];
      const knock = pokeAt(x, y, since + 60, seed, poked);
      expect(knock).toMatchObject({ x, y, kind: "block" });
      const shoved = wallIn(seed, { ...WALL, knocks: [...knocks, knock as Knock] });
      const was = wall.lyingAt(x, y, since + 65);
      expect(shoved.lyingAt(x, y, since + 65)?.i).not.toBe(was?.i);
    }
  });
});
