// The shapes the masonry module works in. Coordinates are the wall's own: x to the right and y
// down, px, the wall's top-left corner at 0, 0; depth z is toward the viewer, the wall's face
// at 0 and its back at -thickness.

export type Rect = { x: number; y: number; w: number; h: number };

/** Something in or on the wall, by name, where it is. */
export type Named = { name: string; rect: Rect };

/** A wall to lay and bring down. */
export type Spec = {
  /** The wall, px: it stands on a base along its bottom edge, between two abutments. */
  w: number;
  h: number;
  /** A course's height and a block's length, px, and the wall's thickness. */
  course: number;
  unit: number;
  thickness: number;
  /** How far a joint wanders off straight, px. */
  rough: number;
  /** The floor, in wall y: below the base, where what falls comes down. */
  ground: number;
  /** Gravity, px/s² (392 is the real thing at 40 px to the metre). */
  g?: number;
  /** Openings filled by something that carries what is above it while it is in (a window). */
  inserts: Named[];
  /** What hangs on the face (a clock, a sign): it goes with what holds it up. */
  hangs: Named[];
  /** Blows given from outside, in time order: a block knocked out, or roof brought down. */
  knocks?: Knock[];
};

/** A blow at `t`: the block at `x`, `y` knocked out, or the roof brought down at `x`. */
export type Knock = { t: number; x: number; y: number; kind: "block" | "roof" };

/** A contact's other side, when it is not a block. */
export const BASE = -1;
export const ABUT = -2;
/** Insert `k` as a contact's other side, and back. */
export const insertRef = (k: number) => -10 - k;
export const insertOf = (ref: number) => (ref <= -10 ? -10 - ref : -1);

/** A shared edge: the other side `j`, the columns (for a bed) or rows (for a head) it spans,
 *  and how many pixels of edge it is. */
export type Contact = { j: number; a: number; b: number; n: number };

export type Block = {
  i: number;
  /** Its course, counted from the top: 0 is the wall's top course. */
  course: number;
  /** Its box, pixel count and centre of mass (pixel centres). */
  x: number;
  y: number;
  w: number;
  h: number;
  n: number;
  cx: number;
  cy: number;
  /** Its pixels, as `y * spec.w + x`. */
  px: Int32Array;
  /** What it rests on, what rests on it, its neighbours in the course (blocks, an insert, an
   *  abutment), and the inserts sitting on it. */
  bed: Contact[];
  top: Contact[];
  heads: Contact[];
  caps: Contact[];
};

/** A laid wall: which block each pixel is (-1 in an opening), the blocks, and each course's
 *  rows as laid, top to bottom (`edges[c]` to `edges[c + 1]`). */
export type Bond = {
  spec: Spec;
  owner: Int16Array;
  blocks: Block[];
  edges: number[];
};
