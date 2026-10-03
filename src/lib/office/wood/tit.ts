// The great tit (talitiainen) that comes to the jar on friday. Every 26 s, by day, it flies in,
// perches on the lid, takes the seeds the drone drops one by one, glances about and is off; it
// sleeps the nights. It stays the winter, as great tits do, fluffed up round against the cold;
// sings its ti-ti-tyy in spring; and in summer brings a fledgling that begs beside it on the
// lid. The crow landing by the jar sends them off early. Drawn in rects, facing right in a
// 10 x 8 box.

import { rect } from "$lib/scene/pixel";
import { daylight } from "$lib/scene/sky";

import { SCENE_W } from "../engine";
import { seasonAt, SEASONS_FROM } from "./seasons";
import { windowAt } from "./weather";

/** The jar's lid, scene y: the desk's top (118) less the jar. */
const JAR_LID = 90;

const TIT = {
  cap: "#111214",
  cheek: "#f4f4f0",
  back: "#6f8a3a",
  tail: "#4f6a2a",
  belly: "#e8c53a",
  underside: "#d0ad2a",
  wing: "#5a7fa8",
  wingTip: "#3f5f86",
  beak: "#3a3a3a",
};

/** A fledgling: the same bird, duller, the cap brownish and the cheeks yellow. */
const YOUNG: typeof TIT = {
  cap: "#3a362c",
  cheek: "#e8e0a8",
  back: "#7a8a4a",
  tail: "#5a6a3a",
  belly: "#d8c868",
  underside: "#c0b050",
  wing: "#6a7f98",
  wingTip: "#4f6378",
  beak: "#4a4a44",
};

/** How the bird is dressed: `fluff`ed round in the cold, `open` beaked (singing, begging),
 *  or `young`. */
export type Dress = { fluff?: boolean; open?: boolean; young?: boolean };
/**
 * A great tit (talitiainen), facing right in a 10 × 8 box at x, y. `flap` is the wing
 * phase; `null` folds the wing along the back and puts the bird on its feet.
 */
export const drawBird = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  flap: number | null,
  face: 1 | -1,
  peck = false,
  dress: Dress = {},
) => {
  const BIRD = dress.young ? YOUNG : TIT;
  ctx.save();
  ctx.translate(Math.round(x) + (face < 0 ? 10 : 0), Math.round(y));
  ctx.scale(face, 1);
  const px = (c: string, dx: number, dy: number, w = 1, h = 1) => rect(ctx, c, dx, dy, w, h);
  px(BIRD.tail, 0, 4, 2, 1);
  px(BIRD.tail, 0, 5);
  if (dress.fluff) {
    // Fluffed against the cold: a pixel rounder all over.
    px(BIRD.back, 2, 2, 5, 2);
    px(BIRD.belly, 2, 4, 5, 3);
    px(BIRD.cap, 6, 4, 1, 2);
    px(BIRD.underside, 3, 7, 4, 1);
  } else {
    px(BIRD.back, 2, 3, 5, 1);
    px(BIRD.belly, 3, 4, 4, 2);
    px(BIRD.cap, 6, 4, 1, 2);
    px(BIRD.underside, 4, 6, 3, 1);
  }
  if (peck) {
    // Head down and forward, beak to the lid.
    px(BIRD.cap, 7, 3, 3, 3);
    px(BIRD.cheek, 8, 4, 2, 1);
    px(BIRD.beak, 10, 5);
  } else {
    px(BIRD.cap, 6, 1, 3, 3);
    px(BIRD.cheek, 7, 2, 2, 1);
    if (dress.open) {
      // Beak open: singing, or begging.
      px(BIRD.beak, 9, 1);
      px(BIRD.beak, 9, 3);
    } else px(BIRD.beak, 9, 2);
  }
  if (flap === null) {
    px(BIRD.wing, 3, 3, 3, 1);
    px(BIRD.wingTip, 2, 4, 2, 1);
    if (!dress.fluff) {
      px(BIRD.beak, 4, 7);
      px(BIRD.beak, 6, 7);
    }
  } else {
    // One wing, hinged at the shoulder, sweeping from high over the back to low under it.
    const lift = Math.sin(flap);
    for (let i = 1; i <= 5; i++) {
      const wx = 5 - i * 0.6;
      const wy = 3 - lift * i * 1.3;
      px(i >= 4 ? BIRD.wingTip : BIRD.wing, Math.round(wx), Math.round(wy), 2, 1);
    }
  }
  ctx.restore();
};

/** The bird's visit, one cycle every 26 s: in, perch on the jar, get fed, peck, off. */
const CYCLE_S = 26;
export const PERCH = { x: 151, y: JAR_LID };
/** Seeds the drone drops onto the jar lid, in front of the bird's beak. */
export const SEEDS = [161, 163, 162, 164, 161].map((x, k) => ({
  x,
  y: JAR_LID + 7,
  drop: 5.2 + k * 0.35,
  eat: 7 + k * 0.9,
}));
export const SEED_FALL_S = 0.45;
export const cycleAt = (since: number) => (since + 6) % CYCLE_S;

/** Whether the tit is about for the visit `since` is in: by day, as it sleeps the nights. */
const byDay = (since: number) => daylight(windowAt(since - cycleAt(since) + 3).progress) >= 0.3;

/** In spring it sings, once the seeds are gone; a phrase starts at each of these. */
const SONG = [11.1, 12.2];
/** In summer it feeds the fledgling beside it, at each of these. */
const FEEDS = [11, 12.1];

const spring = (since: number) => since >= SEASONS_FROM && seasonAt(since).k === 3;
const fledging = (since: number) => {
  const { k, p } = seasonAt(since);
  return since >= SEASONS_FROM && k === 0 && p > 0.35 && p < 0.8;
};
const cold = (since: number) => {
  const { k, p } = seasonAt(since);
  return since >= SEASONS_FROM && (k === 2 || (k === 3 && p < 0.15) || (k === 1 && p > 0.85));
};

/** When in its cycle the bird is heard: on landing, at each seed, and taking off. */
const BIRD_CUES: { at: number; cue: "chirp" | "peck" | "song"; spring?: boolean }[] = [
  { at: 2.8, cue: "chirp" },
  ...SEEDS.map((sd) => ({ at: sd.eat - 0.1, cue: "peck" as const })),
  ...SONG.map((at) => ({ at, cue: "song" as const, spring: true })),
  { at: 12.9, cue: "chirp" },
];

/** When in the cycle the crow, landing at `startled` s into friday, scares the bird off the
 *  lid: while it is perched, or null. */
const scaredAt = (since: number, startled: number | null) => {
  if (startled === null) return null;
  const s = startled - (since - cycleAt(since));
  return s >= 3 && s < 13 ? s : null;
};

/** What the bird says between two moments of friday, if anything: a sharp alarm if the crow
 *  scares it off, and nothing it would have said after. */
export const birdCue = (
  from: number,
  to: number,
  startled: number | null = null,
): "chirp" | "peck" | "song" | "alarm" | null => {
  if (to <= from || !byDay(to)) return null;
  const a = cycleAt(from);
  const b = cycleAt(to);
  const within = (at: number) => (a <= b ? at > a && at <= b : at > a || at <= b);
  const scared = scaredAt(to, startled);
  if (scared !== null && within(scared)) return "alarm";
  const hit = BIRD_CUES.find(
    (c) => within(c.at) && (scared === null || c.at < scared) && (!c.spring || spring(to)),
  );
  return hit?.cue ?? null;
};

/** Where a bird is, which way it faces, whether it sits or pecks, and how it is dressed. */
export type TitPose = {
  x: number;
  y: number;
  sit: boolean;
  peck: boolean;
  face: 1 | -1;
  dress: Dress;
};

/** Flying in from the left, landing at `to` by `land` s into the cycle, from `start`. */
const arriving = (c: number, start: number, land: number, to: { x: number; y: number }) => {
  const q = (c - start) / (land - start);
  return { x: -10 + (to.x + 10) * q, y: 40 + (to.y - 40) * q - Math.sin(q * Math.PI) * 10 };
};

/** Off to the right and up, `q` of the way. */
const leaving = (q: number, from: { x: number; y: number }) => ({
  x: from.x + (SCENE_W + 10 - from.x) * q,
  y: from.y - q * 60,
});

/** Where the bird is `since` s into friday, if it is about; `startled`, when the crow lands by
 *  the jar, sends it off then rather than when it has eaten. */
export const birdAt = (since: number, startled: number | null = null): TitPose | null => {
  if (!byDay(since)) return null;
  const c = cycleAt(since);
  const off = scaredAt(since, startled) ?? 13;
  const fluff = cold(since);
  if (c < 3) {
    return { ...arriving(c, 0, 3, PERCH), sit: false, peck: false, face: 1, dress: { fluff } };
  }
  if (c < off) {
    const fed = c > SEEDS[SEEDS.length - 1].eat;
    const feeding = fledging(since) && fed;
    // Each peck is a quick dip of the head as a seed disappears, or as it feeds the young.
    const peck =
      SEEDS.some((sd) => c > sd.eat - 0.18 && c < sd.eat + 0.06) ||
      (feeding && FEEDS.some((f) => c > f - 0.15 && c < f + 0.2));
    const singing = spring(since) && SONG.some((at) => c >= at && c < at + 0.5);
    // Turned to the fledgling to feed it; or, the lid clear, glancing about, unless it sings.
    const face = feeding ? -1 : fed && !singing && Math.floor(c * 2) % 3 === 0 ? -1 : 1;
    return { ...PERCH, sit: true, peck, face, dress: { fluff, open: singing } };
  }
  if (c < off + 4) {
    return { ...leaving((c - off) / 4, PERCH), sit: false, peck: false, face: 1, dress: { fluff } };
  }
  return null;
};

/** The fledgling's place on the lid, beside its parent. */
const NEST_SIDE = { x: PERCH.x - 9, y: PERCH.y + 1 };

/** The fledgling, in summer: in a beat behind its parent, beside it on the lid, begging. */
export const youngAt = (since: number, startled: number | null = null): TitPose | null => {
  if (!fledging(since) || !byDay(since)) return null;
  const c = cycleAt(since);
  const off = (scaredAt(since, startled) ?? 13) + 0.3;
  const young = { young: true };
  if (c < 0.6) return null;
  if (c < 3.6) {
    return { ...arriving(c, 0.6, 3.6, NEST_SIDE), sit: false, peck: false, face: 1, dress: young };
  }
  if (c < off) {
    // Begging: beak open at the parent, the more so as the parent turns to it.
    const fed = FEEDS.some((f) => c > f - 0.3 && c < f + 0.3);
    const open = fed || (c > 9 && Math.floor(c * 3) % 2 === 0);
    return { ...NEST_SIDE, sit: true, peck: false, face: 1, dress: { ...young, open } };
  }
  if (c < off + 4) {
    return { ...leaving((c - off) / 4, NEST_SIDE), sit: false, peck: false, face: 1, dress: young };
  }
  return null;
};
