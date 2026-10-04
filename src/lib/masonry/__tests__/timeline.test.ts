import { describe, expect, it } from "vitest";

import { forget, hanging, releasedBy, ruinOf } from "../query";
import { bake } from "../timeline";
import { BASE, insertOf } from "../types";
import { SPEC } from "./spec";

const HOUR = 3600;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe("the ruin over time", () => {
  it("never leaves a block standing on nothing", () => {
    for (const seed of SEEDS) {
      const r = ruinOf(SPEC, seed);
      for (let k = 0; k < 40; k++) expect(hanging(r, k * k * 30)).toBe(0);
    }
  });

  it("brings a block down within a second of losing its last support", () => {
    for (const seed of SEEDS) {
      const r = bake(SPEC, seed);
      for (const b of r.bond.blocks) {
        const lost = Math.max(
          ...b.bed.map((c) => {
            if (c.j === BASE) return Infinity;
            const k = insertOf(c.j);
            return k >= 0 ? r.insertAt[k] : r.releaseAt[c.j];
          }),
        );
        if (Number.isFinite(lost)) expect(r.releaseAt[b.i]).toBeLessThanOrEqual(lost + 1);
      }
      // Nothing drops before what it rested on has gone.
      for (const rel of r.releases.filter((x) => x.kind === "drop")) {
        for (const c of r.bond.blocks[rel.i].bed) {
          if (c.j >= 0) expect(r.releaseAt[c.j]).toBeLessThanOrEqual(rel.t);
        }
      }
    }
  });

  it("wears like a ruin: the top goes first, the foot stays", () => {
    let topGone = 0;
    let top = 0;
    let footStands = 0;
    let foot = 0;
    for (const seed of SEEDS) {
      const r = bake(SPEC, seed);
      const nc = r.bond.edges.length - 1;
      for (const b of r.bond.blocks) {
        if (b.course === 0) {
          top++;
          if (r.releaseAt[b.i] <= 3 * HOUR) topGone++;
        }
        if (b.course === nc - 1) {
          foot++;
          if (r.releaseAt[b.i] > 10 * HOUR) footStands++;
        }
      }
      expect(r.releaseAt.some((t) => t === Infinity)).toBe(true);
      expect(releasedBy(r, 60)).toBeGreaterThanOrEqual(3);
    }
    expect(topGone / top).toBeGreaterThanOrEqual(0.6);
    expect(footStands / foot).toBeGreaterThanOrEqual(0.5);
  });

  it("lets hung things go with the wall behind them, never later", () => {
    const spec = {
      ...SPEC,
      hangs: [
        { name: "clock", rect: { x: 212, y: 22, w: 44, h: 20 } },
        { name: "sign", rect: { x: 61, y: 4, w: 13, h: 10 } },
      ],
    };
    for (const seed of SEEDS) {
      const r = bake(spec, seed);
      for (const { name, rect } of spec.hangs) {
        const above = r.bond.owner[(rect.y - 3) * spec.w + Math.round(rect.x + rect.w / 2)];
        if (above >= 0) expect(r.hangAt[name]).toBeLessThanOrEqual(r.releaseAt[above] + 0.2);
      }
    }
  });

  it("bakes the same ruin twice, however it is asked", () => {
    const a = bake(SPEC, 9);
    forget();
    const b = bake(SPEC, 9);
    expect(a.releases).toEqual(b.releases);
    const r = ruinOf(SPEC, 9);
    const times = [5000, 10, 900, 20000, 10, 5000];
    const counts = times.map((t) => releasedBy(r, t));
    expect(counts[1]).toBe(counts[4]);
    expect(counts[0]).toBe(counts[5]);
  });
});

describe("other builds and the plaster", () => {
  const brick = { ...SPEC, bond: "brick" as const, course: 4, unit: 10, thickness: 9 };
  const rubble = { ...SPEC, bond: "rubble" as const, course: 12, unit: 18, thickness: 20 };

  it("never leaves a brick chunk or a stone standing on nothing", () => {
    for (const spec of [brick, rubble]) {
      for (const seed of [1, 2, 3]) {
        const r = bake(spec, seed);
        for (let k = 0; k < 30; k++) expect(hanging(r, k * k * 40)).toBe(0);
      }
    }
  });

  it("lets the plaster go in patches, sooner up the wall, all of it in the end", () => {
    const r = bake({ ...brick, plaster: true }, 4);
    const skin = r.skin;
    if (!skin) throw new Error("no plaster");
    const share = (t: number) => {
      const left = Array.from(skin.lost).filter((l) => l > t).length;
      return left / skin.lost.length;
    };
    expect(share(0)).toBe(1);
    expect(share(3 * HOUR)).toBeLessThan(share(HOUR));
    expect(share(1e7)).toBe(0);
    expect(bake(SPEC, 4).skin).toBeNull();
  });
});
