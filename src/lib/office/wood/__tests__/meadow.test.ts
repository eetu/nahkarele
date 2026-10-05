import { describe, expect, it } from "vitest";

import { WALL } from "$lib/office/draw";
import { FLOOR_Y } from "$lib/office/engine";

import { type Flower, FLOWERS, phaseOf, shortest, showing } from "../flowers";
import { flowersAt } from "../meadow";
import { lookAt, SEASON_S, SEASONS_FROM } from "../seasons";

const SUN: Flower[] = ["coltsfoot", "dandelion", "fireweed", "oxeye", "harebell"];
const SHADE: Flower[] = ["anemone", "lily", "sorrel"];

const kinds = (seed: number, since: number) =>
  flowersAt(seed, since).flatMap((f) => (f ? [f.kind] : []));

describe("friday's flowers", () => {
  it("each come up, flower and go in their own part of the year", () => {
    const at = (k: number, p: number) => lookAt(SEASONS_FROM + (k + p) * SEASON_S);
    for (const kind of FLOWERS) {
      // All under the snow in midwinter.
      expect(showing(phaseOf(kind, at(2, 0.6)))).toBe(false);
      // And open some time in the year.
      const open = Array.from({ length: 80 }, (_, i) => phaseOf(kind, at(i / 20, 0)).head);
      expect(open).toContain("open");
    }
  });

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

  it("are the same for the same friday, asked again", () => {
    for (const since of [200, 1500, 5000]) expect(flowersAt(7, since)).toEqual(flowersAt(7, since));
  });

  it("stand tall only where nothing is in front of them", () => {
    const behind = (x: number) => WALL.fronts.some((f) => x >= f.x && x < f.x + f.w);
    for (const seed of [1, 2, 3]) {
      for (const since of [300, 1000, 4000, 20000]) {
        for (const f of flowersAt(seed, since)) {
          // In front of the furniture, a flower must keep below its foot.
          if (f && behind(f.x)) expect(f.y - FLOOR_Y - 1).toBeGreaterThanOrEqual(shortest(f.kind));
        }
      }
    }
  }, 30_000);
});
