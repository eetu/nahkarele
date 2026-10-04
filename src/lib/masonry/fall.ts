// How a block moves once it leaves the wall, in closed form, phase by phase. Out of the wall
// it tips about an edge (the front one to fall into the room, the back one to fall outside)
// and leaves that edge turning; in the air it flies with a constant spin; landing, it hops
// once and settles flat where the rubble lets it lie. A block with nothing under it first
// drops in the wall's plane onto what still stands below (the sill) and tips off that; one
// that topples tilts over the edge of its bed first; one held from above slides out from
// under its load. Any moment of any phase is a formula: the poses are read, never stepped.

/** Where a body is and how it is turned: its centre in wall px (y down, z toward the viewer),
 *  `phi` out of the wall's plane (top toward the viewer positive), `theta` in it. */
export type Pose = { x: number; y: number; z: number; phi: number; theta: number };

/** How the drawing shows a body, which motion near rest keeps to: it turns in steps (out of
 *  the plane, in it), and a px of depth toward the viewer draws this far down the picture. A
 *  settling body never turns back across a step within a moment of crossing it (seen as a
 *  flicker), and comes to rest on whole pixels. */
export const TURN_STEP = { phi: Math.PI / 8, theta: Math.PI / 16 };
export const DEPTH_SLOPE = 0.25;

export type Phase =
  /** From pose `a` to pose `b`, eased: `p` 2 speeds up, 0.5 slows down, 1 is even. */
  | { k: "ease"; t0: number; t1: number; a: Pose; b: Pose; p: number }
  /** Turning about a horizontal edge at `py`, `pz`, from upright to `phi1`, speeding up:
   *  phi = alpha t^2 / 2. `ry`, `rz` is the centre from the edge, upright; `dir` the side. */
  | {
      k: "pivot";
      t0: number;
      t1: number;
      x: number;
      theta: number;
      py: number;
      pz: number;
      ry: number;
      rz: number;
      alpha: number;
      dir: 1 | -1;
    }
  /** Flying: from pose `c` with velocity `v`, spinning `omega` out of the plane and `spin`
   *  in it, falling at `g`. */
  | {
      k: "fly";
      t0: number;
      t1: number;
      c: Pose;
      v: { x: number; y: number; z: number };
      omega: number;
      spin: number;
      g: number;
    };

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** The centre of a block turned `phi` about an edge, `r` from the edge when upright. */
const turned = (py: number, pz: number, ry: number, rz: number, phi: number, dir: 1 | -1) => {
  // In (depth, height) with height up, the top turning toward `dir`.
  const z = rz * dir;
  const u = -ry;
  const z2 = z * Math.cos(phi) + u * Math.sin(phi);
  const u2 = -z * Math.sin(phi) + u * Math.cos(phi);
  return { y: py - u2, z: pz + z2 * dir };
};

/** The pose phase `ph` gives at `t` (clamped to the phase). */
export const phasePose = (ph: Phase, t: number): Pose => {
  const tau = Math.min(Math.max(0, t - ph.t0), ph.t1 - ph.t0);
  if (ph.k === "ease") {
    const u0 = ph.t1 > ph.t0 ? tau / (ph.t1 - ph.t0) : 1;
    const u = ph.p === 2 ? u0 * u0 : ph.p === 0.5 ? 1 - (1 - u0) * (1 - u0) : u0;
    return {
      x: lerp(ph.a.x, ph.b.x, u),
      y: lerp(ph.a.y, ph.b.y, u),
      z: lerp(ph.a.z, ph.b.z, u),
      phi: lerp(ph.a.phi, ph.b.phi, u),
      theta: lerp(ph.a.theta, ph.b.theta, u),
    };
  }
  if (ph.k === "pivot") {
    const phi = 0.5 * ph.alpha * tau * tau;
    const c = turned(ph.py, ph.pz, ph.ry, ph.rz, phi, ph.dir);
    return { x: ph.x, y: c.y, z: c.z, phi: phi * ph.dir, theta: ph.theta };
  }
  return {
    x: ph.c.x + ph.v.x * tau,
    y: ph.c.y + ph.v.y * tau + 0.5 * ph.g * tau * tau,
    z: ph.c.z + ph.v.z * tau,
    phi: ph.c.phi + ph.omega * tau,
    theta: ph.c.theta + ph.spin * tau,
  };
};

/** The pose a list of phases gives at `t`: before the first, its start; after the last, its
 *  end. */
export const poseAt = (phases: Phase[], t: number): Pose => {
  let k = 0;
  while (k + 1 < phases.length && t >= phases[k + 1].t0) k++;
  return phasePose(phases[k], t);
};

/** The velocity at the end of a phase, px/s, by a short difference. */
export const velocityAt = (ph: Phase) => {
  const a = phasePose(ph, ph.t1 - 1e-3);
  const b = phasePose(ph, ph.t1);
  return {
    x: (b.x - a.x) / 1e-3,
    y: (b.y - a.y) / 1e-3,
    z: (b.z - a.z) / 1e-3,
    phi: (b.phi - a.phi) / 1e-3,
  };
};

/** A point of a body, `x`, `y`, `z` from its centre as it lies in the wall, turned as the body
 *  is turned: `phi` out of the plane (top toward the viewer), then `theta` in it. */
export const turnPoint = (x: number, y: number, z: number, phi: number, theta: number) => {
  const [cf, sf] = [Math.cos(phi), Math.sin(phi)];
  const [ct, st] = [Math.cos(theta), Math.sin(theta)];
  const y1 = y * cf + z * sf;
  return { x: x * ct - y1 * st, y: x * st + y1 * ct, z: -y * sf + z * cf };
};

/** Half a block's extent up and down, and in depth, turned `phi` out of the plane and
 *  `theta` in it: `w` along the wall, `h` up it, `T` through it. */
export const halfHeight = (w: number, h: number, T: number, phi: number, theta: number) =>
  0.5 *
  (Math.abs(w * Math.sin(theta)) +
    (Math.abs(h * Math.cos(phi)) + Math.abs(T * Math.sin(phi))) * Math.abs(Math.cos(theta)));
export const halfDepth = (h: number, T: number, phi: number) =>
  0.5 * (Math.abs(h * Math.sin(phi)) + Math.abs(T * Math.cos(phi)));

/** The eight corners of a box `w` by `h` by `T` at pose `p`. */
export const cornersOf = (w: number, h: number, T: number, p: Pose) => {
  const [cf, sf] = [Math.cos(p.phi), Math.sin(p.phi)];
  const [ct, st] = [Math.cos(p.theta), Math.sin(p.theta)];
  const out: { x: number; y: number; z: number }[] = [];
  for (const x of [-w / 2, w / 2]) {
    for (const y of [-h / 2, h / 2]) {
      for (const z of [-T / 2, T / 2]) {
        const y1 = y * cf + z * sf;
        out.push({
          x: p.x + x * ct - y1 * st,
          y: p.y + x * st + y1 * ct,
          z: p.z - y * sf + z * cf,
        });
      }
    }
  }
  return out;
};
/** The box's twelve edges, as pairs of corners from `cornersOf`. */
export const BOX_EDGES: [number, number][] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/** How far a box with corners `c` reaches into the wall standing below row `sill(x)` in each
 *  column, `T` deep behind its face, for a body leaving toward `dir` (1 the room, -1
 *  outside): negative, how far it is clear of it; -Infinity if none of it is level with any.
 *  Its corners and points along its edges stand for the box. */
export const intoWall = (
  c: { x: number; y: number; z: number }[],
  sill: (x: number) => number,
  T: number,
  dir: number,
) => {
  let worst = -Infinity;
  const take = (x: number, y: number, z: number) => {
    if (y > sill(x)) worst = Math.max(worst, dir > 0 ? -z : z + T);
  };
  for (const q of c) take(q.x, q.y, q.z);
  for (const [i, j] of BOX_EDGES) {
    const [a, b] = [c[i], c[j]];
    for (const u of [0.25, 0.5, 0.75]) {
      take(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
    }
  }
  return worst;
};

/** How a pivot about the edge at `py`, `pz` runs for a block whose centre is `ry`, `rz` from
 *  that edge: it leaves the edge a little after its centre has passed over it (at once, if it
 *  already has), turning so that it will have turned about `land` rad by the time it falls the
 *  `drop` px to the ground. */
export const pivotOf = (
  t0: number,
  x: number,
  py: number,
  pz: number,
  ry: number,
  rz: number,
  dir: 1 | -1,
  drop: number,
  land: number,
  g: number,
  kick = 1,
): Phase => {
  const leave = Math.max(0, Math.atan2(-rz * dir, -ry)) + 0.15;
  const fall = Math.sqrt((2 * Math.max(4, drop)) / g);
  const omega = Math.min(6, Math.max(1.5, ((land - leave) / fall) * kick));
  const alpha = (omega * omega) / (2 * leave);
  return { k: "pivot", t0, t1: t0 + omega / alpha, x, theta: 0, py, pz, ry, rz, alpha, dir };
};
