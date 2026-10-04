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
export type Pose = {
  a: Pt[];
  b: Pt[];
  clumps: Pt[];
  fruit: Pt[];
  turned?: number[];
  /** The whole thing turned about a point on the ground (a tree going over); see `Over`. */
  over?: Over;
  /** A pose that names itself is posed once and drawn as it was while the name holds. */
  still?: string;
};

/**
 * Turned `angle` (radians, + clockwise) about `about`, a point on the ground, and sunk `sunk`
 * px into it; what ends up below the ground is not drawn. Down, it rots (0..1 each): moss
 * climbs it from the ground (`moss`, in the colours `mosses`), and it crumbles (`gone`),
 * what sticks up first and what lies on the ground last.
 */
export type Over = {
  about: Pt;
  angle: number;
  sunk: number;
  moss: number;
  gone: number;
  mosses: string[];
};

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
  /** The `still` pose last drawn. */
  posed?: string;
};

/** Room around the painting for it to move into, px. */
const MARGIN = 12;
/** What lies higher off the ground than this, px, rots first. */
const ROT_REACH = 14;

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

/** The box, scene px, a painting is posed into when it needs more room than its own. */
export type Room = { x: number; y: number; w: number; h: number };

const bake = (key: string, paint: Painter, room?: Room): Baked | null => {
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
  const box = room ?? {
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
  room?: Room,
  sheet?: Sheet,
) => {
  let it = baked.get(name);
  if (!it || it.key !== key) {
    const fresh = bake(key, paint, room);
    if (!fresh) return;
    it = fresh;
    baked.set(name, it);
  }
  const { parts, from, xs, ys, colours, under, rank, along, box } = it;
  if (!sheet && pose.still !== undefined && pose.still === it.posed) {
    ctx.drawImage(it.canvas, box.x, box.y);
    return;
  }
  it.posed = sheet ? undefined : pose.still;
  // Posed into its own buffer, or straight into the sheet at scene px.
  const pixels = sheet ? sheet.pixels : it.pixels;
  const dx0 = sheet ? 0 : box.x;
  const dy0 = sheet ? 0 : box.y;
  const bw = sheet ? sheet.image.width : box.w;
  const bh = sheet ? sheet.image.height : box.h;
  if (sheet) grow(sheet, box);
  else pixels.fill(0);
  const over = pose.over;
  const cos = over ? Math.cos(over.angle) : 1;
  const sin = over ? Math.sin(over.angle) : 0;
  const mosses = over?.mosses.map(wordOf) ?? [];
  const tilted = over ? Math.abs(Math.sin(2 * over.angle)) > 0.05 : false;
  parts.forEach((p, j) => {
    let still = { x: 0, y: 0 };
    let move: { a: Pt; b: Pt } | null = null;
    let turned = 0;
    if (p.kind === "wood") move = { a: pose.a[p.i], b: pose.b[p.i] };
    else if (p.kind === "clump") {
      still = pose.clumps[p.i];
      turned = pose.turned?.[p.i] ?? 0;
    } else if (p.kind === "fruit") still = pose.fruit[p.i];
    const sx = Math.round(still.x);
    const sy = Math.round(still.y);
    for (let k = from[j]; k < from[j + 1]; k++) {
      let x = xs[k] + sx;
      let y = ys[k] + sy;
      if (move) {
        const u = along[k];
        x = xs[k] + Math.round(move.a.x + (move.b.x - move.a.x) * u);
        y = ys[k] + Math.round(move.a.y + (move.b.y - move.a.y) * u);
      }
      let word = rank[k] < turned ? under[k] : colours[k];
      if (over) {
        const dx = x - over.about.x;
        const dy = y - over.about.y;
        x = Math.round(over.about.x + dx * cos - dy * sin);
        y = Math.round(over.about.y + dx * sin + dy * cos) + over.sunk;
        if (y > over.about.y) continue;
        // How near the ground: 1 on it, 0 a hand's height above.
        const low = 1 - Math.min(1, (over.about.y - y) / ROT_REACH);
        if (over.gone > 0.4 * rank[k] + 0.6 * low) continue;
        if (over.moss > (1 - low) * 0.8 + rank[k] * 0.25) {
          word = mosses[Math.floor(rank[k] * 997) % mosses.length];
        }
      }
      x -= dx0;
      y -= dy0;
      if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
      pixels[y * bw + x] = word;
      // Turned off the square, pixels spread apart; each covers its neighbour if that is bare.
      if (tilted && x + 1 < bw && !pixels[y * bw + x + 1]) pixels[y * bw + x + 1] = word;
    }
  });
  if (sheet) return;
  it.canvas.getContext("2d")?.putImageData(it.image, 0, 0);
  ctx.drawImage(it.canvas, box.x, box.y);
};

/**
 * A scene-sized sheet that several paintings are posed into, in order, and then drawn at once
 * (`drawSheet`): one upload and one blit for all of them, of only the part they covered,
 * rather than one per painting.
 */
export type Sheet = {
  image: ImageData;
  pixels: Uint32Array;
  canvas: HTMLCanvasElement;
  /** What the paintings posed into it cover, scene px; empty while x1 < x0. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

const sheets = new Map<string, Sheet>();

/** The sheet `name`, `w` × `h`, cleared for a frame's paintings. */
export const sheetOf = (name: string, w: number, h: number): Sheet => {
  let sheet = sheets.get(name);
  if (!sheet || sheet.image.width !== w || sheet.image.height !== h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const image = new ImageData(w, h);
    sheet = {
      image,
      pixels: new Uint32Array(image.data.buffer),
      canvas,
      x0: 0,
      y0: 0,
      x1: -1,
      y1: -1,
    };
    sheets.set(name, sheet);
  } else if (sheet.x1 >= sheet.x0) {
    // Only what the last frame covered needs clearing.
    for (let y = sheet.y0; y <= sheet.y1; y++) {
      sheet.pixels.fill(0, y * w + sheet.x0, y * w + sheet.x1 + 1);
    }
  }
  sheet.x0 = w;
  sheet.y0 = h;
  sheet.x1 = -1;
  sheet.y1 = -1;
  return sheet;
};

/** Widen what `sheet` covers by `box`, within the sheet. */
export const grow = (sheet: Sheet, box: Room) => {
  const { width, height } = sheet.image;
  sheet.x0 = Math.max(0, Math.min(sheet.x0, box.x));
  sheet.y0 = Math.max(0, Math.min(sheet.y0, box.y));
  sheet.x1 = Math.min(width - 1, Math.max(sheet.x1, box.x + box.w - 1));
  sheet.y1 = Math.min(height - 1, Math.max(sheet.y1, box.y + box.h - 1));
};

/** Draw what was posed into `sheet` this frame. */
export const drawSheet = (ctx: CanvasRenderingContext2D, sheet: Sheet) => {
  if (sheet.x1 < sheet.x0 || sheet.y1 < sheet.y0) return;
  const w = sheet.x1 - sheet.x0 + 1;
  const h = sheet.y1 - sheet.y0 + 1;
  sheet.canvas.getContext("2d")?.putImageData(sheet.image, 0, 0, sheet.x0, sheet.y0, w, h);
  ctx.drawImage(sheet.canvas, sheet.x0, sheet.y0, w, h, sheet.x0, sheet.y0, w, h);
};
