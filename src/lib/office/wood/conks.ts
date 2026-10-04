// Bracket fungi on friday's old wood. Which a tree gets comes from its kind and seed, where
// from its stems (often where a branch was shed), and how each looks at any moment from the
// wood's age and the time of year. Perennial ones (tinder fungus, red-belted conk, false
// tinder, chaga, the plum's cushion) come late in a tree's life, grow a band a year and stay
// on the dead wood as it stands and lies; annual ones come in their season and wither away:
// the sulphur shelf on old oak in summer, the birch polypore on dead birch in autumn. Painted
// side-on, sticking out from the trunk's edge, at the room's 40 px to the metre.

import { hash, rect } from "$lib/scene/pixel";
import { mix } from "$lib/scene/sky";

import type { Arch } from "./growth";
import type { Plan, Species } from "./trees";

export type ConkKind =
  "tinder" | "chaga" | "polypore" | "redbelt" | "sulphur" | "cushion" | "falsetinder";

export const CONKS: readonly ConkKind[] = [
  "tinder",
  "chaga",
  "polypore",
  "redbelt",
  "sulphur",
  "cushion",
  "falsetinder",
];

type Trait = {
  /** Comes in its season each year and withers, or stays and grows a band a year. */
  annual: boolean;
  /** How far it sticks out of the wood grown, px (from, to), and how tall against that. */
  reach: [number, number];
  tall: number;
  /** Years a perennial takes to grow to its reach. */
  grow: number;
  /** How high on the stem, px above the root (from, to). */
  up: [number, number];
};

/** Tinder fungus (taulakääpä) a grey hoof; chaga (pakurikääpä) a black cracked lump; birch
 *  polypore (koivunkääpä) a pale shelf; red-belted conk (kantokääpä) a dark hoof with a red
 *  band; sulphur shelf (rikkikääpä) bright tiers; Phellinus pomaceus (luumunkääpä) a small
 *  cushion; false tinder (arinakääpä) a black hoof. */
const TRAITS: Record<ConkKind, Trait> = {
  tinder: { annual: false, reach: [4, 7], tall: 1.15, grow: 5, up: [8, 110] },
  chaga: { annual: false, reach: [2, 3], tall: 2.4, grow: 6, up: [24, 120] },
  polypore: { annual: true, reach: [3, 6], tall: 0.55, grow: 1, up: [30, 140] },
  redbelt: { annual: false, reach: [3, 7], tall: 0.95, grow: 5, up: [6, 90] },
  sulphur: { annual: true, reach: [4, 7], tall: 0.4, grow: 1, up: [6, 60] },
  cushion: { annual: false, reach: [1, 2], tall: 3, grow: 4, up: [10, 90] },
  falsetinder: { annual: false, reach: [3, 6], tall: 1, grow: 6, up: [10, 100] },
};

/** Which conks a kind of tree bears: how many (from, to), the odds a tree has them at all, and
 *  from what share of its years (living), or only once it is dead (null). */
type Host = { kind: ConkKind; n: [number, number]; odds: number; living: number | null };

const HOSTS: Record<Species, Host[]> = {
  birch: [
    { kind: "tinder", n: [1, 3], odds: 0.7, living: 0.65 },
    { kind: "chaga", n: [1, 1], odds: 0.3, living: 0.5 },
    { kind: "polypore", n: [1, 3], odds: 0.8, living: null },
    { kind: "redbelt", n: [1, 1], odds: 0.25, living: null },
  ],
  spruce: [{ kind: "redbelt", n: [1, 3], odds: 0.7, living: 0.7 }],
  pine: [{ kind: "redbelt", n: [1, 2], odds: 0.6, living: 0.75 }],
  oak: [{ kind: "sulphur", n: [1, 1], odds: 0.6, living: 0.7 }],
  apple: [{ kind: "cushion", n: [1, 3], odds: 0.7, living: 0.6 }],
  cherry: [{ kind: "cushion", n: [1, 3], odds: 0.7, living: 0.6 }],
  plum: [{ kind: "cushion", n: [1, 3], odds: 0.7, living: 0.6 }],
  rowan: [{ kind: "falsetinder", n: [1, 2], odds: 0.6, living: 0.65 }],
  maple: [{ kind: "falsetinder", n: [1, 2], odds: 0.6, living: 0.65 }],
};

/** One conk a tree will bear: on stem `axis`, `s` px up it, out on `side`; there from the wood's
 *  age `from`, years, growing to `reach` px. */
type Site = {
  kind: ConkKind;
  axis: number;
  s: number;
  side: 1 | -1;
  from: number;
  reach: number;
  seed: number;
};

/** The moment a conk is looked at: the wood's age, years (it goes on after the tree dies), the
 *  age the tree dies at (known from its start: where its conks grow depends on it), the
 *  calendar year and how far through it (0 the start of summer), and the snow lying. */
export type ConkTime = { age: number; died: number; year: number; phase: number; snow: number };

/** A conk as it is on a plan: on piece `piece`, `t` along it, out on `side`; how far it sticks
 *  out and how tall, px; its bands; whether its margin is growing; how far withered (0..1). */
export type Conk = {
  kind: ConkKind;
  piece: number;
  t: number;
  side: 1 | -1;
  reach: number;
  tall: number;
  bands: number;
  fresh: boolean;
  withered: number;
  snow: boolean;
  seed: number;
  /** Grown level again on a log lying turned a quarter to that side (1 right), drawn as seen
   *  from in front on its face; otherwise side-on from the wood, as it grew. */
  level?: 1 | -1;
};

/** How tall a `kind` of conk is, px, sticking `reach` px out. */
export const tallOf = (kind: ConkKind, reach: number) =>
  Math.max(2, Math.round(reach * TRAITS[kind].tall));

/** Whether a `kind` of conk comes each year in its season, rather than staying. */
export const annual = (kind: ConkKind) => TRAITS[kind].annual;

/** The piece of `plan` that axis `axis` is drawn with `s` px along it, and how far along that
 *  piece (0..1); null where the axis isn't drawn that far. */
export const pieceOn = (plan: Plan, axis: number, s: number) => {
  const d = plan.onAxes?.[axis];
  if (!d || !d.k.length || s < 0 || s > d.len) return null;
  let j = d.s.length - 1;
  while (j > 0 && d.s[j] > s) j--;
  const end = j + 1 < d.s.length ? d.s[j + 1] : d.len;
  return {
    piece: d.k[j],
    t: Math.max(0, Math.min(1, (s - d.s[j]) / Math.max(0.01, end - d.s[j]))),
  };
};

const sitesKnown = new WeakMap<Arch, Map<number, Site[]>>();

/** Every conk `arch` will bear, a tree that dies at age `died`. */
const sitesOf = (arch: Arch, died: number): Site[] => {
  let byDeath = sitesKnown.get(arch);
  if (!byDeath) sitesKnown.set(arch, (byDeath = new Map()));
  const known = byDeath.get(died);
  if (known) return known;
  const out: Site[] = [];
  // Salted by kind too: two kinds with the same fungus on the same seed get their own.
  const kind = [...arch.species].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 65521, 7);
  const h = (...salt: number[]) => hash(arch.seed, kind, ...salt);
  const rootY = arch.root.y;
  const stems = arch.axes.flatMap((a, i) => (a.stem ? [i] : []));
  // Where a branch was shed from a stem by the time the tree died: the stub rots, and a conk
  // comes in there.
  const stubs = arch.axes.flatMap((a, i) =>
    !a.stem && a.parent >= 0 && arch.axes[a.parent].stem && a.drops <= died
      ? [{ axis: a.parent, s: a.node, side: a.side, up: rootY - a.path[0].y, i }]
      : [],
  );
  const life = Number.isFinite(died) ? died : 40;
  HOSTS[arch.species].forEach((host, k) => {
    if (h(k, 1) >= host.odds) return;
    const trait = TRAITS[host.kind];
    const n = host.n[0] + Math.floor(h(k, 2) * (host.n[1] - host.n[0] + 1));
    for (let j = 0; j < n; j++) {
      const r = (salt: number) => h(k, j, salt);
      const [lo, hi] = trait.up;
      const fits = stubs.filter((b) => b.up >= lo && b.up <= hi);
      let site: { axis: number; s: number; side: 1 | -1 } | null = null;
      if (fits.length && r(3) < 0.6) {
        const b = fits[Math.floor(r(4) * fits.length)];
        site = { axis: b.axis, s: b.s, side: b.side };
      } else {
        // Up a stem, as high as it has to be: the stems stand near enough upright.
        const axis = stems[Math.floor(r(5) * stems.length)];
        const base = rootY - arch.axes[axis].path[0].y;
        const s = lo + (hi - lo) * r(6) - base;
        if (s >= 0) site = { axis, s, side: r(7) < 0.5 ? -1 : 1 };
      }
      if (!site) continue;
      const from =
        host.living === null
          ? life + 0.15 + 0.6 * r(8)
          : life * (host.living + (1 - host.living) * 0.9 * r(8));
      out.push({
        kind: host.kind,
        ...site,
        from,
        reach: trait.reach[0] + Math.round((trait.reach[1] - trait.reach[0]) * r(9)),
        seed: Math.floor(r(10) * 2 ** 31),
      });
    }
  });
  byDeath.set(died, out);
  return out;
};

/** An annual's year, by how far through it (0 the start of summer): when it shows, when it is
 *  grown, how long it keeps fresh, when it is withered through and when it is gone. A birch
 *  polypore lasts into the next summer. */
const SEASONS: Record<"sulphur" | "polypore", [number, number, number, number, number]> = {
  sulphur: [0.1, 0.18, 0.32, 0.55, 0.6],
  polypore: [0.15, 0.3, 0.7, 1.05, 1.1],
};

/** How `site` is at `time`, if it shows: how far out and how tall, its bands, its margin, how
 *  withered. */
const stateOf = (site: Site, time: ConkTime) => {
  const trait = TRAITS[site.kind];
  if (time.age < site.from) return null;
  if (!trait.annual) {
    const years = time.age - site.from;
    const reach = Math.max(
      1,
      Math.round(site.reach * Math.min(1, (years + 0.3) / trait.grow) ** 0.8),
    );
    // Growing in late spring and summer: the new band's rim is pale.
    const fresh = time.phase < 0.3 || time.phase > 0.85;
    return { reach, bands: 1 + Math.floor(years), fresh, withered: 0 };
  }
  const [show, grown, keeps, through, gone] = SEASONS[site.kind as "sulphur" | "polypore"];
  // This year's, or last year's still hanging on.
  for (const back of [0, 1]) {
    const local = time.phase + back;
    if (local < show || local >= gone) continue;
    const year = time.year - back;
    // The wood was old enough when it came, and it came that year.
    if (time.age - (local - show) < site.from || hash(site.seed, year, 2) > 0.8) continue;
    const reach = Math.max(
      1,
      Math.round(site.reach * Math.min(1, (local - show) / (grown - show))),
    );
    const withered = Math.max(0, Math.min(1, (local - keeps) / (through - keeps)));
    return { reach, bands: 1, fresh: withered === 0, withered };
  }
  return null;
};

/** The conks on `plan` (the tree drawn from `arch`) at `time`. */
export const conksOn = (arch: Arch, plan: Plan, time: ConkTime): Conk[] => {
  const out: Conk[] = [];
  for (const site of sitesOf(arch, time.died)) {
    const state = stateOf(site, time);
    if (!state) continue;
    const on = pieceOn(plan, site.axis, site.s);
    // Only on wood thick enough to hold it.
    if (!on || plan.limbs[on.piece].w < 3) continue;
    out.push({
      kind: site.kind,
      piece: on.piece,
      t: on.t,
      side: site.side,
      reach: state.reach,
      tall: tallOf(site.kind, state.reach),
      bands: state.bands,
      fresh: state.fresh,
      withered: state.withered,
      snow: time.snow > 0.5 && site.kind !== "chaga",
      seed: site.seed,
    });
  }
  return out;
};

/** What a set of conks looks like, for a painting's cache key. */
export const conkKey = (conks: Conk[]) =>
  conks
    .map(
      (c) =>
        `${c.piece}${c.kind[0]}${c.reach}.${c.tall}.${c.bands}${c.fresh ? "f" : ""}${Math.round(c.withered * 8)}${c.snow ? "s" : ""}${c.level ?? ""}`,
    )
    .join(",");

// --- Painting ---------------------------------------------------------------------------

/** Each kind's colours: its crust from the top down (it cycles through them band by band),
 *  its underside, its growing rim. */
const LOOKS: Record<ConkKind, { crust: string[]; under: string; rim: string }> = {
  tinder: { crust: ["#a49f96", "#8e897f", "#9a958b", "#7c776e"], under: "#7a6a54", rim: "#cbbd9e" },
  chaga: { crust: ["#1c1814", "#2a241e"], under: "#1c1814", rim: "#6e4220" },
  polypore: { crust: ["#e2d6ba", "#ece6d6"], under: "#f4f0e4", rim: "#c8b08a" },
  redbelt: {
    crust: ["#3a2a22", "#4a3226", "#8a3a22", "#b8482a"],
    under: "#e0d4b0",
    rim: "#ecdcae",
  },
  sulphur: { crust: ["#ee8418"], under: "#f6dc46", rim: "#f6c02a" },
  cushion: { crust: ["#7a6a58", "#6a5a4a"], under: "#5a4a3c", rim: "#9a6a3a" },
  falsetinder: { crust: ["#2e2a26", "#3e3832", "#2e2a26"], under: "#6a4c2c", rim: "#8a6a42" },
};
const CHALK = "#e8e2cc";
const ROTTEN = "#7a6448";
const SNOW = "#f4f7fa";

/** One conk side-on, at the room's scale: `x` the first column out from the wood, `y` the row
 *  of its top where it meets the wood; out to the right for `side` 1. */
export const drawConk = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  c: Pick<
    Conk,
    "kind" | "side" | "reach" | "tall" | "bands" | "fresh" | "withered" | "snow" | "seed"
  >,
) => {
  const look = LOOKS[c.kind];
  const aged = (colour: string) => {
    if (c.withered <= 0) return colour;
    const w = c.withered;
    return w < 0.5 ? mix(colour, CHALK, w * 1.6) : mix(CHALK, ROTTEN, (w - 0.5) * 2);
  };
  const put = (colour: string, col: number, row: number) => {
    // Withered through, it crumbles away.
    if (c.withered > 0.6 && hash(c.seed, col, row, 3) < (c.withered - 0.6) * 2.2) return;
    rect(ctx, aged(colour), x + c.side * col, y + row);
  };
  const P = Math.max(1, c.reach);
  const H = Math.max(2, c.tall);
  if (c.kind === "sulphur") {
    // Tiers of thin shelves, one over another, each its own length.
    const tiers = 2 + Math.floor(hash(c.seed, 4) * 3);
    for (let i = 0; i < tiers; i++) {
      const len = Math.max(2, P - (i % 2) - (i === 0 ? 1 : 0));
      const top = i * 3;
      for (let col = 0; col < len; col++) {
        const tip = col === len - 1;
        put(tip ? look.rim : look.crust[0], col, top);
        put(look.under, col, top + 1);
      }
    }
    return;
  }
  if (c.kind === "chaga") {
    // A black, cracked lump, half in the bark: two columns over the wood, the rest out.
    for (let col = -2; col < P; col++) {
      const inset = col >= 0 ? Math.round(((col + 1) / (P + 1)) * H * 0.35) : 0;
      const jag = hash(c.seed, col, 5) < 0.4 ? 1 : 0;
      for (let row = inset + jag; row < H - inset; row++) {
        const crack = hash(c.seed, col, row, 6) < 0.12;
        put(crack ? look.rim : look.crust[(col + row) & 1], col, row);
      }
    }
    return;
  }
  if (c.kind === "cushion") {
    // A small cushion pressed to the bark: a column of it, a shorter one out.
    for (let col = 0; col < P; col++) {
      const inset = col === 0 ? 0 : 1;
      for (let row = inset; row < H - inset; row++) {
        const edge = col === P - 1 && c.fresh;
        put(edge ? look.rim : row === inset ? look.crust[0] : look.crust[1], col, row);
      }
    }
    return;
  }
  // A shelf seen from the side: thickest at the wood, its top falling away to a rounded margin,
  // the underside flat. A hoof has its years laid down as bands, the newest lowest.
  const shelf = c.kind === "polypore";
  for (let col = 0; col < P; col++) {
    const u = (col + 0.5) / P;
    const top = shelf ? (col === P - 1 && P > 2 ? 1 : 0) : Math.round((H - 1) * 0.55 * u ** 1.5);
    const tip = col === P - 1 && P > 1;
    const bottom = H - 1 - (tip && H > 2 ? 1 : 0);
    if (c.snow && col > 0) rect(ctx, SNOW, x + c.side * col, y + top - 1);
    for (let row = top; row <= bottom; row++) {
      let colour: string;
      if (row === bottom) colour = look.under;
      else if (c.fresh && (tip || row === bottom - 1) && !shelf) colour = look.rim;
      else if (shelf) colour = tip ? look.rim : look.crust[row === top ? 0 : 1];
      else {
        // Bands from the underside up, each a row or two; the top row is the oldest crust.
        const band = Math.floor((bottom - 1 - row) / Math.max(1, Math.floor((H - 1) / c.bands)));
        colour = look.crust[Math.min(look.crust.length - 1, band % look.crust.length)];
        if (c.kind === "redbelt")
          colour =
            look.crust[Math.min(3, Math.floor(((row - top) / Math.max(1, bottom - top)) * 4))];
      }
      put(colour, col, row);
    }
  }
};

/** How tall a conk is seen from in front, and how wide: as wide as it reaches out and half
 *  again, its front a little lower than it is thick. */
const frontOf = (c: Pick<Conk, "reach" | "tall">) => ({
  w: Math.max(3, Math.round(c.reach * 1.6)) | 1,
  h: Math.max(2, Math.round(c.tall * 0.7)),
});

/** One conk seen from in front, level, its top row at `top` and its middle at `cx`: its top
 *  in bands, its margin along the bottom, the corners rounded off under it. */
export const drawConkFront = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  c: Pick<Conk, "kind" | "reach" | "tall" | "bands" | "fresh" | "withered" | "snow" | "seed">,
) => {
  const look = LOOKS[c.kind];
  const aged = (colour: string) => {
    if (c.withered <= 0) return colour;
    const w = c.withered;
    return w < 0.5 ? mix(colour, CHALK, w * 1.6) : mix(CHALK, ROTTEN, (w - 0.5) * 2);
  };
  const put = (colour: string, x: number, y: number) => {
    if (c.withered > 0.6 && hash(c.seed, x, y, 7) < (c.withered - 0.6) * 2.2) return;
    rect(ctx, aged(colour), cx + x, top + y);
  };
  /** A shelf `w` wide and `h` deep from row `y`, its rows coloured by `colour`. */
  const shelf = (w: number, h: number, y: number, colour: (row: number) => string) => {
    const half = (w - 1) / 2;
    for (let row = 0; row < h; row++) {
      const span = Math.round(half * Math.sqrt(1 - (row / h) ** 2));
      for (let x = -span; x <= span; x++) put(colour(row), x, y + row);
    }
  };
  const { w, h } = frontOf(c);
  if (c.kind === "sulphur") {
    // Tiers of thin shelves, one under another, each a little narrower.
    const tiers = 2 + Math.floor(hash(c.seed, 4) * 3);
    for (let i = 0; i < tiers; i++) {
      shelf(Math.max(3, w - 2 * (i % 2) - (i === 0 ? 2 : 0)), 2, i * 3, (row) =>
        row === 0 ? look.crust[0] : look.rim,
      );
    }
    return;
  }
  if (c.snow) for (let x = -(w - 3) / 2; x <= (w - 3) / 2; x++) rect(ctx, SNOW, cx + x, top - 1);
  shelf(w, h, 0, (row) => {
    if (row === h - 1) return c.fresh ? look.rim : look.under;
    if (c.kind === "redbelt") return look.crust[Math.min(3, Math.floor((row / (h - 1)) * 4))];
    if (c.kind === "polypore" || c.kind === "cushion") return look.crust[row === 0 ? 0 : 1];
    return look.crust[row % look.crust.length];
  });
};

/**
 * One conk grown level on a log, `c.level` its lying side, drawn on the log's face at `x`, `y`
 * (the middle of the wood it grows on) as the log was before it went over: turned a quarter
 * back, so turned over with the log it is level. A quarter turn moves whole pixels: nothing
 * is resampled.
 */
export const drawConkLevel = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  c: Pick<
    Conk,
    "kind" | "reach" | "tall" | "bands" | "fresh" | "withered" | "snow" | "seed" | "level"
  >,
) => {
  const side = c.level ?? 1;
  const turned = {
    set fillStyle(colour: string) {
      ctx.fillStyle = colour;
    },
    get fillStyle() {
      return ctx.fillStyle as string;
    },
    // The log goes over clockwise for side 1, taking a point (dx, dy) from where it grew to
    // (-dy, dx); the conk is drawn at the inverse, (dy, -dx), and so the other way for -1.
    fillRect(px: number, py: number, w: number, h: number) {
      const [dx, dy] = [px - x, py - y];
      if (side > 0) ctx.fillRect(x + dy, y - dx - w + 1, h, w);
      else ctx.fillRect(x - dy - h + 1, y + dx, h, w);
    },
  } as unknown as CanvasRenderingContext2D;
  drawConkFront(turned, x, y - Math.floor(frontOf(c).h / 2), c);
};
