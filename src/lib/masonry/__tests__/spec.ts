import type { Spec } from "../types";

/** A wall like a room's back wall: 320 by 97 px over a dado, a window in it. */
export const SPEC: Spec = {
  w: 320,
  h: 97,
  course: 14,
  unit: 26,
  thickness: 8,
  rough: 1.5,
  ground: 150,
  inserts: [{ name: "window", rect: { x: 122, y: 14, w: 76, h: 50 } }],
  hangs: [],
};
