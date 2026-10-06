// The rooms paint through korpi pens (`@anarkisti/korpi/paint`): whole pixels at a depth, into
// one scene raster. Their palettes are CSS hex, and `mix` makes more of it, so this keeps each
// colour's packed word.

import { lru, rgb, type Rgba, rgba } from "@anarkisti/korpi/core";
import type { Pen, Raster } from "@anarkisti/korpi/paint";

export type { Pen };

/** A raster painted once (a layer of moss, of litter) through `pen` with its top-left at
 *  (x, y): each row's runs of one colour, translucent ones blended as the pen blends them. */
export const paintRaster = (pen: Pen, r: Raster, x = 0, y = 0) => {
  for (let row = 0; row < r.h; row++) {
    let col = 0;
    while (col < r.w) {
      const c = r.px[row * r.w + col];
      if (c >>> 24 === 0) {
        col++;
        continue;
      }
      let end = col + 1;
      while (end < r.w && r.px[row * r.w + end] === c) end++;
      pen.fill(c, x + col, y + row, end - col, 1);
      col = end;
    }
  }
};

const words = lru<string, Rgba>(4096);

const parse = (css: string): Rgba => {
  if (css.startsWith("#")) {
    if (css.length === 4) return rgb(`#${[...css.slice(1)].map((c) => c + c).join("")}`);
    return rgb(css);
  }
  const m = css.match(/rgba?\(([^)]*)\)/);
  if (!m) return 0;
  const [r, g, b, a = 1] = m[1].split(",").map(Number);
  return rgba(r, g, b, Math.round(a * 255));
};

/** A CSS colour (`#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(…)`, `rgba(…)`) as a packed word. */
export const colourOf = (css: string): Rgba => words.get(css, () => parse(css));

/** A filled rect on whole scene pixels, a pixel by default: the pen's `rect`, x and y rounded
 *  and the size rounded on its own, as a canvas's `fillRect` of rounded numbers fills. */
export const fill = (pen: Pen, c: string, x: number, y: number, w = 1, h = 1) => {
  pen.fill(colourOf(c), Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/** `c` at `alpha` of its own: what a canvas's `globalAlpha` did. */
export const faded = (c: string, alpha: number): Rgba => {
  const word = colourOf(c);
  const a = Math.max(0, Math.min(255, Math.round((word >>> 24) * alpha)));
  return ((word & 0xffffff) | (a << 24)) >>> 0;
};

/** `pen` laying every colour at `alpha` of its own: a whole painter faded, as a canvas's
 *  `globalAlpha` faded everything drawn under it. */
export const fadedPen = (pen: Pen, alpha: number): Pen => {
  const k = Math.max(0, Math.min(1, alpha));
  const fade = (c: Rgba) => ((c & 0xffffff) | (Math.round((c >>> 24) * k) << 24)) >>> 0;
  const out: Pen = {
    fill: (c, x, y, w, h, d) => pen.fill(fade(c), x, y, w, h, d),
    span: (c, x0, x1, y, d0, dd) => pen.span(fade(c), x0, x1, y, d0, dd),
  };
  const { glowing } = pen;
  return glowing ? { ...out, glowing: (g) => fadedPen(glowing(g), alpha) } : out;
};

/** A filled rect at `alpha`. */
export const fillFaded = (
  pen: Pen,
  c: string,
  alpha: number,
  x: number,
  y: number,
  w = 1,
  h = 1,
) => {
  if (alpha <= 0) return;
  pen.fill(faded(c, alpha), Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};
