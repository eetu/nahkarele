import { rgb } from "@anarkisti/korpi/core";
import { further, type Light, type PointLight, rgb3, toward } from "@anarkisti/korpi/light";
import { resolve } from "@anarkisti/korpi/light/paint";
import type { Knock } from "@anarkisti/korpi/masonry";
import {
  clear,
  lit,
  type Pen,
  type Raster,
  rasterPen,
  shifted,
  wash,
} from "@anarkisti/korpi/paint";

import { prefersReducedMotion } from "$lib/keys";
import { CALENDAR, paintCalendar } from "$lib/scene/calendar";
import { drawLedClock, LIT as LED } from "$lib/scene/led";
import { colourOf, fadedPen, fill, fillFaded } from "$lib/scene/pen";
import { paintText } from "$lib/scene/pixelfont";
import {
  clockAt,
  daylight,
  flash,
  mix,
  paintWindow,
  roomDarkness,
  type SkyInput,
} from "$lib/scene/sky";
import cake from "$lib/sprites/cake.json";
import drone from "$lib/sprites/drone.json";
import exit from "$lib/sprites/exit.json";
import fx from "$lib/sprites/fx.json";
import jar from "$lib/sprites/jar.json";
import screen from "$lib/sprites/screen.json";
import speaker from "$lib/sprites/speaker.json";
import specialist from "$lib/sprites/specialist.json";
import { frameOf, paintSprite, type Sprite } from "$lib/sprites/sprite";
import token from "$lib/sprites/token.json";
import wc from "$lib/sprites/wc.json";

import { dockAt, drawBox, drawChargerAt, drawChargerLightAt, PAD } from "./charger";
import { at, covered, FLAT, floorZ, footAt, onFloor, ROOM_VIEW, Z } from "./depth";
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
import { crowAtJar, crowCue } from "./wood/crow";
import { drawAir, drawGarden, drawGlow, drawLife } from "./wood/garden";
import { firefliesAt } from "./wood/life";
import { OUTSIDE_NIGHT, outsideNight, paintOutside } from "./wood/outside";
import { drawCreeperOver, overgrown } from "./wood/overgrowth";
import type { Knocks } from "./wood/stand";
import {
  birdAt,
  birdCue as titCue,
  cycleAt,
  drawBird,
  SEED_FALL_S,
  SEEDS,
  youngAt,
} from "./wood/tit";
import {
  fallenAt,
  fallRank,
  fixtureAt,
  grimed,
  landOf,
  paintWall,
  pokeAt,
  type Rect,
  rubbleCue,
  type Setting,
} from "./wood/wall";
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
  /** Blocks poked out of the back wall, in time order. */
  pokes: Knock[];
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

/** Where fixture `name` is: on the wall where it always was, or, on friday, on its way down. */
const fixtureOf = (name: Fixture, mood: Mood) =>
  mood.after
    ? fixtureAt(name, mood.since, mood.seed, wallOf(mood))
    : { on: true, rect: FIXTURES[name] };

/** Where a sign is now, for its button. */
export const signAt = (name: keyof typeof SIGNS, mood: Mood): Rect => fixtureOf(name, mood).rect;

/** How far in front of what came down before it a fixture lands, m. */
const LATER = 1e-4;

/** How far out from the wall fixture `name` is, m, where `rect` has it: hung, or on its way
 *  out from the wall down to the floor it lands on, and standing there. */
const fixtureZ = (name: Fixture, rect: Rect, mood: Mood) => {
  const from = FIXTURES[name].y + FIXTURES[name].h;
  if (!mood.after || rect.y + rect.h <= from) return Z.hung;
  const wall = wallOf(mood);
  const land = landOf(name, mood.seed, wall);
  const down = Math.min(1, (rect.y + rect.h - from) / (land - from));
  const z = floorZ(land) + LATER * fallRank(name, mood.seed, wall);
  return Z.hung + (z - Z.hung) * down;
};

/** What came down off the wall between two moments of friday, and where: for the thuds. */
export const wallCue = (from: number, to: number, mood: Mood) =>
  rubbleCue(from, to, mood.seed, wallOf(mood));

/** What the wall signs show: the speaker's state, and fullscreen (null where unsupported). */
export type Signs = { muted: boolean; fullscreen: boolean | null };
/** An AI's slab: its face from `top` down to `foot`, where it meets the floor (`Z.slab` out);
 *  what is on the face is set from `bottom`. */
const SLAB = { w: 44, top: 32, bottom: 150, foot: 153 };
const AI_X = { 1: 6, 2: SCENE_W - 6 - SLAB.w } as const;
/** The desk: its top at `y`, its front down to `foot`, where it meets the floor (`Z.desk` out). */
const DESK = { x: 104, w: 112, y: 118, foot: 154 };

/** What the wall knows of the room: what hangs on it, and what stands in front of it. */
export const WALL: Setting = {
  fixtures: FIXTURES,
  openings: ["window"],
  before: ["exit"],
  fronts: [
    ...[AI_X[1], AI_X[2]].map((x) => ({
      x: x - 1,
      y: SLAB.top,
      w: SLAB.w + 2,
      h: SLAB.foot - SLAB.top,
    })),
    { x: DESK.x - 1, y: DESK.y, w: DESK.w + 2, h: DESK.foot - DESK.y },
  ],
};

let poked: { pokes: Knock[]; wall: Setting } | null = null;

/** The wall as friday has it: the room's, with the pokes it has taken. */
export const wallOf = (mood: Mood): Setting => {
  if (!mood.pokes.length) return WALL;
  if (poked?.pokes !== mood.pokes)
    poked = { pokes: mood.pokes, wall: { ...WALL, knocks: mood.pokes } };
  return poked.wall;
};

/** A poke at scene `x`, `y` on friday: the blow it gives the wall, or null for none. */
export const pokeOf = (x: number, y: number, mood: Mood) =>
  mood.after ? pokeAt(x, y, mood.since, mood.seed, wallOf(mood)) : null;

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

/**
 * The room itself: the walls and the floor; on friday the world outside far behind the wall
 * and the wall as it comes down, before what hangs on it, the window, the readouts' housings
 * and the calendar.
 */
const paintRoom = (scene: Raster, pen: Pen, s: OfficeState, mood: Mood, sky: SkyInput) => {
  // Friday's ruin is grimy, the walls and the floor and what hangs there.
  const ruin = (p: Pen) => (mood.after ? grimed(p) : p);
  const wall = ruin(pen);
  // Friday's back wall is masonry, painted whole; before it, a plain one.
  if (!mood.after) fill(wall, C.wall, 0, 0, SCENE_W, 98);
  else fill(wall, C.wall, 0, 97, SCENE_W, 1);
  fill(wall, C.trim, 0, 98, SCENE_W, 2);
  fill(wall, C.wallLow, 0, 100, SCENE_W, FLOOR_Y - 100);
  const floor = ruin(onFloor(pen, FLAT.floor));
  fill(floor, C.floor, 0, FLOOR_Y, SCENE_W, SCENE_H - FLOOR_Y);
  for (let y = FLOOR_Y + 6; y < SCENE_H; y += 8) fill(floor, C.floorLine, 0, y, SCENE_W, 1);
  const hung = ruin(at(pen, Z.hung));
  if (!mood.after) paintWindow(hung, sky, GLASS, C.frame, { blast: mood.blast });
  else {
    // After the blast the wall comes down piece by piece, and the world outside shows through
    // the gaps and the window alike.
    paintOutside(scene, sky, mood.since, mood.seed);
    paintWall(scene, ROOM_VIEW, mood.since, mood.seed, wallOf(mood));
    if (fixtureOf("window", mood).on)
      paintWindow(hung, sky, GLASS, C.frame, { cracked: true, blast: mood.blast, open: true });
  }
  if (fixtureOf("clock", mood).on) paintHousing(hung, FIXTURES.clock.x, FIXTURES.clock.y, CLOCK);
  if (fixtureOf("pay", mood).on) paintHousing(hung, FIXTURES.pay.x, FIXTURES.pay.y, PAY);
  const left = mood.after ? null : s.day.messages - s.spawned;
  if (fixtureOf("calendar", mood).on)
    paintCalendar(hung, CALENDAR_AT.x, CALENDAR_AT.y, s.day.name, left);
};

/** A readout's housing, its corner at `x`, `y`, for a face the size of `face`. */
const paintHousing = (pen: Pen, x: number, y: number, face: Rect) => {
  fill(pen, C.frame, x, y, face.w + 4, face.h + 4);
  fill(pen, "#140807", x + 1, y + 1, face.w + 2, face.h + 2);
};

/** The window as it lands: its frame, the panes empty but for a few shards. */
const paintFallenWindow = (pen: Pen, x: number, y: number) => {
  const { w, h } = FIXTURES.window;
  fill(pen, C.frame, x, y, w, 2);
  fill(pen, C.frame, x, y + h - 2, w, 2);
  fill(pen, C.frame, x, y, 2, h);
  fill(pen, C.frame, x + w - 2, y, 2, h);
  fill(pen, C.frame, x + Math.floor(w / 2) - 1, y, 2, h);
  fill(pen, C.frame, x, y + Math.floor(h / 2) - 1, w, 2);
  for (const [dx, dy, len] of [
    [2, 2, 5],
    [w - 7, 2, 4],
    [2, h - 4, 3],
    [Math.floor(w / 2) + 1, Math.floor(h / 2) + 1, 4],
  ]) {
    for (let k = 0; k < len; k++) fill(pen, "#9aa8b4", x + dx + k, y + dy + (k % 2), 1, 1);
  }
};

/**
 * What has come off the wall `since` seconds into friday, where it is, among the stones: the
 * clock still showing 12:00, the readout its dashes. The signs are painted with the room's
 * other signs.
 */
const paintFallen = (pen: Pen, mood: Mood) => {
  for (const { name, rect } of fallenAt(mood.since, mood.seed, wallOf(mood))) {
    if (name in SIGNS) continue;
    const { x, y } = rect;
    const into = at(pen, fixtureZ(name as Fixture, rect, mood));
    const body = grimed(into);
    if (name === "window") paintFallenWindow(body, x, y);
    else if (name === "clock") {
      paintHousing(body, x, y, CLOCK);
      drawLedClock(into, { ...CLOCK, x: x + 2, y: y + 2 }, "12:00", mood.since, true);
    } else if (name === "pay") {
      paintHousing(body, x, y, PAY);
      paintText(into, "-.--€", x + 2 + PAY.w - 2, y + 4, "#3a1410", { align: "right" });
    } else if (name === "calendar") paintCalendar(body, x, y + 2, "fri", null);
  }
};

/** Salary so far in red segments' colours, or a dead readout on friday. */
const paintPay = (pen: Pen, s: OfficeState, mood: Mood) => {
  const text = mood.after ? "-.--€" : `${pay(s).salary.toFixed(2)}€`;
  // The salary lights itself; friday's dashes are a dead readout's.
  const ink = mood.after ? pen : lit(pen);
  paintText(ink, text, PAY.x + PAY.w - 2, PAY.y + 2, mood.after ? "#3a1410" : "#ff3b2a", {
    align: "right",
  });
};

// --- The AIs ------------------------------------------------------------------------

/** Runes, scrolling up the face of a slab on friday: from the glyphs the face carries. */
const RUNES = "#%&*+=@$?<>^";

const paintSlab = (pen: Pen, ai: 1 | 2, s: OfficeState, mood: Mood) => {
  const x = AI_X[ai];
  const { w, top, bottom, foot } = SLAB;
  const slab = at(pen, Z.slab);
  fill(slab, C.slabEdge, x - 1, top - 1, w + 2, foot - top + 1);
  fill(slab, C.slab, x, top, w, foot - top);
  fill(slab, C.slabShine, x + 2, top + 2, 1, bottom - top - 20);
  // On its face: the status light, a slow breath, bright while this AI is sending or receiving.
  const face = at(pen, Z.slabFace);
  const active = s.envelopes.some(
    (e) => (e.stage === "fly-in" && e.from === ai) || (e.stage === "fly-out" && e.to === ai),
  );
  const breath = 0.35 + 0.25 * Math.sin((mood.after ? mood.since : s.t) * 2 + ai);
  // Under the ivy, the light goes out.
  const dim = mood.after ? 1 - overgrown(mood.since) * 0.85 : 1;
  const glowing = lit(face);
  fillFaded(glowing, "#57b6ff", (active ? 1 : breath) * dim, x + w / 2 - 1, top + 30, 2, 40);
  if (mood.after) {
    for (let i = 0; i < 9; i++) {
      const span = bottom - top - 24;
      const y = top + 4 + ((((i * 13 - mood.since * 8) % span) + span) % span);
      const alpha = 0.5 + 0.5 * Math.sin(mood.since * 3 + i);
      const rune = RUNES[(i + ai * 3 + Math.floor(mood.since)) % RUNES.length];
      paintText(fadedPen(glowing, alpha), rune, x + 6 + (i % 3) * 12, Math.round(y), C.rune);
    }
  }
  fill(face, C.plate, x + 6, bottom - 16, w - 12, 9);
  paintText(face, `AI #${ai}`, x + w / 2, bottom - 15, C.plateText, { align: "center" });
  // The ivy comes up from its foot, as high as the face is from `bottom`.
  const ivy = at(pen, Z.ivy);
  if (mood.after) drawCreeperOver(ivy, x, top + foot - bottom, foot, w, mood.since, mood.seed);
};

/** Friday's AIs talk directly: a crackling arc over the empty desk, face to face. */
const paintArc = (pen: Pen, since: number) => {
  const from = AI_X[1] + SLAB.w;
  const to = AI_X[2];
  // The arc fades as the ivy takes the slabs.
  const alpha = (0.6 + 0.4 * Math.sin(since * 11)) * (1 - overgrown(since));
  if (alpha <= 0) return;
  const c = colourOf(C.rune);
  const ink = fadedPen(lit(at(pen, Z.slab)), alpha);
  const rowAt = (x: number) =>
    Math.round(
      70 - Math.sin(((x - from) / (to - from)) * Math.PI) * 14 + Math.sin(x * 1.7 + since * 20) * 2,
    );
  const pts: [number, number][] = [[from, 70]];
  for (let x = from; x <= to; x += 6) pts.push([x, rowAt(x)]);
  // One pixel a column, joined where a step climbs more than one row.
  let [px, py] = pts[0];
  for (const [x, y] of pts.slice(1)) {
    for (let cx = px; cx < x; cx++) {
      const u = (cx - px) / (x - px);
      const cy = Math.round(py + (y - py) * u);
      const next = Math.round(py + (y - py) * Math.min(1, (cx + 1 - px) / (x - px)));
      ink.fill(c, cx, Math.min(cy, next), 1, Math.abs(next - cy) + 1);
    }
    [px, py] = [x, y];
  }
};

// --- Desk, specialist, jar ------------------------------------------------------------

const paintDesk = (pen: Pen, s: OfficeState, mood: Mood) => {
  const { x, w, y, foot } = DESK;
  // Behind it, the chair back, then whoever sits in it.
  const chair = at(pen, Z.chair);
  if (!mood.after) fill(chair, C.chair, 146, 84, 28, y - 84);
  if (!mood.after && !s.away) {
    const typing = s.t - mood.pressedAt < 0.2;
    const frame = typing ? 2 : frameOf(S.specialist, "idle", s.t * 3);
    paintSprite(chair, S.specialist, 148, y - 26, { frame });
  }
  // The top's back edge under what stands on it; the rest of the top, and the front.
  const desk = at(pen, Z.desk);
  fill(at(pen, Z.deskBack), C.deskEdge, x - 1, y - 1, w + 2, 1);
  fill(desk, C.deskEdge, x - 1, y, w + 2, 2);
  fill(desk, C.desk, x, y, w, 4);
  fill(desk, C.deskFront, x + 2, y + 4, w - 4, foot - y - 4);
  fill(desk, C.deskEdge, x + 2, y + 4, w - 4, 1);
  fill(desk, C.deskEdge, x + w / 2 - 1, y + 8, 2, foot - y - 12);
  // On it: the back of a CRT on the left, the input box on the right.
  const on = at(pen, Z.onDesk);
  fill(on, C.crtDark, x + 6, y - 20, 24, 20);
  fill(on, C.crt, x + 8, y - 18, 20, 16);
  fill(on, C.crtDark, x + 12, y - 6, 12, 1);
  // The box at its right end; on friday, the drone's charger.
  if (mood.after) {
    drawChargerAt(on, mood.since);
    drawChargerLightAt(lit(on), mood.since);
  } else drawBox(on);
  // In-tray, beside the specialist.
  fill(on, C.deskEdge, TRAY.x - 3, y - 3, 15, 1);
  fill(on, C.deskEdge, TRAY.x - 3, y - 3, 1, 3);
  fill(on, C.deskEdge, TRAY.x + 11, y - 3, 1, 3);
  if (mood.after) {
    const frame = frameOf(S.jar, "bubble", mood.since * 1.5);
    paintSprite(on, S.jar, 151, y - 20, { frame });
    // Between the CRT and the jar: as promised.
    paintSprite(on, S.cake, 137, y - S.cake.h, {
      frame: frameOf(S.cake, "flicker", mood.since * 6),
    });
  }
};

// --- Tokens: in flight, piled, fallen, carried -----------------------------------

/** Height a token adds to the pile when it lies flat. */
const TOKEN_STEP = 2;

/** A token seen face-on, spinning: the face squashed to |cos| of its turn. */
const paintSpinning = (pen: Pen, x: number, y: number, turn: number, variant?: string) => {
  const w = Math.max(1, Math.round(S.token.w * Math.abs(Math.cos(turn))));
  paintSprite(pen, S.token, x, y, { frame: frameOf(S.token, "face", 0), variant, w });
};

const paintFlat = (pen: Pen, x: number, y: number, variant?: string) => {
  paintSprite(pen, S.token, x, y, { frame: frameOf(S.token, "edge", 0), variant });
};

/** Where a token that slid off the tray comes to rest, its top; it lies on its lowest row. */
const ON_FLOOR = FLOOR_Y + 4;
const ON_FLOOR_FOOT = ON_FLOOR + S.token.h - 1;

const paintTokens = (pen: Pen, s: OfficeState) => {
  const variant = s.day.task === "ok" ? "glyph" : undefined;
  const tray = { x: TRAY.x, y: TRAY.y - 5 };
  // The pile: a column of tokens lying flat, oldest at the bottom, a little uneven.
  const onDesk = at(pen, Z.onDesk);
  pile(s).forEach((e, i) => {
    const skew = ((e.id * 7) % 3) - 1;
    paintFlat(onDesk, tray.x + skew, tray.y - i * TOKEN_STEP, variant);
  });
  const flying = at(pen, Z.tokens);
  // What slides off falls past the desk's front to where it lies.
  const floor = footAt(pen, ON_FLOOR_FOOT);
  for (const e of s.envelopes) {
    const age = s.t - e.stageAt;
    const p = Math.min(1, age / FLY_S);
    if (e.stage === "fly-in" || e.stage === "fly-out") {
      const [a, b] = e.stage === "fly-in" ? [AI_MOUTH[e.from], tray] : [tray, AI_MOUTH[e.to]];
      const x = a.x + (b.x - a.x) * p;
      const y = a.y + (b.y - a.y) * p - Math.sin(p * Math.PI) * 22;
      paintSpinning(flying, x, y, age * 14 + e.id, variant);
    } else if (e.stage === "direct") {
      // Nobody at the desk: straight across, and a little higher.
      const [a, b] = [AI_MOUTH[e.from], AI_MOUTH[e.to]];
      const x = a.x + (b.x - a.x) * p;
      const y = a.y + (b.y - a.y) * p - Math.sin(p * Math.PI) * 30;
      paintSpinning(flying, x, y, age * 14 + e.id, variant);
    } else if (e.stage === "falling") {
      const q = Math.min(1, age / FALL_S);
      const top = tray.y - DESK_CAPACITY * TOKEN_STEP;
      const x = tray.x + (e.x - tray.x) * q;
      const y = top + (ON_FLOOR - top) * q * q;
      paintSpinning(floor, x, y, age * 20 + e.id, variant);
    } else if (e.stage === "floor") {
      paintFlat(floor, e.x, ON_FLOOR, variant);
    }
  }
};

/** The assistant drone on working days, about the room: fetches whatever falls and delivers
 *  it. */
const paintDrone = (pen: Pen, s: OfficeState) => {
  const { drone: d } = s;
  const air = at(pen, Z.drone);
  paintSprite(air, S.drone, d.x - 7, d.y, { frame: frameOf(S.drone, "hover", s.t * 16) });
  if (d.carrying !== null) {
    const variant = s.day.task === "ok" ? "glyph" : undefined;
    paintSpinning(air, d.x - 4, d.y + 7, s.t * 6, variant);
  }
};

/** The verdict, a sparkle over the tray. */
const paintVerdict = (pen: Pen, s: OfficeState) => {
  if (!s.last) return;
  const age = s.t - s.last.at;
  if (age > 0.45) return;
  paintSprite(lit(at(pen, Z.onDesk)), S.fx, TRAY.x + 1, TRAY.y - 24 - age * 16, {
    frame: frameOf(S.fx, "sparkle", age / 0.15),
    variant: s.last.verdict === "correct" ? undefined : "red",
  });
};

// --- Friday's visitors ---------------------------------------------------------------

/** What the tit says between two moments of friday, if anything; the crow may scare it. */
export const birdCue = (from: number, to: number, mood: Mood) =>
  titCue(from, to, crowAtJar(mood.seed, to));

/** Where the crow cawed between two moments of friday. */
export const crowCaws = (from: number, to: number, mood: Mood) =>
  crowCue(from, to, mood.seed, wallOf(mood), mood.knocks);

const paintVisitors = (pen: Pen, mood: Mood) => {
  const { since, seed } = mood;
  const startled = crowAtJar(seed, since);
  const b = birdAt(since, startled);
  const young = youngAt(since, startled);
  const perched = b?.sit ?? false;
  const c = cycleAt(since);
  // The drone idles about the room, and drifts over the jar to feed the bird when it lands.
  const idle = { x: 160 + Math.sin(since * 0.21) * 90, y: 44 + Math.sin(since * 0.37) * 10 };
  const feed = perched ? Math.min(1, (c - 3) / 2) : c >= 13 && c < 16 ? 1 - (c - 13) / 3 : 0;
  // At dusk it comes down onto its charger, and sleeps there, rotors still, till dawn.
  const dock = dockAt(since);
  const fx = idle.x + (163 - idle.x) * feed;
  const fy = idle.y + (DESK.y - 50 - idle.y) * feed;
  const dx = fx + (PAD.x - fx) * dock;
  const dy = fy + (PAD.y - fy) * dock + Math.sin(since * 3) * 1.5 * (1 - dock);
  // Asleep on its charger, rotors still, its light flashing as it charges.
  const frame =
    dock > 0.98 ? frameOf(S.drone, "charge", since * 2) : frameOf(S.drone, "hover", since * 16);
  const drone = at(pen, Z.drone + (Z.onDesk - Z.drone) * dock);
  paintSprite(drone, S.drone, Math.round(dx) - 7, Math.round(dy), { frame });
  // The tit and its young at the jar, and the seeds dropped for them.
  const jar = at(pen, Z.onDesk);
  if (perched) {
    for (const sd of SEEDS) {
      if (c < sd.drop || c > sd.eat) continue;
      const q = Math.min(1, (c - sd.drop) / SEED_FALL_S);
      const from = { x: dx - 1, y: dy + 8 };
      const x = from.x + (sd.x - from.x) * q;
      const y = from.y + (sd.y - from.y) * q * q;
      fill(jar, C.seed, x, y);
    }
  }
  if (young)
    drawBird(jar, young.x, young.y, young.sit ? null : since * 20, young.face, false, young.dress);
  if (b) drawBird(jar, b.x, b.y, b.sit ? null : since * 18, b.face, b.peck, b.dress);
};

// --- Light ------------------------------------------------------------------------

/** What the room goes toward at night. */
const NIGHT = rgb("#0a0f1c");
const FIREFLY = rgb3(rgb("#e8ff7a"));

/**
 * The room's light. On working days the room darkens with the shift, the window with it; on
 * friday the world beyond the wall is in the open sky's light, and the room under its cover
 * darkens as the day goes and further at night. The clock and the fireflies light what is
 * near them.
 */
const lightOf = (s: OfficeState, mood: Mood, sky: SkyInput): Light => {
  const room = toward(NIGHT, Math.max(0, roomDarkness(sky)));
  if (!mood.after) return { open: () => room, points: () => clockLight(mood) };
  const night = (1 - daylight(sky.progress)) * 0.32;
  const indoors = further(room, NIGHT, night);
  return {
    open: () => toward(colourOf(OUTSIDE_NIGHT), outsideNight(sky)),
    sheltered: () => indoors,
    shelter: covered,
    points: () => [
      ...clockLight(mood),
      ...firefliesAt(mood.since, mood.seed).map(({ x, y, glow }): PointLight => ({
        p: ROOM_VIEW.unproject(x, y, -Z.fireflies),
        colour: FIREFLY,
        level: glow * 0.9,
        radius: 0.18,
      })),
    ],
  };
};

/** The clock's red on the wall round it, while it hangs and shows anything. */
const clockLight = (mood: Mood): PointLight[] => {
  if (!fixtureOf("clock", mood).on) return [];
  const p = ROOM_VIEW.unproject(CLOCK.x + CLOCK.w / 2, CLOCK.y + CLOCK.h / 2, 0);
  return [{ p: { ...p, z: 0.05 }, colour: rgb3(LED), level: 0.25, radius: 0.55 }];
};

/** Paint one frame into `scene`, lit, at scene px. */
export const paintOffice = (scene: Raster, s: OfficeState, mood: Mood, signs: Signs) => {
  clear(scene);
  const sky = skyOf(s, mood);
  const shake =
    !prefersReducedMotion() && mood.blast !== null && mood.blast < 1.5
      ? Math.round(Math.sin(mood.blast * 60) * (1.5 - mood.blast))
      : 0;
  const pen = shifted(rasterPen(scene), { dx: shake });
  paintRoom(scene, pen, s, mood, sky);
  const readout = at(pen, Z.readout);
  if (!mood.after) drawLedClock(lit(readout), CLOCK, clockAt(progress(s)), sky.t);
  else if (fixtureOf("clock", mood).on)
    drawLedClock(lit(readout), CLOCK, "12:00", mood.since, true);
  if (fixtureOf("pay", mood).on) paintPay(readout, s, mood);
  // Signs, lit so they read in the dark: the speaker and the screen show their state. On
  // friday they hang where the wall still holds them, or come down and lie where they fell;
  // the exit in front of the desk.
  for (const name of ["exit", "wc", "speaker", "screen"] as const) {
    if (name === "screen" && signs.fullscreen === null) continue;
    const { rect } = fixtureOf(name, mood);
    const frame =
      name === "speaker"
        ? signs.muted
          ? 1
          : 0
        : name === "screen"
          ? signs.fullscreen
            ? 1
            : 0
          : 0;
    paintSprite(lit(at(pen, fixtureZ(name, rect, mood))), S[name], rect.x, rect.y, { frame });
  }
  paintSlab(pen, 1, s, mood);
  paintSlab(pen, 2, s, mood);
  paintDesk(pen, s, mood);
  if (mood.after) {
    const friday = { since: mood.since, seed: mood.seed, knocks: mood.knocks };
    const wall = wallOf(mood);
    drawGarden(pen, friday, wall);
    paintFallen(pen, mood);
    paintVisitors(pen, mood);
    drawLife(pen, friday, wall);
    // What is translucent last, over whatever is behind it.
    paintArc(pen, mood.since);
    drawAir(pen, friday);
    drawGlow(lit(pen), friday);
  } else {
    paintTokens(pen, s);
    paintDrone(pen, s);
    paintVerdict(pen, s);
  }
  resolve(scene, ROOM_VIEW, lightOf(s, mood, sky), mood.since);
  const bolt = flash(sky);
  const blastFlash = mood.blast !== null ? Math.max(0, 1 - mood.blast / 0.6) : 0;
  const white = Math.max(bolt * 0.18, blastFlash * 0.9);
  if (white > 0) wash(scene, colourOf(mix("#f4f6ff", "#fff4d8", blastFlash)), white);
};
