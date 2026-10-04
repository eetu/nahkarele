import { describe, expect, it } from "vitest";

import { phasePose, poseAt } from "../fall";
import { sinkOf } from "../pile";
import { cuesBetween, forget, lying, moving, ruinOf } from "../query";
import { bake } from "../timeline";
import { SPEC } from "./spec";

const SEEDS = [1, 2, 3, 4, 5, 6];

describe("what comes off the wall", () => {
  it("moves without jumps from phase to phase", () => {
    for (const seed of SEEDS) {
      for (const body of bake(SPEC, seed).bodies) {
        for (let k = 0; k + 1 < body.phases.length; k++) {
          const a = phasePose(body.phases[k], body.phases[k].t1);
          const b = phasePose(body.phases[k + 1], body.phases[k + 1].t0);
          expect(Math.abs(a.x - b.x)).toBeLessThan(2);
          expect(Math.abs(a.y - b.y)).toBeLessThan(2);
          expect(Math.abs(a.z - b.z)).toBeLessThan(2);
          expect(Math.abs(a.phi - b.phi)).toBeLessThan(0.25);
        }
      }
    }
  });

  it("tips a slab off the top turning, and lands it turned a good way over", () => {
    for (const seed of SEEDS) {
      const r = bake(SPEC, seed);
      for (const body of r.bodies.filter((b) => b.parent === null)) {
        const rel = r.releases.find((x) => x.i === body.block);
        if (rel?.kind !== "weather" && rel?.kind !== "knock") continue;
        // A piece deeper than it is tall slides out instead.
        if (body.T >= body.h * 0.9) continue;
        if (!body.phases.some((p) => p.k === "fly")) throw new Error("no flight");
        // As it lands: a flight may be knocked into another by a piece it meets in the air.
        const phi = Math.abs(poseAt(body.phases, body.lands).phi);
        // Worked loose, 100 to 150 degrees or so; knocked off, it may spin on further.
        expect(phi).toBeGreaterThan(1.2);
        expect(phi).toBeLessThan(rel.kind === "knock" ? 3.8 : 3.2);
      }
    }
  });

  it("lands what falls outside out of the heap, and everything else on it", () => {
    for (const seed of SEEDS) {
      const r = bake(SPEC, seed);
      expect(r.bodies.filter((b) => b.parent === null).length).toBe(r.releases.length);
      expect(r.bodies.some((b) => b.out)).toBe(true);
      for (const b of r.bodies) {
        expect(b.lying === null).toBe(b.out || b.broken);
        if (b.lying) expect(b.settled).toBeGreaterThanOrEqual(b.lands);
      }
    }
  });

  it("never leaves a piece floating over what it lay on, however far that has sunk", () => {
    for (const seed of SEEDS) {
      const { pile } = bake(SPEC, seed);
      for (const t of [100, 1000, 3000, 8000, 20000, 60000]) {
        for (const l of pile.lying) {
          if (l.rest > t) continue;
          const bottom = l.base - sinkOf(pile, l, t);
          const held = l.under.length
            ? Math.max(
                ...l.under.map((u) => {
                  const below = pile.byId.get(u.id);
                  return below ? below.top - sinkOf(pile, below, t) : 0;
                }),
              )
            : 0;
          expect(bottom).toBeLessThanOrEqual(held + 0.5);
        }
      }
    }
  });

  it("draws every body in flight, every frame", () => {
    // Pieces of a broken block set off when it lands; read in order, none may be skipped.
    for (const seed of SEEDS) {
      const r = bake(SPEC, seed);
      const ends = (b: (typeof r.bodies)[number]) => (b.out || b.broken ? b.lands : b.settled);
      for (const rel of r.releases.slice(0, 40)) {
        for (let k = 0; k < 30; k++) {
          const t = rel.t + k / 15;
          const flying = r.bodies.filter((b) => b.start <= t && t < ends(b)).map((b) => b.id);
          expect(
            moving(r, t)
              .map((m) => m.body.id)
              .sort((x, y) => x - y),
          ).toEqual(flying.sort((x, y) => x - y));
        }
      }
    }
  });

  it("is all in motion or at rest at any moment, read either way", () => {
    const r = ruinOf(SPEC, 3);
    const ask = (t: number) => ({
      moving: moving(r, t).map((m) => m.body.id),
      lying: lying(r, t).map((l) => l.body.id),
    });
    const times = [2, 600, 1.5, 3600, 2, 600];
    const answers = times.map(ask);
    expect(answers[0]).toEqual(answers[4]);
    expect(answers[1]).toEqual(answers[5]);
    forget();
    expect(ask(600)).toEqual(answers[1]);
    // Thuds split across windows add up to the thuds over the whole span.
    const whole = cuesBetween(r, 0, 4000);
    const parts = [0, 1.7, 2.3, 900, 4000].flatMap((a, k, all) =>
      k ? cuesBetween(r, all[k - 1], a) : [],
    );
    expect(parts).toEqual(whole);
  });
});
