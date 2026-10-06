import { type Flower, shortest } from "@anarkisti/korpi/plants";
import { describe, expect, it } from "vitest";

import { ROOM_VIEW } from "$lib/office/depth";
import { WALL } from "$lib/office/draw";
import { FLOOR_Y } from "$lib/office/engine";

import { flowersAt } from "../meadow";

const SUN: Flower[] = ["coltsfoot", "dandelion", "fireweed", "oxeye", "harebell"];
const SHADE: Flower[] = ["anemone", "lily", "sorrel"];

const kinds = (seed: number, since: number) =>
  flowersAt(seed, since).flatMap((f) => (f ? [f.kind] : []));

/** Where a flower stands in the room, scene px. */
const sceneOf = (f: { x: number; z: number }) => {
  const at = ROOM_VIEW.project({ x: f.x, y: 0, z: f.z });
  return { x: Math.round(at.sx), y: Math.round(at.sy) };
};

describe("friday's flowers", () => {
  it("start as the open floor's pioneers and give way to the wood's own as the trees close over", () => {
    let early = 0;
    let late = 0;
    let shaded = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const kind of kinds(seed, 300)) {
        expect(SUN).toContain(kind);
        early++;
      }
      for (const kind of kinds(seed, 7000)) {
        late++;
        if (SHADE.includes(kind)) shaded++;
      }
    }
    expect(early).toBeGreaterThan(60);
    expect(shaded / late).toBeGreaterThan(0.7);
  }, 30_000);

  it("come up on the floor in front of the wall", () => {
    for (const f of flowersAt(1, 1500)) {
      if (!f) continue;
      const { x, y } = sceneOf(f);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(320);
      expect(y).toBeGreaterThan(FLOOR_Y);
      expect(y).toBeLessThan(180);
    }
  });

  it("stand tall only where nothing is in front of them", () => {
    const behind = (x: number) => WALL.fronts.some((f) => x >= f.x && x < f.x + f.w);
    let fronted = 0;
    for (const seed of [1, 2, 3]) {
      for (const since of [300, 1000, 4000, 20000]) {
        for (const f of flowersAt(seed, since)) {
          if (!f) continue;
          const { x, y } = sceneOf(f);
          // In front of the furniture, a flower must keep below its foot.
          if (!behind(x)) continue;
          fronted++;
          expect((y - FLOOR_Y - 1) / 40).toBeGreaterThanOrEqual(shortest(f.kind));
        }
      }
    }
    expect(fronted).toBeGreaterThan(10);
  }, 30_000);
});
