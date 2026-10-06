// The hooded crow (varis). It comes by day, every couple of minutes, and does one of four
// things before it goes: struts the floor pecking; in autumn makes for a fallen apple and, as
// often as not, carries it off; sits on what is left of the wall, or a branch, and caws; or
// lands on the desk by the jar, which sends the tit off its seeds. Like everything on friday a
// function of the clock and the seed: each visit is worked out whole from its number.

import { drawApple } from "@anarkisti/korpi/plants/paint";

import type { Pen } from "$lib/scene/pen";
import { hash } from "$lib/scene/pixel";
import { daylight } from "$lib/scene/sky";
import crowSprite from "$lib/sprites/crow.json";
import { frameOf, paintSprite, type Sprite } from "$lib/sprites/sprite";

import { at, floorZ, footAt, Z } from "../depth";
import { FLOOR_Y, SCENE_W } from "../engine";
import type { Pt } from "./posed";
import { SEASON_S, SEASONS_FROM } from "./seasons";
import { applesDown, type Knocks, sceneOf, standFor, standing } from "./stand";
import { birdAt, cycleAt } from "./tit";
import { climbTo, type Setting } from "./wall";
import { windowAt } from "./weather";

const CROW = crowSprite as Sprite;
/** Where its feet are in the sprite: it is drawn from there. */
const FEET = { x: 11, y: 15 };

/** The first visit, and one about this often after, give or take `JITTER`, s. */
const FROM = 150;
const EVERY = 110;
const JITTER = 40;
/** Flying in or out takes this long, s. */
const FLY_S = 2.4;
/** It walks this fast, px/s. */
const STRIDE_PX_S = 7;
/** Where the crow stands on the desk by the jar, and on the floor. */
const DESK_SPOT = { x: 170, y: 118 };
const FLOOR_LANE = FLOOR_Y + 7;
/** Where along the wall it may sit, if the wall still stands there. */
const WALL_SPOTS = [34, 62, 96, 118, 204, 226, 252, 292];
/** How far in front of its tree it sits on a branch, m. */
const PERCH_DZ = 0.01;

type Kind = "jar" | "apples" | "perch" | "floor";

type Visit = {
  kind: Kind;
  /** When it touches down and when it takes off, s into friday. */
  land: number;
  leave: number;
  /** Which way it faces as it lands, and flies on out. */
  face: 1 | -1;
  /** Where its feet are, set down, and how far out from the wall, m. */
  at: Pt;
  z: number;
  from: Pt;
  to: Pt;
  /** When it caws, s into friday. */
  caws: number[];
  /** The apple it makes for: where it lies, and whether it takes it. */
  apple?: { key: string; j: number; x: number; takes: boolean };
};

/** Whether the sun is up enough for a crow: it roosts at night. */
const byDay = (t: number) => daylight(windowAt(t).progress) >= 0.3;

const startOf = (n: number, seed: number) => FROM + n * EVERY + hash(seed, n, 61) * JITTER;

const visits = new Map<string, Visit | null>();

/** Visit `n`, worked out whole; null if there is none (a night). */
const visitOf = (n: number, seed: number, setting: Setting, knocks: Knocks): Visit | null => {
  // Blows only add up, so how many the wall has taken tells one wall from the next.
  const key = `${seed}|${n}|${JSON.stringify(knocks)}|${setting.knocks?.length ?? 0}`;
  if (visits.has(key)) return visits.get(key) ?? null;
  const visit = plan(n, seed, setting, knocks);
  visits.set(key, visit);
  return visit;
};

/** The crow's landing on the desk by the jar in visit `n`, if that is what it does. */
const jarLanding = (n: number, seed: number) => {
  if (n < 0 || hash(seed, n, 62) >= 0.22) return null;
  const start = startOf(n, seed);
  // While the tit is on the lid: seven seconds into one of its visits, and still by day.
  const touch = start + FLY_S;
  const land = touch + ((((7 - cycleAt(touch)) % 26) + 26) % 26);
  // And only if the tit is there to be scared: at dusk it may have gone to roost.
  return byDay(start) && byDay(land) && birdAt(land - 0.1)?.sit ? land : null;
};

const plan = (n: number, seed: number, setting: Setting, knocks: Knocks): Visit | null => {
  if (n < 0) return null;
  const h = (salt: number) => hash(seed, n, salt);
  const start = startOf(n, seed);
  if (!byDay(start)) return null;
  const flyIn = (at: Pt, z: number, face: 1 | -1) => ({
    from: { x: face > 0 ? -30 : SCENE_W + 30, y: 6 + h(63) * 24 },
    to: { x: face > 0 ? SCENE_W + 30 : -30, y: h(64) * 16 - 10 },
    at,
    z,
    face,
  });
  const jar = jarLanding(n, seed);
  if (jar !== null) {
    return {
      kind: "jar",
      land: jar,
      leave: jar + 6,
      caws: [jar + 1],
      ...flyIn(DESK_SPOT, Z.deskCrow, -1),
    };
  }
  const land = start + FLY_S;
  const face: 1 | -1 = h(65) < 0.5 ? 1 : -1;
  const pick = h(66);
  // In autumn, the apples in the grass first.
  const lying = applesDown(land, seed, knocks).filter((a) => a.gone > land + 12);
  if (pick < 0.45 && lying.length) {
    const a = lying[Math.floor(h(67) * lying.length)];
    const at = { x: a.x - face * 16, y: a.y + 1 };
    return {
      kind: "apples",
      land,
      leave: land + 8,
      caws: [],
      apple: { key: a.key, j: a.j, x: a.x, takes: h(68) < 0.55 },
      ...flyIn(at, floorZ(at.y), face),
    };
  }
  if (pick < 0.7) {
    // On what is left of the wall, or else on a branch, a hair in front of its tree.
    const x = WALL_SPOTS[Math.floor(h(69) * WALL_SPOTS.length)];
    const top = climbTo(x, 0, land, seed, setting);
    const branch = standing(seed, land)
      .map((l) => {
        const perch = standFor(seed).planOf(l, land).perch;
        return perch && { at: sceneOf(l, perch), z: l.z + PERCH_DZ };
      })
      .find((p) => p !== null);
    // A broken edge in view: a wall still whole runs up out of the room.
    const on = top >= 16 && top < 80 ? { at: { x, y: top - 1 }, z: Z.hung } : branch;
    if (on) {
      return {
        kind: "perch",
        land,
        leave: land + 7,
        caws: [land + 1.4, land + 3, land + 4.6],
        ...flyIn(on.at, on.z, face),
      };
    }
  }
  const at = { x: 40 + h(70) * 240, y: FLOOR_LANE };
  return {
    kind: "floor",
    land,
    leave: land + 14,
    caws: h(71) < 0.4 ? [land + 9] : [],
    ...flyIn(at, floorZ(at.y), face),
  };
};

/** Visit `n` or the one before, whichever is about at `since`. */
const visitAt = (since: number, seed: number, setting: Setting, knocks: Knocks) => {
  const n = Math.floor((since - FROM) / EVERY);
  for (const k of [n, n - 1]) {
    const v = visitOf(k, seed, setting, knocks);
    if (v && since >= v.land - FLY_S && since < v.leave + FLY_S) return v;
  }
  return null;
};

/** When the crow lands by the jar in the visit about at `since`, for the tit: or null. */
export const crowAtJar = (seed: number, since: number) => {
  const n = Math.floor((since - FROM) / EVERY);
  for (const k of [n, n - 1]) {
    const land = jarLanding(k, seed);
    if (land !== null && since >= land - 26 && since < land + 26) return land;
  }
  return null;
};

type Pose = {
  feet: Pt;
  /** How far out from the wall, m, and whether that is standing on the floor. */
  z: number;
  floor: boolean;
  face: 1 | -1;
  frame: number;
  carrying: boolean;
};

/** A run of `CROW` played once over `s` seconds, `t` s in. */
const once = (name: string, t: number, s: number) =>
  frameOf(CROW, name, (t / s) * (CROW.animations?.[name]?.length ?? 1));

/** The crow's frame `t` s into friday if it is cawing then: the caw run over the call, its beak
 *  open for the 0.34 s kraa. */
const cawAt = (v: Visit, t: number): number | null => {
  const c = v.caws.find((c) => t >= c - 0.1 && t < c + 0.45);
  return c === undefined ? null : once("caw", t - c + 0.1, 0.55);
};

/** Where the crow is and what it is doing `since` s into friday, if it is about. */
const poseAt = (since: number, seed: number, setting: Setting, knocks: Knocks): Pose | null => {
  const v = visitAt(since, seed, setting, knocks);
  if (!v) return null;
  const carrying = !!v.apple?.takes;
  // In the air it comes in from out over the room and goes back out there.
  if (since < v.land) {
    const q = 1 - (v.land - since) / FLY_S;
    const e = 1 - (1 - q) ** 2;
    return {
      feet: {
        x: v.from.x + (v.at.x - v.from.x) * e,
        y: v.from.y + (v.at.y - v.from.y) * e - Math.sin(q * Math.PI) * 8,
      },
      z: Z.fliers + (v.z - Z.fliers) * e,
      floor: false,
      face: v.face,
      frame: frameOf(CROW, "fly", since * 9),
      carrying: false,
    };
  }
  if (since >= v.leave) {
    const q = (since - v.leave) / FLY_S;
    const e = q * q;
    const from = { ...v.at, x: v.at.x + (v.kind === "apples" ? v.face * 7 : 0) };
    return {
      feet: { x: from.x + (v.to.x - from.x) * e, y: from.y + (v.to.y - from.y) * e },
      z: v.z + (Z.fliers - v.z) * e,
      floor: false,
      face: v.face,
      frame: frameOf(CROW, "fly", since * 9),
      carrying,
    };
  }
  const t = since - v.land;
  if (v.kind === "floor") return strut(v, t, seed);
  if (v.kind === "apples") {
    // To the apple, then at it.
    const walk = Math.min(1, t / 1);
    const x = v.at.x + v.face * 7 * walk;
    const frame = walk < 1 ? frameOf(CROW, "walk", t * 4) : frameOf(CROW, "peck", (t - 1) * 4);
    return { feet: { x, y: v.at.y }, z: v.z, floor: true, face: v.face, frame, carrying: false };
  }
  const frame =
    cawAt(v, since) ?? (v.kind === "jar" && t > 2.6 && t < 3.6 ? once("peck", t - 2.6, 1) : 0);
  return { feet: v.at, z: v.z, floor: false, face: v.face, frame, carrying: false };
};

/** Strutting the floor: a few steps, a peck, a look round, mostly onward. */
const strut = (v: Visit, t: number, seed: number): Pose => {
  const BEAT = 2.6;
  let x = v.at.x;
  let face = v.face;
  let frame = 0;
  for (let k = 0; k * BEAT <= t; k++) {
    const dir: 1 | -1 = hash(seed, Math.round(v.land), k) < 0.7 ? v.face : v.face === 1 ? -1 : 1;
    const into = t - k * BEAT;
    const walked = Math.min(1.4, into);
    x = Math.max(20, Math.min(SCENE_W - 20, x + dir * STRIDE_PX_S * walked));
    face = dir;
    frame =
      into < 1.4
        ? frameOf(CROW, "walk", into * 4)
        : into < 2
          ? once("peck", into - 1.4, 0.6)
          : (cawAt(v, v.land + t) ?? 0);
  }
  return { feet: { x, y: v.at.y }, z: v.z, floor: true, face, frame, carrying: false };
};

/** The crow, if it is about, where it is: on the floor, the desk, the wall or a branch, or in
 *  the air. */
export const drawCrow = (
  pen: Pen,
  since: number,
  seed: number,
  setting: Setting,
  knocks: Knocks,
) => {
  const p = poseAt(since, seed, setting, knocks);
  if (!p) return;
  const into = p.floor ? footAt(pen, p.feet.y) : at(pen, p.z);
  const left = p.face > 0 ? p.feet.x - FEET.x : p.feet.x - (CROW.w - 1 - FEET.x);
  paintSprite(into, CROW, left, p.feet.y - FEET.y, {
    frame: p.frame,
    flip: p.face < 0 ? "h" : undefined,
  });
  // The apple it took, in its beak.
  if (p.carrying) {
    const beak = p.face > 0 ? left + CROW.w - 1 : left;
    drawApple(into, beak, p.feet.y - FEET.y + 8, 2, true, 1);
  }
};

/** The apples the crow has carried off by `since`, this year: when each went. */
export const crowTook = (
  since: number,
  seed: number,
  setting: Setting,
  knocks: Knocks,
): Map<string, number> => {
  const took = new Map<string, number>();
  if (since < SEASONS_FROM) return took;
  const year = SEASONS_FROM + Math.floor((since - SEASONS_FROM) / (4 * SEASON_S)) * 4 * SEASON_S;
  const last = Math.floor((since - FROM) / EVERY);
  for (let n = Math.max(0, Math.floor((year - FROM) / EVERY) - 1); n <= last; n++) {
    const v = visitOf(n, seed, setting, knocks);
    if (v?.apple?.takes && v.leave <= since) took.set(v.apple.key, v.leave);
  }
  return took;
};

/** Where the crow cawed between two moments of friday: for the sound. */
export const crowCue = (
  from: number,
  to: number,
  seed: number,
  setting: Setting,
  knocks: Knocks,
): number[] => {
  if (to <= from) return [];
  const v = visitAt(to, seed, setting, knocks);
  return v ? v.caws.filter((c) => c > from && c <= to).map(() => v.at.x) : [];
};
