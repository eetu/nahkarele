// Reader for the dab sprite format (github.com/eetu/dab): rows of characters plus
// the palette they mean, `.` transparent. Edit the JSON files in dab; this only
// draws them.

export type Flip = "h" | "v" | "hv";

export type Sprite = {
  name: string;
  w: number;
  h: number;
  palette: Record<string, string>;
  variants?: Record<string, Record<string, string>>;
  animations?: Record<string, number[]>;
  frames: string[][];
};

const TRANSPARENT = ".";

const cellColour = (s: Sprite, ch: string, variant?: string): string | null => {
  if (ch === TRANSPARENT) return null;
  return (variant && s.variants?.[variant]?.[ch]) || s.palette[ch] || null;
};

const flipRows = (rows: string[], flip?: Flip): string[] => {
  if (!flip) return rows;
  const v = flip === "v" || flip === "hv" ? [...rows].reverse() : rows;
  return flip === "h" || flip === "hv" ? v.map((r) => [...r].reverse().join("")) : v;
};

/** Frame index `step` of an animation, looping. */
export const frameOf = (s: Sprite, animation: string, step: number): number => {
  const run = s.animations?.[animation];
  if (!run?.length) return 0;
  // Wrapped both ways: a visitor still off the left edge steps through negative distance.
  const n = run.length;
  return run[((Math.floor(step) % n) + n) % n];
};

const baked = new Map<string, HTMLCanvasElement>();

/** One frame as a canvas at 1 px per cell, cached per frame/variant/flip. */
export const bake = (s: Sprite, frame = 0, variant?: string, flip?: Flip): HTMLCanvasElement => {
  const key = `${s.name}:${frame}:${variant ?? ""}:${flip ?? ""}`;
  const hit = baked.get(key);
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
  baked.set(key, canvas);
  return canvas;
};

export const drawSprite = (
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  x: number,
  y: number,
  opts: { frame?: number; variant?: string; flip?: Flip } = {},
) => {
  ctx.drawImage(bake(s, opts.frame, opts.variant, opts.flip), Math.round(x), Math.round(y));
};
