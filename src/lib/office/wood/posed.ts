// Things that move in the wind, drawn in pixels. A tree or a shrub is painted once at rest
// into pixel lists, part by part; each frame every part is put back where its pose has it.
// Nothing tears, and bark and leaves keep their pattern. The physics is the caller's: trees
// pose by `sway.ts`, shrubs by `rustle.ts`.

export type Pt = { x: number; y: number };

/**
 * The part about to be painted: a piece of wood from `a` to `b` (it may bend along its
 * length), a clump of leaves, a fruit (by index into the pose), or something that stays put.
 */
export type Part =
  | { kind: "wood"; i: number; a: Pt; b: Pt }
  | { kind: "clump" | "fruit"; i: number }
  | { kind: "still" };

/**
 * How far each part has moved from rest, px: both ends of each piece of wood, each clump,
 * each fruit. `turned` is the share of a clump's leaves turned over to their paler undersides.
 */
export type Pose = { a: Pt[]; b: Pt[]; clumps: Pt[]; fruit: Pt[]; turned?: number[] };

/** Paints at rest into `ctx`, calling `part` before each part. */
export type Painter = (ctx: CanvasRenderingContext2D, part: (p: Part) => void) => void;

/** How far along `a`→`b` the point nearest `p` is, 0..1. */
export const alongOf = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  return l2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
};

/** A painting at rest in pixel lists, one run per part, and the buffer it is posed into. */
type Baked = {
  key: string;
  parts: Part[];
  /** Where each part's pixels start in the lists; one more entry than parts. */
  from: number[];
  xs: Int16Array;
  ys: Int16Array;
  colours: Uint32Array;
  /** The same pixels with the leaf turned over: paler, toward the felt under a leaf. */
  under: Uint32Array;
  /** When each pixel's leaf turns: it shows its underside once a clump is this far turned. */
  rank: Float32Array;
  /** How far along its piece each wood pixel is, 0..1. */
  along: Float32Array;
  box: { x: number; y: number; w: number; h: number };
  canvas: HTMLCanvasElement;
  image: ImageData;
  pixels: Uint32Array;
};

/** Room around the painting for it to move into, px. */
const MARGIN = 12;

let probe: CanvasRenderingContext2D | null = null;
const rgba = new Map<string, number>();
/** A CSS colour as a little-endian RGBA word, the way ImageData holds it. */
const wordOf = (colour: string) => {
  const known = rgba.get(colour);
  if (known !== undefined) return known;
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe) return 0;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = colour;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  const word = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  rgba.set(colour, word);
  return word;
};

/** A leaf's underside: the colour taken most of the way to a pale grey-green. */
const underOf = (word: number) => {
  const mix = (shift: number, to: number) => {
    const v = (word >>> shift) & 255;
    return Math.round(v + (to - v) * 0.55) << shift;
  };
  return ((word & 0xff000000) | mix(16, 214) | mix(8, 226) | mix(0, 206)) >>> 0;
};

const bake = (key: string, paint: Painter): Baked | null => {
  const parts: Part[] = [];
  const from: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const colours: number[] = [];
  const along: number[] = [];
  let fill = "#000";
  let piece: { a: Pt; b: Pt } | null = null;
  // Stands in for a canvas: `rect` only sets a colour and fills whole pixels.
  const recorder = {
    set fillStyle(c: string) {
      fill = c;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const word = wordOf(fill);
      for (let py = Math.round(y); py < Math.round(y + h); py++) {
        for (let px = Math.round(x); px < Math.round(x + w); px++) {
          xs.push(px);
          ys.push(py);
          colours.push(word);
          along.push(piece ? alongOf({ x: px + 0.5, y: py }, piece.a, piece.b) : 0);
        }
      }
    },
  } as unknown as CanvasRenderingContext2D;
  paint(recorder, (p) => {
    parts.push(p);
    from.push(xs.length);
    piece = p.kind === "wood" ? { a: p.a, b: p.b } : null;
  });
  from.push(xs.length);
  if (!xs.length) return null;
  const x0 = Math.min(...xs) - MARGIN;
  const y0 = Math.min(...ys) - MARGIN;
  const box = {
    x: x0,
    y: y0,
    w: Math.max(...xs) + MARGIN - x0 + 1,
    h: Math.max(...ys) + MARGIN - y0 + 1,
  };
  const canvas = document.createElement("canvas");
  canvas.width = box.w;
  canvas.height = box.h;
  const image = new ImageData(box.w, box.h);
  const words = Uint32Array.from(colours);
  return {
    key,
    parts,
    from,
    xs: Int16Array.from(xs),
    ys: Int16Array.from(ys),
    colours: words,
    under: words.map(underOf),
    // Each leaf turns at its own moment, so a clump turns over leaf by leaf, not all at once.
    rank: Float32Array.from(
      xs,
      (x, k) => (Math.imul(x * 73 + ys[k] * 151, 2654435761) >>> 0) / 2 ** 32,
    ),
    along: Float32Array.from(along),
    box,
    canvas,
    image,
    pixels: new Uint32Array(image.data.buffer),
  };
};

const baked = new Map<string, Baked>();

/**
 * Draw a painting posed: painted once per `key` (growth step and season) under `name`, then
 * each part moved as `pose` says, in the order it was painted.
 */
export const drawPosed = (
  ctx: CanvasRenderingContext2D,
  name: string,
  key: string,
  paint: Painter,
  pose: Pose,
) => {
  let it = baked.get(name);
  if (!it || it.key !== key) {
    const fresh = bake(key, paint);
    if (!fresh) return;
    it = fresh;
    baked.set(name, it);
  }
  const { parts, from, xs, ys, colours, under, rank, along, box, pixels } = it;
  pixels.fill(0);
  parts.forEach((p, j) => {
    let still = { x: 0, y: 0 };
    let move: { a: Pt; b: Pt } | null = null;
    let turned = 0;
    if (p.kind === "wood") move = { a: pose.a[p.i], b: pose.b[p.i] };
    else if (p.kind === "clump") {
      still = pose.clumps[p.i];
      turned = pose.turned?.[p.i] ?? 0;
    } else if (p.kind === "fruit") still = pose.fruit[p.i];
    const sx = Math.round(still.x) - box.x;
    const sy = Math.round(still.y) - box.y;
    for (let k = from[j]; k < from[j + 1]; k++) {
      let x = xs[k] + sx;
      let y = ys[k] + sy;
      if (move) {
        const u = along[k];
        x = xs[k] + Math.round(move.a.x + (move.b.x - move.a.x) * u) - box.x;
        y = ys[k] + Math.round(move.a.y + (move.b.y - move.a.y) * u) - box.y;
      }
      if (x < 0 || y < 0 || x >= box.w || y >= box.h) continue;
      pixels[y * box.w + x] = rank[k] < turned ? under[k] : colours[k];
    }
  });
  it.canvas.getContext("2d")?.putImageData(it.image, 0, 0);
  ctx.drawImage(it.canvas, box.x, box.y);
};
