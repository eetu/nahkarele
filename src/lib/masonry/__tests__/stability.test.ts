import { describe, expect, it } from "vitest";

import { layBond } from "../bond";
import { stream } from "../rand";
import { classify, gapsOf, settle, type State } from "../stability";
import { BASE, type Bond, insertOf } from "../types";
import { SPEC } from "./spec";

const intact = (bond: Bond): State => ({
  standing: new Uint8Array(bond.blocks.length).fill(1),
  inserts: new Uint8Array(bond.spec.inserts.length).fill(1),
});

/** Two neighbours in `course`, both whole and clear of the window and the wall's ends. */
const pairIn = (bond: Bond, course: number) => {
  const row = bond.blocks
    .filter((b) => b.course === course && b.w >= 20 && b.x > 20 && b.x + b.w < 115)
    .sort((a, b) => a.x - b.x);
  for (let k = 0; k + 1 < row.length; k++) {
    if (row[k].heads.some((c) => c.j === row[k + 1].i)) return [row[k], row[k + 1]];
  }
  throw new Error("no pair");
};

/** Every standing block rests, through standing blocks, on the base or an insert still in. */
const grounded = (bond: Bond, state: State) => {
  const ok = new Map<number, boolean>();
  const reaches = (i: number): boolean => {
    if (ok.has(i)) return ok.get(i) as boolean;
    const r = bond.blocks[i].bed.some((c) => {
      if (c.j === BASE) return true;
      const k = insertOf(c.j);
      if (k >= 0) return state.inserts[k] === 1;
      return c.j >= 0 && state.standing[c.j] === 1 && reaches(c.j);
    });
    ok.set(i, r);
    return r;
  };
  return bond.blocks.every((b) => !state.standing[b.i] || reaches(b.i));
};

describe("what stands", () => {
  it("leaves a whole wall standing", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const bond = layBond(SPEC, seed);
      expect(settle(bond, intact(bond)).waves).toEqual([]);
    }
  });

  it("drops only the triangle over a gap low in the wall, and arches over it", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const bond = layBond(SPEC, seed);
      const state = intact(bond);
      const pair = pairIn(bond, 5);
      for (const b of pair) state.standing[b.i] = 0;
      const { standing } = settle(bond, state);
      const fell = bond.blocks.filter((b) => !standing[b.i]);
      // Two blocks wide, the triangle closes within two courses: nothing above it goes.
      for (const b of fell) expect(b.course).toBeGreaterThanOrEqual(4);
      expect(fell.length).toBeLessThanOrEqual(5);
      const after = { standing, inserts: state.inserts };
      expect(gapsOf(bond, after).gaps.every((g) => g.arched)).toBe(true);
      expect(classify(bond, after).filter((c) => c === "pinned").length).toBeGreaterThan(0);
    }
  });

  it("does not arch over a gap at the top: nothing there is pinned", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const bond = layBond(SPEC, seed);
      const state = intact(bond);
      for (const b of pairIn(bond, 1)) state.standing[b.i] = 0;
      const { standing } = settle(bond, state, 0);
      const after = { standing, inserts: state.inserts };
      expect(gapsOf(bond, after).gaps.some((g) => g.arched)).toBe(false);
      expect(classify(bond, after, 0).includes("pinned")).toBe(false);
    }
  });

  it("never leaves a block standing on nothing", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const bond = layBond(SPEC, seed);
      const rand = stream(seed * 7);
      const state = intact(bond);
      for (let k = 0; k < 4 + Math.floor(rand() * 20); k++) {
        state.standing[Math.floor(rand() * bond.blocks.length)] = 0;
      }
      if (rand() < 0.3) state.inserts[0] = 0;
      const { standing } = settle(bond, state);
      expect(grounded(bond, { standing, inserts: state.inserts })).toBe(true);
    }
  });
});
