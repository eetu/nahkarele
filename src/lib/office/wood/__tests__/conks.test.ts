import { describe, expect, it } from "vitest";

import { conksOn, type ConkTime } from "../conks";
import { archOf, lifespanOf, planAt } from "../growth";
import type { Part } from "../posed";
import { paintTreeParts, SPECIES } from "../trees";

const ROOT = { x: 130, y: 153 };
const SUMMER = 0.2;

const treeOf = (species: (typeof SPECIES)[number], seed: number) => {
  const died = Math.round(lifespanOf(species, 0.5));
  return { arch: archOf(seed, ROOT, species, died + 2), died };
};
const at = (age: number, died: number, phase = SUMMER): ConkTime => ({
  age,
  died,
  year: Math.floor(age),
  phase,
  snow: 0,
});

describe("conks", () => {
  it("come only late in a tree's life", () => {
    let late = 0;
    for (const species of SPECIES) {
      for (let seed = 1; seed <= 8; seed++) {
        const { arch, died } = treeOf(species, seed);
        for (const phase of [0, 0.2, 0.4, 0.6, 0.8]) {
          const young = died * 0.45;
          expect(conksOn(arch, planAt(arch, young), at(young, died, phase))).toEqual([]);
        }
        late += conksOn(arch, planAt(arch, died - 0.3), at(died - 0.3, died)).length;
      }
    }
    // Most kinds bear some, near the end.
    expect(late).toBeGreaterThan(40);
  });

  it("are the same however often and in whatever order they are asked", () => {
    for (const species of SPECIES) {
      const { arch, died } = treeOf(species, 3);
      const times = [died - 2, died + 0.5, died - 0.5, died + 0.9].map((age) => at(age, died));
      const ask = (time: ConkTime) => conksOn(arch, planAt(arch, Math.min(time.age, died)), time);
      const first = times.map(ask);
      const again = [...times].reverse().map(ask).reverse();
      expect(again).toEqual(first);
    }
  });

  it("grow on wood thick enough to hold them, a perennial wider year by year", () => {
    const { arch, died } = treeOf("spruce", 3);
    const plan = planAt(arch, died);
    const reach = (age: number) => conksOn(arch, plan, at(age, died)).map((c) => c.reach);
    const before = reach(died - 3);
    const after = reach(died);
    expect(before.length).toBeGreaterThan(0);
    after.slice(0, before.length).forEach((r, i) => expect(r).toBeGreaterThanOrEqual(before[i]));
    for (const c of conksOn(arch, plan, at(died, died))) {
      expect(plan.limbs[c.piece].w).toBeGreaterThanOrEqual(3);
    }
  });

  it("come and go with the season if they are annual, and stay if not", () => {
    // An oak that bears a sulphur shelf: there in summer, gone by winter.
    const oaks = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => treeOf("oak", seed));
    const with_ = oaks.find(({ arch, died }) =>
      conksOn(arch, planAt(arch, died), at(died + 0.18, died, 0.18)).some(
        (c) => c.kind === "sulphur",
      ),
    );
    expect(with_).toBeDefined();
    const { arch, died } = with_!;
    const kinds = (phase: number) =>
      conksOn(arch, planAt(arch, died), at(died + phase, died, phase)).map((c) => c.kind);
    expect(kinds(0.18)).toContain("sulphur");
    expect(kinds(0.7)).not.toContain("sulphur");
    // A spruce's red-belted conks stay through the winter.
    const spruce = treeOf("spruce", 3);
    const winter = conksOn(
      spruce.arch,
      planAt(spruce.arch, spruce.died),
      at(spruce.died + 0.7, spruce.died, 0.7),
    );
    expect(winter.some((c) => c.kind === "redbelt")).toBe(true);
  });

  it("ride the piece of wood they grow on", () => {
    const { arch, died } = treeOf("birch", 3);
    const plan = planAt(arch, died);
    const conks = conksOn(arch, plan, at(died, died));
    expect(conks.length).toBeGreaterThan(0);
    // Paint it, keeping which part each pixel was painted under.
    const parts: Part[] = [];
    const pixels: number[] = [];
    const ctx = {
      set fillStyle(_: string) {},
      fillRect(_x: number, _y: number, w: number, h: number) {
        pixels[parts.length - 1] = (pixels[parts.length - 1] ?? 0) + w * h;
      },
    } as unknown as CanvasRenderingContext2D;
    paintTreeParts(ctx, plan, 1, { k: 0, p: 0.5, leaves: 1, snow: 0 }, (p) => parts.push(p), conks);
    // After the wood, a part for each conk: its own piece of wood, so the pose moves its pixels
    // with that piece.
    const wood = plan.limbs.length;
    conks.forEach((c, j) => {
      const p = parts[wood + j];
      expect(p).toMatchObject({ kind: "wood", i: c.piece });
      expect(pixels[wood + j]).toBeGreaterThan(0);
    });
  });
});
