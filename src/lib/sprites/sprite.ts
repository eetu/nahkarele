// Sprites drawn the way dab draws them: `@anarkisti/dab/core` reads the format (the walk an
// assembly is drawn in, a grid's frame as pixels); this keeps each grid's frame as a canvas,
// made once. Edit the JSON files in dab.

import {
  type Flip,
  frameAt,
  layers as walk,
  type Part,
  pixels,
  type SpriteBody,
  type SpriteFile,
} from "@anarkisti/dab/core";

export type { Flip, Part };
export type Body = SpriteBody;
export type Sprite = SpriteFile;

/** Frame index `step` of an animation, looping both ways (a visitor still off the left edge
 *  steps through negative distance). */
export const frameOf = frameAt;

/** One grid of a drawing: which, at which frame, where, mirrored how. */
export type Layer = { key: string; body: Body; frame: number; x: number; y: number; flip?: Flip };

/**
 * What drawing `s` at `frame` puts down, in order, the way dab draws it: for each node, its
 * parts marked `behind`, then its own grid, then the rest. Parts play along: a part shows the
 * frame `s` is drawn at, clamped to its own strip, so the deer's legs walk with the deer.
 */
export const layers = (s: Sprite, frame = 0, flip?: Flip): Layer[] =>
  walk(s, frame, { flip }).map((l) => ({
    key: [s.name, ...l.path].join("/"),
    body: l.body,
    frame: l.frame,
    x: l.x,
    y: l.y,
    flip: l.flip,
  }));

const baked = new Map<string, HTMLCanvasElement>();

/** One grid's frame as a canvas at 1 px per cell, cached per frame/variant/flip. */
const bakeGrid = (key: string, s: Body, frame = 0, variant?: string, flip?: Flip) => {
  const id = `${key}:${frame}:${variant ?? ""}:${flip ?? ""}`;
  const hit = baked.get(id);
  if (hit) return hit;
  const { w, h, px } = pixels(s, frame, { variant, flip });
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const image = new ImageData(new Uint8ClampedArray(px.buffer as ArrayBuffer), w, h);
  canvas.getContext("2d")?.putImageData(image, 0, 0);
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
