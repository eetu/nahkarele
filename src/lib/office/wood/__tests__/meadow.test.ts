import { type FloorKind, isFlower, shortest } from "@anarkisti/korpi/plants";
import { describe, expect, it } from "vitest";

import { ROOM_VIEW } from "$lib/office/depth";
import { WALL } from "$lib/office/draw";
import { FLOOR_Y } from "$lib/office/engine";

import { floorPlantsAt } from "../meadow";

const SUN = ["coltsfoot", "dandelion", "fireweed", "oxeye", "harebell", "raspberry", "juniper"];
const SHADE = ["anemone", "lily", "sorrel", "bilberry"];

const kinds = (seed: number, since: number) => floorPlantsAt(seed, since).map((p) => p.kind.name);

/** Where a plant stands in the room, scene px. */
const sceneOf = (f: { x: number; z: number }) => {
  const at = ROOM_VIEW.project({ x: f.x, y: 0, z: f.z });
  return { x: Math.round(at.sx), y: Math.round(at.sy) };
};

/** The least a kind stands, m. */
const lowest = (kind: FloorKind) =>
  isFlower(kind) ? shortest(kind) : "height" in kind ? (kind.height?.[0] ?? 0.5) : 0.1;

describe("friday's floor", () => {
  it("starts as the open floor's pioneers and gives way to the wood's own as the trees close over", () => {
    let early = 0;
    let late = 0;
    let shaded = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const kind of kinds(seed, 300)) {
        expect(SUN.concat("lilac")).toContain(kind);
        early++;
      }
      for (const kind of kinds(seed, 7000)) {
        late++;
        if (SHADE.includes(kind)) shaded++;
      }
    }
    expect(early).toBeGreaterThan(40);
    expect(shaded / late).toBeGreaterThan(0.6);
  }, 30_000);

  it("brings shrubs up among the flowers", () => {
    const shrubs = [1, 2, 3, 4, 5, 6].flatMap((seed) =>
      [1000, 4000, 9000].flatMap((since) =>
        floorPlantsAt(seed, since).filter((p) => !isFlower(p.kind)),
      ),
    );
    expect(shrubs.length).toBeGreaterThan(5);
  }, 30_000);

  it("comes up on the floor in front of the wall, clear of where the exit sign lands", () => {
    for (const seed of [1, 2, 3]) {
      for (const f of floorPlantsAt(seed, 1500)) {
        const { x, y } = sceneOf(f);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(320);
        expect(y).toBeGreaterThan(FLOOR_Y);
        expect(y).toBeLessThan(180);
        expect(x < 140 || x >= 182).toBe(true);
      }
    }
  });

  it("stands tall only where nothing is in front of it, and never behind the furniture's feet", () => {
    const before = (x: number) => WALL.fronts.filter((f) => x >= f.x && x < f.x + f.w);
    let fronted = 0;
    for (const seed of [1, 2, 3]) {
      for (const since of [300, 1000, 4000, 20000]) {
        for (const f of floorPlantsAt(seed, since)) {
          const { x, y } = sceneOf(f);
          const fronts = before(x);
          if (!fronts.length) continue;
          fronted++;
          for (const front of fronts) expect(y).toBeGreaterThan(front.y + front.h - 1);
          // In front of the furniture, a plant keeps below its foot.
          expect(f.room).toBeLessThanOrEqual((y - FLOOR_Y) / 40);
          expect(lowest(f.kind)).toBeLessThanOrEqual(f.room);
        }
      }
    }
    expect(fronted).toBeGreaterThan(10);
  }, 30_000);
});
