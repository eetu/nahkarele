import { prefersReducedMotion } from "$lib/keys";
import { CALENDAR, drawCalendar } from "$lib/scene/calendar";
import { drawLedClock } from "$lib/scene/led";
import { rect } from "$lib/scene/pixel";
import { drawPixelText } from "$lib/scene/pixelfont";
import { clockAt, drawWindow, flash, mix, roomDarkness, type SkyInput } from "$lib/scene/sky";
import cake from "$lib/sprites/cake.json";
import drone from "$lib/sprites/drone.json";
import exit from "$lib/sprites/exit.json";
import fx from "$lib/sprites/fx.json";
import jar from "$lib/sprites/jar.json";
import screen from "$lib/sprites/screen.json";
import speaker from "$lib/sprites/speaker.json";
import specialist from "$lib/sprites/specialist.json";
import { bake, drawSprite, frameOf, type Sprite } from "$lib/sprites/sprite";
import token from "$lib/sprites/token.json";
import wc from "$lib/sprites/wc.json";

import {
  AI_MOUTH,
  DESK_CAPACITY,
  FALL_S,
  FLOOR_Y,
  FLY_S,
  type OfficeState,
  pay,
  pile,
  progress,
  SCENE_H,
  SCENE_W,
  TRAY,
} from "./engine";
import { drawAir, drawFloor, drawGarden } from "./wood/garden";
import { outsideOf } from "./wood/outside";
import { drawCreeperOver, overgrown } from "./wood/overgrowth";
import type { Knocks } from "./wood/stand";
import { drawWall, fixtureAt, type Rect, rubbleCue } from "./wood/wall";
import { windowAt } from "./wood/weather";
import { windAt } from "./wood/wind";

const S = {
  specialist: specialist as Sprite,
  jar: jar as Sprite,
  cake: cake as Sprite,
  drone: drone as Sprite,
  token: token as Sprite,
  fx: fx as Sprite,
  exit: exit as Sprite,
  wc: wc as Sprite,
  speaker: speaker as Sprite,
  screen: screen as Sprite,
};

/** What the room is doing beyond the messages: the blast, and friday. */
export type Mood = {
  /** Seconds since the blast, or null. */
  blast: number | null;
  /** Friday: the specialist is gone and the room is going back to nature. */
  after: boolean;
  /** Seconds since friday began, for the garden. */
  since: number;
  /** When the specialist last pressed something, for the typing frame. */
  pressedAt: number;
  /** Friday's wood grows from this: a new friday, a new stand of trees. */
  seed: number;
  /** Apples shaken down early, and when. */
  knocks: Knocks;
};

export const GLASS = { x: 126, y: 18, w: 68, h: 42 };
export const CLOCK = { x: 214, y: 24, w: 40, h: 16 };
/** The way out over the window; the toilet on the wall between AI #1 and the window. */
export const SIGNS = {
  exit: { x: 149, y: 4, w: S.exit.w, h: S.exit.h },
  wc: { x: 97, y: 24, w: S.wc.w, h: S.wc.h },
  // Not part of the job, so away from the door: top left, over the calendar.
  speaker: { x: 61, y: 4, w: S.speaker.w, h: S.speaker.h },
  screen: { x: 76, y: 4, w: S.screen.w, h: S.screen.h },
};
/** The wall calendar, on the wall between AI #1 and the toilet sign. */
const CALENDAR_AT = { x: 61, y: 24 };
/** The pay readout under the clock: the one number the job is really about. */
const PAY = { x: CLOCK.x, y: CLOCK.y + CLOCK.h + 5, w: CLOCK.w, h: 11 };

/**
 * What hangs on the back wall, as the wall knows it: each goes down with the piece it hangs
 * from (`wood/wall.ts`). The window fills an opening in the wall; the rest hang on it.
 */
const FIXTURES = {
  window: { x: GLASS.x - 2, y: GLASS.y - 2, w: GLASS.w + 4, h: GLASS.h + 4 },
  clock: { x: CLOCK.x - 2, y: CLOCK.y - 2, w: CLOCK.w + 4, h: CLOCK.h + 4 },
  pay: { x: PAY.x - 2, y: PAY.y - 2, w: PAY.w + 4, h: PAY.h + 4 },
  calendar: { x: CALENDAR_AT.x, y: CALENDAR_AT.y - 2, w: CALENDAR.w, h: CALENDAR.h + 2 },
  ...SIGNS,
};
type Fixture = keyof typeof FIXTURES;
const OPENINGS = ["window"];

/** Where fixture `name` is: on the wall where it always was, or, on friday, on its way down. */
const fixtureOf = (name: Fixture, mood: Mood) =>
  mood.after
    ? fixtureAt(name, mood.since, mood.seed, FIXTURES, OPENINGS)
    : { on: true, rect: FIXTURES[name] };

/** Where a sign is now, for its button. */
export const signAt = (name: keyof typeof SIGNS, mood: Mood): Rect => fixtureOf(name, mood).rect;

/** What came down off the wall between two moments of friday, and where: for the thuds. */
export const wallCue = (from: number, to: number, mood: Mood) =>
  rubbleCue(from, to, mood.seed, FIXTURES, OPENINGS);

/** What the wall signs show: the speaker's state, and fullscreen (null where unsupported). */
export type Signs = { muted: boolean; fullscreen: boolean | null };
const SLAB = { w: 44, top: 22, bottom: 150 };
const AI_X = { 1: 6, 2: SCENE_W - 6 - SLAB.w } as const;
const DESK = { x: 104, w: 112, y: 118 };

const C = {
  wall: "#b9c0c4",
  wallLow: "#8d969c",
  trim: "#6d767c",
  floor: "#474c56",
  floorLine: "#3c414a",
  frame: "#3d3a33",
  slab: "#0a0a0d",
  slabEdge: "#1c1d22",
  slabShine: "#2a2c33",
  plate: "#2f3136",
  plateText: "#d8dde2",
  desk: "#8a6a4a",
  deskFront: "#6f5238",
  deskEdge: "#4f3a28",
  chair: "#2a2d31",
  crt: "#9aa0a6",
  crtDark: "#6b7075",
  rune: "#b77cff",
  seed: "#e8d6a0",
};

const skyOf = (s: OfficeState, mood: Mood): SkyInput =>
  mood.after
    ? { t: mood.since, ...windowAt(mood.since), wind: windAt(mood.since, mood.seed) }
    : { t: s.t, progress: progress(s), weather: s.day.weather };

const drawRoom = (ctx: CanvasRenderingContext2D, s: OfficeState, mood: Mood) => {
  rect(ctx, C.wall, 0, 0, SCENE_W, 100);
  rect(ctx, C.trim, 0, 98, SCENE_W, 2);
  rect(ctx, C.wallLow, 0, 100, SCENE_W, FLOOR_Y - 100);
  rect(ctx, C.floor, 0, FLOOR_Y, SCENE_W, SCENE_H - FLOOR_Y);
  for (let y = FLOOR_Y + 6; y < SCENE_H; y += 8) rect(ctx, C.floorLine, 0, y, SCENE_W, 1);
  const sky = skyOf(s, mood);
  if (!mood.after) drawWindow(ctx, sky, GLASS, C.frame, { blast: mood.blast });
  else {
    // After the blast the wall comes down piece by piece, and the world outside shows through
    // the gaps and the window alike.
    const outside = outsideOf(sky, mood.since, mood.seed);
    drawWall(ctx, outside, mood.since, mood.seed, FIXTURES, OPENINGS);
    if (fixtureOf("window", mood).on) {
      const scenery = outside
        ? (c: CanvasRenderingContext2D) => c.drawImage(outside, 0, 0)
        : undefined;
      drawWindow(ctx, sky, GLASS, C.frame, { cracked: true, blast: mood.blast, scenery });
    }
  }
  // The clock's and the pay readout's housings; their digits are drawn after the room darkens,
  // so they stay lit.
  if (fixtureOf("clock", mood).on) drawHousing(ctx, FIXTURES.clock.x, FIXTURES.clock.y, CLOCK);
  if (fixtureOf("pay", mood).on) drawHousing(ctx, FIXTURES.pay.x, FIXTURES.pay.y, PAY);
  const left = mood.after ? null : s.day.messages - s.spawned;
  if (fixtureOf("calendar", mood).on)
    drawCalendar(ctx, CALENDAR_AT.x, CALENDAR_AT.y, s.day.name, left);
};

/** A readout's housing, its corner at `x`, `y`, for a face the size of `face`. */
const drawHousing = (ctx: CanvasRenderingContext2D, x: number, y: number, face: Rect) => {
  rect(ctx, C.frame, x, y, face.w + 4, face.h + 4);
  rect(ctx, "#140807", x + 1, y + 1, face.w + 2, face.h + 2);
};

/** The window as it lands: its frame, the panes empty but for a few shards. */
const drawFallenWindow = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  const { w, h } = FIXTURES.window;
  rect(ctx, C.frame, x, y, w, 2);
  rect(ctx, C.frame, x, y + h - 2, w, 2);
  rect(ctx, C.frame, x, y, 2, h);
  rect(ctx, C.frame, x + w - 2, y, 2, h);
  rect(ctx, C.frame, x + Math.floor(w / 2) - 1, y, 2, h);
  rect(ctx, C.frame, x, y + Math.floor(h / 2) - 1, w, 2);
  for (const [dx, dy, len] of [
    [2, 2, 5],
    [w - 7, 2, 4],
    [2, h - 4, 3],
    [Math.floor(w / 2) + 1, Math.floor(h / 2) + 1, 4],
  ]) {
    for (let k = 0; k < len; k++) rect(ctx, "#9aa8b4", x + dx + k, y + dy + (k % 2), 1, 1);
  }
};

/**
 * A fixture that has come off the wall, drawn where it is, its corner at `x`, `y`: the clock
 * still showing 12:00, the readout its dashes. The signs are drawn with the room's other signs.
 */
const drawFallen =
  (since: number) => (ctx: CanvasRenderingContext2D, name: string, x: number, y: number) => {
    if (name === "window") drawFallenWindow(ctx, x, y);
    else if (name === "clock") {
      drawHousing(ctx, x, y, CLOCK);
      drawLedClock(ctx, { ...CLOCK, x: x + 2, y: y + 2 }, "12:00", since, true);
    } else if (name === "pay") {
      drawHousing(ctx, x, y, PAY);
      drawPixelText(ctx, "-.--€", x + 2 + PAY.w - 2, y + 4, "#3a1410", { align: "right" });
    } else if (name === "calendar") drawCalendar(ctx, x, y + 2, "fri", null);
  };

/** Salary so far in red segments' colours, or a dead readout on friday. */
const drawPay = (ctx: CanvasRenderingContext2D, s: OfficeState, mood: Mood) => {
  const text = mood.after ? "-.--€" : `${pay(s).salary.toFixed(2)}€`;
  drawPixelText(ctx, text, PAY.x + PAY.w - 2, PAY.y + 2, mood.after ? "#3a1410" : "#ff3b2a", {
    align: "right",
  });
};

// --- The AIs ------------------------------------------------------------------------

const drawSlab = (ctx: CanvasRenderingContext2D, ai: 1 | 2, s: OfficeState, mood: Mood) => {
  const x = AI_X[ai];
  const { w, top, bottom } = SLAB;
  rect(ctx, C.slabEdge, x - 1, top - 1, w + 2, bottom - top + 1);
  rect(ctx, C.slab, x, top, w, bottom - top);
  rect(ctx, C.slabShine, x + 2, top + 2, 1, bottom - top - 20);
  // The status light: a slow breath, bright while this AI is sending or receiving.
  const active = s.envelopes.some(
    (e) => (e.stage === "fly-in" && e.from === ai) || (e.stage === "fly-out" && e.to === ai),
  );
  const breath = 0.35 + 0.25 * Math.sin((mood.after ? mood.since : s.t) * 2 + ai);
  // Under the ivy, the light goes out.
  const dim = mood.after ? 1 - overgrown(mood.since) * 0.85 : 1;
  ctx.globalAlpha = (active ? 1 : breath) * dim;
  rect(ctx, "#57b6ff", x + w / 2 - 1, top + 30, 2, 40);
  ctx.globalAlpha = 1;
  if (mood.after) {
    // Runes, scrolling up the face of the slab.
    ctx.font = "5px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "top";
    const runes = "⟁⌬⍟⎔⏣⌖⍜⎊⌾⍉⏧⟟";
    for (let i = 0; i < 9; i++) {
      const y = top + 4 + ((i * 13 - mood.since * 8 + 400) % (bottom - top - 24));
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(mood.since * 3 + i);
      ctx.fillStyle = C.rune;
      ctx.fillText(
        runes[(i + ai * 3 + Math.floor(mood.since)) % runes.length],
        x + 6 + (i % 3) * 12,
        y,
      );
    }
    ctx.globalAlpha = 1;
  }
  rect(ctx, C.plate, x + 6, bottom - 16, w - 12, 9);
  ctx.fillStyle = C.plateText;
  ctx.font = "600 6px 'Space Grotesk', Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(`AI #${ai}`, x + w / 2, bottom - 15);
  ctx.textAlign = "left";
  if (mood.after) drawCreeperOver(ctx, x, top, bottom, w, mood.since, mood.seed);
};

/** Friday's AIs talk directly: a crackling arc over the empty desk. */
const drawArc = (ctx: CanvasRenderingContext2D, since: number) => {
  const from = AI_X[1] + SLAB.w;
  const to = AI_X[2];
  ctx.strokeStyle = C.rune;
  // The arc fades as the ivy takes the slabs.
  ctx.globalAlpha = (0.6 + 0.4 * Math.sin(since * 11)) * (1 - overgrown(since));
  ctx.beginPath();
  ctx.moveTo(from, 70);
  for (let x = from; x <= to; x += 6) {
    const y =
      70 - Math.sin(((x - from) / (to - from)) * Math.PI) * 14 + Math.sin(x * 1.7 + since * 20) * 2;
    ctx.lineTo(x, Math.round(y) + 0.5);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
};

// --- Desk, specialist, jar ------------------------------------------------------------

const drawDesk = (ctx: CanvasRenderingContext2D, s: OfficeState, mood: Mood) => {
  const { x, w, y } = DESK;
  // Chair back, then whoever sits in it.
  if (!mood.after) rect(ctx, C.chair, 146, 84, 28, y - 84);
  if (!mood.after && !s.away) {
    const typing = s.t - mood.pressedAt < 0.2;
    const frame = typing ? 2 : frameOf(S.specialist, "idle", s.t * 3);
    drawSprite(ctx, S.specialist, 148, y - 26, { frame });
  }
  rect(ctx, C.deskEdge, x - 1, y - 1, w + 2, 3);
  rect(ctx, C.desk, x, y, w, 4);
  rect(ctx, C.deskFront, x + 2, y + 4, w - 4, FLOOR_Y - y - 4);
  rect(ctx, C.deskEdge, x + 2, y + 4, w - 4, 1);
  rect(ctx, C.deskEdge, x + w / 2 - 1, y + 8, 2, FLOOR_Y - y - 12);
  // The back of a CRT on the left, the input box on the right.
  rect(ctx, C.crtDark, x + 6, y - 20, 24, 20);
  rect(ctx, C.crt, x + 8, y - 18, 20, 16);
  rect(ctx, C.crtDark, x + 12, y - 6, 12, 1);
  rect(ctx, C.crtDark, x + w - 18, y - 5, 14, 5);
  for (let i = 0; i < 3; i++) rect(ctx, C.crt, x + w - 16 + i * 4, y - 4, 2, 2);
  // In-tray, beside the specialist.
  rect(ctx, C.deskEdge, TRAY.x - 3, y - 3, 15, 1);
  rect(ctx, C.deskEdge, TRAY.x - 3, y - 3, 1, 3);
  rect(ctx, C.deskEdge, TRAY.x + 11, y - 3, 1, 3);
  if (mood.after) {
    const frame = frameOf(S.jar, "bubble", mood.since * 1.5);
    drawSprite(ctx, S.jar, 151, y - 20, { frame });
    // Between the CRT and the jar: as promised.
    drawSprite(ctx, S.cake, 137, y - S.cake.h, {
      frame: frameOf(S.cake, "flicker", mood.since * 6),
    });
  }
};

// --- Tokens: in flight, piled, fallen, carried -----------------------------------

/** Height a token adds to the pile when it lies flat. */
const TOKEN_STEP = 2;

/** A token seen face-on, spinning: the face squashed to |cos| of its turn. */
const drawSpinning = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  turn: number,
  variant?: string,
) => {
  const face = bake(S.token, frameOf(S.token, "face", 0), variant);
  const w = Math.max(1, Math.round(S.token.w * Math.abs(Math.cos(turn))));
  ctx.drawImage(face, Math.round(x + (S.token.w - w) / 2), Math.round(y), w, S.token.h);
};

const drawFlat = (ctx: CanvasRenderingContext2D, x: number, y: number, variant?: string) => {
  drawSprite(ctx, S.token, x, y, { frame: frameOf(S.token, "edge", 0), variant });
};

const drawTokens = (ctx: CanvasRenderingContext2D, s: OfficeState) => {
  const variant = s.day.task === "ok" ? "glyph" : undefined;
  const tray = { x: TRAY.x, y: TRAY.y - 5 };
  // The pile: a column of tokens lying flat, oldest at the bottom, a little uneven.
  pile(s).forEach((e, i) => {
    const skew = ((e.id * 7) % 3) - 1;
    drawFlat(ctx, tray.x + skew, tray.y - i * TOKEN_STEP, variant);
  });
  for (const e of s.envelopes) {
    const age = s.t - e.stageAt;
    const p = Math.min(1, age / FLY_S);
    if (e.stage === "fly-in" || e.stage === "fly-out") {
      const [a, b] = e.stage === "fly-in" ? [AI_MOUTH[e.from], tray] : [tray, AI_MOUTH[e.to]];
      const x = a.x + (b.x - a.x) * p;
      const y = a.y + (b.y - a.y) * p - Math.sin(p * Math.PI) * 22;
      drawSpinning(ctx, x, y, age * 14 + e.id, variant);
    } else if (e.stage === "direct") {
      // Nobody at the desk: straight across, and a little higher.
      const [a, b] = [AI_MOUTH[e.from], AI_MOUTH[e.to]];
      const x = a.x + (b.x - a.x) * p;
      const y = a.y + (b.y - a.y) * p - Math.sin(p * Math.PI) * 30;
      drawSpinning(ctx, x, y, age * 14 + e.id, variant);
    } else if (e.stage === "falling") {
      const q = Math.min(1, age / FALL_S);
      const top = tray.y - DESK_CAPACITY * TOKEN_STEP;
      const x = tray.x + (e.x - tray.x) * q;
      const y = top + (FLOOR_Y + 4 - top) * q * q;
      drawSpinning(ctx, x, y, age * 20 + e.id, variant);
    } else if (e.stage === "floor") {
      drawFlat(ctx, e.x, FLOOR_Y + 4, variant);
    }
  }
};

/** The assistant drone on working days: fetches whatever falls and delivers it. */
const drawDrone = (ctx: CanvasRenderingContext2D, s: OfficeState) => {
  const { drone: d } = s;
  drawSprite(ctx, S.drone, d.x - 7, d.y, { frame: frameOf(S.drone, "hover", s.t * 16) });
  if (d.carrying !== null) {
    const variant = s.day.task === "ok" ? "glyph" : undefined;
    drawSpinning(ctx, d.x - 4, d.y + 7, s.t * 6, variant);
  }
};

const drawVerdict = (ctx: CanvasRenderingContext2D, s: OfficeState) => {
  if (!s.last) return;
  const age = s.t - s.last.at;
  if (age > 0.45) return;
  drawSprite(ctx, S.fx, TRAY.x + 1, TRAY.y - 24 - age * 16, {
    frame: frameOf(S.fx, "sparkle", age / 0.15),
    variant: s.last.verdict === "correct" ? undefined : "red",
  });
};

// --- Friday's visitors ---------------------------------------------------------------

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
const drawBird = (
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
const PERCH = { x: 151, y: DESK.y - 28 };
/** Seeds the drone drops onto the jar lid, in front of the bird's beak. */
const SEEDS = [161, 163, 162, 164, 161].map((x, k) => ({
  x,
  y: DESK.y - 21,
  drop: 5.2 + k * 0.35,
  eat: 7 + k * 0.9,
}));
const SEED_FALL_S = 0.45;
const cycleAt = (since: number) => (since + 6) % CYCLE_S;

/** When in its cycle the bird is heard: on landing, at each seed, and taking off. */
const BIRD_CUES = [
  { at: 2.8, cue: "chirp" as const },
  ...SEEDS.map((sd) => ({ at: sd.eat - 0.1, cue: "peck" as const })),
  { at: 12.9, cue: "chirp" as const },
];

/** What the bird says between two moments of friday, if anything. */
export const birdCue = (from: number, to: number): "chirp" | "peck" | null => {
  if (to <= from) return null;
  const a = cycleAt(from);
  const b = cycleAt(to);
  const hit = BIRD_CUES.find(({ at }) => (a <= b ? at > a && at <= b : at > a || at <= b));
  return hit?.cue ?? null;
};

const birdAt = (since: number) => {
  const c = cycleAt(since);
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
  if (c < 13) {
    // Each peck is a quick dip of the head as a seed disappears.
    const peck = SEEDS.some((sd) => c > sd.eat - 0.18 && c < sd.eat + 0.06);
    const fed = c > SEEDS[SEEDS.length - 1].eat;
    // Only once the lid is clear does it glance about.
    const face = fed && Math.floor(c * 2) % 3 === 0 ? -1 : 1;
    return { x: PERCH.x, y: PERCH.y, sit: true, peck, face: face as 1 | -1 };
  }
  if (c < 17) {
    const q = (c - 13) / 4;
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

const drawVisitors = (ctx: CanvasRenderingContext2D, since: number) => {
  const b = birdAt(since);
  const perched = b?.sit ?? false;
  const c = cycleAt(since);
  // The drone idles about the room, and drifts over the jar to feed the bird when it lands.
  const idle = { x: 160 + Math.sin(since * 0.21) * 90, y: 44 + Math.sin(since * 0.37) * 10 };
  const feed = perched ? Math.min(1, (c - 3) / 2) : c >= 13 && c < 16 ? 1 - (c - 13) / 3 : 0;
  const dx = idle.x + (163 - idle.x) * feed;
  const dy = idle.y + (DESK.y - 50 - idle.y) * feed + Math.sin(since * 3) * 1.5;
  drawSprite(ctx, S.drone, dx - 7, dy, { frame: frameOf(S.drone, "hover", since * 16) });
  if (perched) {
    ctx.fillStyle = C.seed;
    for (const sd of SEEDS) {
      if (c < sd.drop || c > sd.eat) continue;
      const q = Math.min(1, (c - sd.drop) / SEED_FALL_S);
      const from = { x: dx - 1, y: dy + 8 };
      const x = from.x + (sd.x - from.x) * q;
      const y = from.y + (sd.y - from.y) * q * q;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  if (b) drawBird(ctx, b.x, b.y, b.sit ? null : since * 18, b.face, b.peck);
};

/** Paint one frame. `ctx` is already scaled so one unit is one scene pixel. */
export const drawOffice = (
  ctx: CanvasRenderingContext2D,
  s: OfficeState,
  mood: Mood,
  signs: Signs,
) => {
  ctx.imageSmoothingEnabled = false;
  const sky = skyOf(s, mood);
  const shake =
    !prefersReducedMotion() && mood.blast !== null && mood.blast < 1.5
      ? Math.round(Math.sin(mood.blast * 60) * (1.5 - mood.blast))
      : 0;
  ctx.save();
  ctx.translate(shake, 0);
  drawRoom(ctx, s, mood);
  const dark = roomDarkness(sky) + (mood.after ? 0.15 : 0);
  if (dark > 0) {
    ctx.globalAlpha = dark;
    rect(ctx, "#0a0f1c", 0, 0, SCENE_W, SCENE_H);
    ctx.globalAlpha = 1;
  }
  if (!mood.after) drawLedClock(ctx, CLOCK, clockAt(progress(s)), sky.t);
  else if (fixtureOf("clock", mood).on) drawLedClock(ctx, CLOCK, "12:00", mood.since, true);
  if (fixtureOf("pay", mood).on) drawPay(ctx, s, mood);
  if (mood.after) {
    drawGarden(ctx, mood, {
      fixtures: FIXTURES,
      openings: OPENINGS,
      draw: drawFallen(mood.since),
    });
  }
  // Lit signs, so they read in the dark, and through friday's leaves: the speaker and the screen
  // show their state. On friday they hang where the wall still holds them, or lie where they fell.
  const sign = (name: keyof typeof SIGNS) => fixtureOf(name, mood).rect;
  drawSprite(ctx, S.exit, sign("exit").x, sign("exit").y);
  drawSprite(ctx, S.wc, sign("wc").x, sign("wc").y);
  drawSprite(ctx, S.speaker, sign("speaker").x, sign("speaker").y, { frame: signs.muted ? 1 : 0 });
  if (signs.fullscreen !== null) {
    drawSprite(ctx, S.screen, sign("screen").x, sign("screen").y, {
      frame: signs.fullscreen ? 1 : 0,
    });
  }
  drawSlab(ctx, 1, s, mood);
  drawSlab(ctx, 2, s, mood);
  drawDesk(ctx, s, mood);
  if (mood.after) {
    drawArc(ctx, mood.since);
    drawFloor(ctx, mood);
    drawVisitors(ctx, mood.since);
    drawAir(ctx, mood);
  } else {
    drawTokens(ctx, s);
    drawDrone(ctx, s);
    drawVerdict(ctx, s);
  }
  ctx.restore();
  const bolt = flash(sky);
  const blastFlash = mood.blast !== null ? Math.max(0, 1 - mood.blast / 0.6) : 0;
  const white = Math.max(bolt * 0.18, blastFlash * 0.9);
  if (white > 0) {
    ctx.globalAlpha = white;
    rect(ctx, mix("#f4f6ff", "#fff4d8", blastFlash), 0, 0, SCENE_W, SCENE_H);
    ctx.globalAlpha = 1;
  }
};
