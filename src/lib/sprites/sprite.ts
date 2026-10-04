// Reader for the dab sprite format (github.com/eetu/dab): rows of characters plus
// the palette they mean, `.` transparent. Edit the JSON files in dab; this only
// draws them.

export type Flip = "h" | "v" | "hv";

/** A grid and what colours it — what a sprite and a part share. */
export type Body = {
  w: number;
  h: number;
  palette: Record<string, string>;
  variants?: Record<string, Record<string, string>>;
  animations?: Record<string, number[]>;
  frames: string[][];
  parts?: Part[];
};

/**
 * A piece placed on its parent, at (x, y) in the parent's pixels: a leg on a
 * deer. Drawn before the parent's own grid when `behind`. A part that `use`s
 * another sprite by name is not drawn here — nothing in this game borrows one.
 */
export type Part = { name: string; x: number; y: number; behind?: boolean; flip?: Flip } & (
  Body | { use: string }
);

export type Sprite = Body & { name: string };

const TRANSPARENT = ".";

const cellColour = (s: Body, ch: string, variant?: string): string | null => {
  if (ch === TRANSPARENT) return null;
  return (variant && s.variants?.[variant]?.[ch]) || s.palette[ch] || null;
};

const flipRows = (rows: string[], flip?: Flip): string[] => {
  if (!flip) return rows;
  const v = flip === "v" || flip === "hv" ? [...rows].reverse() : rows;
  return flip === "h" || flip === "hv" ? v.map((r) => [...r].reverse().join("")) : v;
};

/** Two mirrorings in a row: an axis mirrored twice is not mirrored. */
const compose = (a?: Flip, b?: Flip): Flip | undefined => {
  const h = (a?.includes("h") ?? false) !== (b?.includes("h") ?? false);
  const v = (a?.includes("v") ?? false) !== (b?.includes("v") ?? false);
  return h && v ? "hv" : h ? "h" : v ? "v" : undefined;
};

/** Frame index `step` of an animation, looping. */
export const frameOf = (s: Body, animation: string, step: number): number => {
  const run = s.animations?.[animation];
  if (!run?.length) return 0;
  // Wrapped both ways: a visitor still off the left edge steps through negative distance.
  const n = run.length;
  return run[((Math.floor(step) % n) + n) % n];
};

/** One grid of a drawing: which, at which frame, where, mirrored how. */
export type Layer = { key: string; body: Body; frame: number; x: number; y: number; flip?: Flip };

/**
 * What drawing `s` at `frame` puts down, in order, the way dab draws it: for
 * each node, its parts marked `behind`, then its own grid, then the rest.
 *
 * Parts play along: a part shows the frame `s` is drawn at, clamped to its own
 * strip. A part lifted out of a drawing in dab has the drawing's frames, so it
 * lands exactly where it was — the deer's legs walk with the deer.
 */
export function layers(s: Sprite, frame = 0, flip?: Flip): Layer[] {
  const out: Layer[] = [];
  const walk = (key: string, body: Body, x: number, y: number, mirror?: Flip) => {
    const own = Math.max(0, Math.min(frame, body.frames.length - 1));
    const parts = (body.parts ?? []).filter((p): p is Part & Body => !("use" in p));
    const place = (p: Part & Body) => {
      // Mirroring the parent moves its parts to the mirrored place, and
      // mirrors them too.
      const px = mirror?.includes("h") ? body.w - p.x - p.w : p.x;
      const py = mirror?.includes("v") ? body.h - p.y - p.h : p.y;
      walk(`${key}/${p.name}`, p, x + px, y + py, compose(mirror, p.flip));
    };
    for (const p of parts) if (p.behind) place(p);
    out.push({ key, body, frame: own, x, y, flip: mirror });
    for (const p of parts) if (!p.behind) place(p);
  };
  walk(s.name, s, 0, 0, flip);
  return out;
}

const baked = new Map<string, HTMLCanvasElement>();

/** One grid's frame as a canvas at 1 px per cell, cached per frame/variant/flip. */
const bakeGrid = (key: string, s: Body, frame = 0, variant?: string, flip?: Flip) => {
  const id = `${key}:${frame}:${variant ?? ""}:${flip ?? ""}`;
  const hit = baked.get(id);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = s.w;
  canvas.height = s.h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    flipRows(s.frames[frame] ?? s.frames[0], flip).forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const colour = cellColour(s, ch, variant);
        if (!colour) return;
        ctx.fillStyle = colour;
        ctx.fillRect(x, y, 1, 1);
      });
    });
  }
  baked.set(id, canvas);
  return canvas;
};

/** A sprite's own grid at one frame, without its parts. */
export const bake = (s: Sprite, frame = 0, variant?: string, flip?: Flip): HTMLCanvasElement =>
  bakeGrid(s.name, s, frame, variant, flip);

/** A sprite and its parts. `variant` is matched by name at every part, as dab does. */
export const drawSprite = (
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  x: number,
  y: number,
  opts: { frame?: number; variant?: string; flip?: Flip } = {},
) => {
  for (const l of layers(s, opts.frame ?? 0, opts.flip)) {
    ctx.drawImage(
      bakeGrid(l.key, l.body, l.frame, opts.variant, l.flip),
      Math.round(x + l.x),
      Math.round(y + l.y),
    );
  }
};
