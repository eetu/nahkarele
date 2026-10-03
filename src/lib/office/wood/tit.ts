// The great tit (talitiainen) that comes to the jar on friday. Every 26 s it flies in, perches
// on the lid, takes the seeds the drone drops one by one, glances about and is off. The crow
// landing by the jar sends it off early. Drawn in rects, facing right in a 10 x 8 box.

import { rect } from "$lib/scene/pixel";

import { SCENE_W } from "../engine";

/** The jar's lid, scene y: the desk's top (118) less the jar. */
const JAR_LID = 90;

const BIRD = {
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
) => {
  ctx.save();
  ctx.translate(Math.round(x) + (face < 0 ? 10 : 0), Math.round(y));
  ctx.scale(face, 1);
  const px = (c: string, dx: number, dy: number, w = 1, h = 1) => rect(ctx, c, dx, dy, w, h);
  px(BIRD.tail, 0, 4, 2, 1);
  px(BIRD.tail, 0, 5);
  px(BIRD.back, 2, 3, 5, 1);
  px(BIRD.belly, 3, 4, 4, 2);
  px(BIRD.cap, 6, 4, 1, 2);
  px(BIRD.underside, 4, 6, 3, 1);
  if (peck) {
    // Head down and forward, beak to the lid.
    px(BIRD.cap, 7, 3, 3, 3);
    px(BIRD.cheek, 8, 4, 2, 1);
    px(BIRD.beak, 10, 5);
  } else {
    px(BIRD.cap, 6, 1, 3, 3);
    px(BIRD.cheek, 7, 2, 2, 1);
    px(BIRD.beak, 9, 2);
  }
  if (flap === null) {
    px(BIRD.wing, 3, 3, 3, 1);
    px(BIRD.wingTip, 2, 4, 2, 1);
    px(BIRD.beak, 4, 7);
    px(BIRD.beak, 6, 7);
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

/** When in its cycle the bird is heard: on landing, at each seed, and taking off. */
const BIRD_CUES = [
  { at: 2.8, cue: "chirp" as const },
  ...SEEDS.map((sd) => ({ at: sd.eat - 0.1, cue: "peck" as const })),
  { at: 12.9, cue: "chirp" as const },
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
): "chirp" | "peck" | "alarm" | null => {
  if (to <= from) return null;
  const a = cycleAt(from);
  const b = cycleAt(to);
  const within = (at: number) => (a <= b ? at > a && at <= b : at > a || at <= b);
  const scared = scaredAt(to, startled);
  if (scared !== null && within(scared)) return "alarm";
  const hit = BIRD_CUES.find(({ at }) => within(at) && (scared === null || at < scared));
  return hit?.cue ?? null;
};

/** Where the bird is `since` s into friday, if it is about; `startled`, when the crow lands by
 *  the jar, sends it off then rather than when it has eaten. */
export const birdAt = (since: number, startled: number | null = null) => {
  const c = cycleAt(since);
  const off = scaredAt(since, startled) ?? 13;
  if (c < 3) {
    const q = c / 3;
    return {
      x: -10 + (PERCH.x + 10) * q,
      y: 40 + (PERCH.y - 40) * q - Math.sin(q * Math.PI) * 10,
      sit: false,
      peck: false,
      face: 1 as const,
    };
  }
  if (c < off) {
    // Each peck is a quick dip of the head as a seed disappears.
    const peck = SEEDS.some((sd) => c > sd.eat - 0.18 && c < sd.eat + 0.06);
    const fed = c > SEEDS[SEEDS.length - 1].eat;
    // Only once the lid is clear does it glance about.
    const face = fed && Math.floor(c * 2) % 3 === 0 ? -1 : 1;
    return { x: PERCH.x, y: PERCH.y, sit: true, peck, face: face as 1 | -1 };
  }
  if (c < off + 4) {
    const q = (c - off) / 4;
    return {
      x: PERCH.x + (SCENE_W + 10 - PERCH.x) * q,
      y: PERCH.y - q * 60,
      sit: false,
      peck: false,
      face: 1 as const,
    };
  }
  return null;
};
