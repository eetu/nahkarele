import { describe, expect, it } from "vitest";

import {
  cornersOf,
  DEPTH_SLOPE,
  halfDepth,
  halfHeight,
  intoWall,
  type Phase,
  phasePose,
  poseAt,
  TURN_STEP,
} from "../fall";
import { sinkOf } from "../pile";
import type { Body } from "../rubble";
import { bake, type Ruin } from "../timeline";
import { insertOf, type Knock, type Spec } from "../types";
import { SPEC } from "./spec";

const BUILDS: [string, Spec][] = [
  ["block", SPEC],
  ["brick", { ...SPEC, bond: "brick", course: 4, unit: 10, thickness: 9, brittle: 1.2 }],
  ["rubble", { ...SPEC, bond: "rubble", course: 12, unit: 18, thickness: 20, brittle: 0.25 }],
];
// Knocked out from below, a row of three, at the top with roof brought down, at the edges.
const KNOCKS: Knock[][] = [
  [],
  [100, 110, 120].map((x, k) => ({ t: 20 + k * 0.02, x, y: 80, kind: "block" as const })),
  [
    { t: 20, x: 60, y: 5, kind: "block" },
    { t: 20.5, x: 200, y: 0, kind: "roof" },
  ],
  [
    { t: 20, x: 2, y: 50, kind: "block" },
    { t: 20.1, x: 317, y: 70, kind: "block" },
  ],
];
const ruins = new Map<string, Ruin[]>();
const ruinsOf = (name: string, spec: Spec) => {
  if (!ruins.has(name)) {
    ruins.set(
      name,
      KNOCKS.flatMap((knocks) => [1, 2].map((seed) => bake({ ...spec, knocks }, seed))),
    );
  }
  return ruins.get(name) as Ruin[];
};
const endOf = (b: Body) => (b.out || b.broken ? b.lands : b.settled);
const firstFly = (b: Body) => b.phases.findIndex((p) => p.k === "fly");

describe.each(BUILDS)("what comes off a %s wall", (name, spec) => {
  it("rests on something while it waits in the wall, and falls when that has gone", () => {
    let dropped = 0;
    let unheld = 0;
    for (const r of ruinsOf(name, spec)) {
      const { owner, blocks } = r.bond;
      const W = spec.w;
      const T = spec.thickness;
      const moving = (t: number) => r.bodies.filter((o) => o.start <= t && t < endOf(o));
      for (const b of r.bodies.filter((x) => x.parent === null)) {
        const f = firstFly(b);
        const before = b.phases.slice(0, f);
        if (!before.some((p) => p.k === "ease" && p.a.y !== p.b.y)) continue;
        dropped++;
        // The row it rests on: under it as laid, then wherever it dropped to.
        let R = blocks[b.block].y + blocks[b.block].h;
        let bad = 0;
        before.forEach((ph, k) => {
          if (ph.k === "ease" && ph.a.y !== ph.b.y) {
            if (k > 0 || r.releases.find((x) => x.i === b.block)?.kind !== "topple")
              R = ph.b.y + halfHeight(b.w, b.h, T, 0, ph.b.theta);
            return;
          }
          for (let t = ph.t0 + 1 / 240; t < ph.t1; t += 1 / 120) {
            const p = phasePose(ph, t);
            let held = R >= spec.h;
            for (let x = Math.max(0, Math.floor(p.x - b.w / 2)); x < p.x + b.w / 2 && !held; x++) {
              const o = owner[Math.round(R) * W + x];
              held = o >= 0 && o !== b.block && r.releaseAt[o] > t;
            }
            for (const o of held ? [] : moving(t)) {
              if (o === b) continue;
              const q = poseAt(o.phases, t);
              const top = q.y - halfHeight(o.w, o.h, T, q.phi, q.theta);
              const d = halfDepth(o.h, T, q.phi);
              if (top < R - 4 || top > R + 1.5 || q.z - d >= 0 || q.z + d <= -T) continue;
              if (Math.abs(q.x - p.x) < (o.w + b.w) / 2) held = true;
            }
            if (!held) bad++;
          }
        });
        if (bad > 2) unheld++;
      }
    }
    expect(dropped).toBeGreaterThan(0);
    // A block let go after it is worked out may still move from under it: rarely.
    expect(unheld / dropped).toBeLessThan(0.03);
  });

  it("falls clear of the wall standing below it", () => {
    let worst = 0;
    for (const r of ruinsOf(name, spec)) {
      const { owner } = r.bond;
      const W = spec.w;
      for (const b of r.bodies.filter((x) => x.parent === null)) {
        const fl = b.phases[firstFly(b)];
        const dir = r.releases.find((x) => x.i === b.block)?.dir ?? 1;
        const from = b.oy + b.h;
        for (let t = fl.t0 + 1 / 60; t < fl.t1; t += 1 / 60) {
          const p = phasePose(fl, t);
          const top = (c: number) => {
            if (c < 0 || c >= W) return spec.h;
            for (let row = Math.max(0, Math.floor(from)); row < spec.h; row++) {
              const o = owner[row * W + c];
              if (o >= 0 && o !== b.block && r.releaseAt[o] > t) return row;
            }
            return spec.h;
          };
          const sill = (x: number) =>
            Math.max(top(Math.floor(x - 0.5)), top(Math.floor(x + 0.5))) + 0.5;
          const into = intoWall(cornersOf(b.w, b.h, b.T, p), sill, spec.thickness, dir);
          if (into < spec.thickness + 2) worst = Math.max(worst, into);
        }
      }
    }
    expect(worst).toBeLessThan(1);
  });

  it("topples over the side it overhangs", () => {
    let topples = 0;
    let wrong = 0;
    for (const r of ruinsOf(name, spec)) {
      for (const rel of r.releases.filter((x) => x.kind === "topple")) {
        const laid = r.bond.blocks[rel.i];
        let [L, R] = [Infinity, -Infinity];
        for (const c of laid.bed) {
          // What it rested on: a block, an insert (the window, gone when it falls out), the base.
          const k = insertOf(c.j);
          const at = c.j >= 0 ? r.releaseAt[c.j] : k >= 0 ? r.insertAt[k] : Infinity;
          if (at <= rel.t) continue;
          [L, R] = [Math.min(L, c.a), Math.max(R, c.b)];
        }
        const side = Math.sign(laid.cx - (L + R) / 2);
        const body = r.bodies.find((b) => b.block === rel.i && b.parent === null);
        const tilt = body?.phases[0];
        if (!side || tilt?.k !== "ease") continue;
        topples++;
        if (Math.sign(tilt.b.x - tilt.a.x) !== side) wrong++;
      }
    }
    // Supports let go at the same moment count as gone here, still there to the bake.
    expect(wrong).toBeLessThanOrEqual(topples * 0.1);
  });

  it("never turns back across a step the drawing turns in, at once", () => {
    let flips = 0;
    let all = 0;
    for (const r of ruinsOf(name, spec)) {
      for (const b of r.bodies) {
        const end = endOf(b);
        if (!Number.isFinite(end)) continue;
        all++;
        const steps: number[][] = [];
        for (let t = Math.ceil(b.start * 60) / 60; t <= end; t += 1 / 60) {
          const p = poseAt(b.phases, t);
          steps.push([Math.round(p.phi / TURN_STEP.phi), Math.round(p.theta / TURN_STEP.theta)]);
        }
        const back = [0, 1].some((c) =>
          steps.some(
            (s, i) =>
              i + 1 < steps.length &&
              steps[i + 1][c] !== s[c] &&
              steps.slice(i + 2, i + 7).some((u) => u[c] === s[c]),
          ),
        );
        if (back) flips++;
      }
    }
    expect(flips).toBeLessThanOrEqual(all * 0.001);
  });

  it("lies where nothing else lies, on whole pixels of the drawing", () => {
    for (const r of ruinsOf(name, spec)) {
      const L = r.pile.lying;
      for (let a = 0; a < L.length; a++) {
        for (let c = a + 1; c < L.length; c++) {
          const [p, q] = [L[a], L[c]];
          const ox = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
          const oz = Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0);
          if (ox < 1 || oz < 1) continue;
          const t = Math.max(p.rest, q.rest) + 0.01;
          const [sp, sq] = [sinkOf(r.pile, p, t), sinkOf(r.pile, q, t)];
          const oy = Math.min(p.top - sp, q.top - sq) - Math.max(p.base - sp, q.base - sq);
          expect(oy).toBeLessThan(1);
        }
      }
      for (const b of r.bodies.filter((x) => x.lying)) {
        const last = b.phases[b.phases.length - 1];
        const rest = phasePose(last, last.t1);
        const row = rest.y + DEPTH_SLOPE * rest.z;
        expect(Math.abs(row - Math.round(row))).toBeLessThan(1e-6);
      }
    }
  });

  it("settles without being pulled back to the wall or easing along in the air", () => {
    for (const r of ruinsOf(name, spec)) {
      for (const b of r.bodies.filter((x) => x.lying)) {
        const f = b.parent === null ? firstFly(b) + 1 : 0;
        const after: Phase[] = b.phases.slice(f);
        // Out from where it lands, never back in.
        const zs = after.map((p) => phasePose(p, p.t1).z);
        for (let k = 1; k < zs.length; k++) expect(zs[k]).toBeGreaterThan(zs[k - 1] - 0.5);
        // What it eases along goes no faster down than it would fall.
        for (const p of after) {
          if (p.k !== "ease") continue;
          const down = p.b.y - p.a.y;
          if (down > 2)
            expect(down).toBeLessThanOrEqual(
              0.5 * 392 * (p.t1 - p.t0) ** 2 + 2 + 40 * (p.t1 - p.t0),
            );
        }
      }
    }
  });

  it("is heard once for impacts together", () => {
    for (const r of ruinsOf(name, spec)) {
      for (let a = 0; a < r.cues.length; a++) {
        for (let c = a + 1; c < r.cues.length && r.cues[c].t - r.cues[a].t < 0.06; c++) {
          expect(Math.abs(r.cues[c].x - r.cues[a].x)).toBeGreaterThanOrEqual(32);
        }
      }
    }
  });

  it("breaks some of what lands, however small the build's blocks", () => {
    const broken = ruinsOf(name, spec).reduce(
      (n, r) => n + r.bodies.filter((b) => b.broken).length,
      0,
    );
    expect(broken).toBeGreaterThan(0);
  });
});
