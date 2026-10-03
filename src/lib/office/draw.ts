import { prefersReducedMotion } from "$lib/keys";
import { drawCalendar } from "$lib/scene/calendar";
import { drawLedClock } from "$lib/scene/led";
import { drawPixelText } from "$lib/scene/pixelfont";
import { clockAt, drawWindow, flash, mix, roomDarkness, type SkyInput } from "$lib/scene/sky";
import cake from "$lib/sprites/cake.json";
import deer from "$lib/sprites/deer.json";
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
import {
  drawApples,
  drawGround,
  drawGroundlife,
  drawIvy,
  drawTrees,
  drawWoodlife,
  type Knocks,
  overgrown,
  snowCover,
  windowAt,
} from "./forest";

const S = {
  specialist: specialist as Sprite,
  jar: jar as Sprite,
  cake: cake as Sprite,
  deer: deer as Sprite,
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
  crack: "#23262c",
  grass: "#5f9a3a",
  grassDark: "#3f7a2a",
  vine: "#3f6a2a",
  leaf: "#6aa84a",
  rune: "#b77cff",
  seed: "#e8d6a0",
};

const rect = (
  ctx: CanvasRenderingContext2D,
  c: string,
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

const skyOf = (s: OfficeState, mood: Mood): SkyInput =>
  mood.after
    ? { t: mood.since, ...windowAt(mood.since) }
    : { t: s.t, progress: progress(s), weather: s.day.weather };

const drawRoom = (ctx: CanvasRenderingContext2D, s: OfficeState, mood: Mood) => {
  rect(ctx, C.wall, 0, 0, SCENE_W, 100);
  rect(ctx, C.trim, 0, 98, SCENE_W, 2);
  rect(ctx, C.wallLow, 0, 100, SCENE_W, FLOOR_Y - 100);
  rect(ctx, C.floor, 0, FLOOR_Y, SCENE_W, SCENE_H - FLOOR_Y);
  for (let y = FLOOR_Y + 6; y < SCENE_H; y += 8) rect(ctx, C.floorLine, 0, y, SCENE_W, 1);
  drawWindow(ctx, skyOf(s, mood), GLASS, C.frame, { cracked: mood.after, blast: mood.blast });
  // Clock housing; the digits are drawn after the room darkens, so they stay lit.
  rect(ctx, C.frame, CLOCK.x - 2, CLOCK.y - 2, CLOCK.w + 4, CLOCK.h + 4);
  rect(ctx, "#140807", CLOCK.x - 1, CLOCK.y - 1, CLOCK.w + 2, CLOCK.h + 2);
  // The pay readout's housing, under the clock, lit the same way.
  rect(ctx, C.frame, PAY.x - 2, PAY.y - 2, PAY.w + 4, PAY.h + 4);
  rect(ctx, "#140807", PAY.x - 1, PAY.y - 1, PAY.w + 2, PAY.h + 2);
  const left = mood.after ? null : s.day.messages - s.spawned;
  drawCalendar(ctx, CALENDAR_AT.x, CALENDAR_AT.y, s.day.name, left);
};

/** Salary so far in red segments' colours, or a dead readout on friday. */
const drawPay = (ctx: CanvasRenderingContext2D, s: OfficeState, mood: Mood) => {
  const text = mood.after ? "-.--€" : `${pay(s).salary.toFixed(2)}€`;
  drawPixelText(ctx, text, PAY.x + PAY.w - 2, PAY.y + 2, mood.after ? "#3a1410" : "#ff3b2a", {
    align: "right",
  });
};

// --- Friday: cracks, grass, vines -------------------------------------------------

const CRACKS: [number, number][][] = [
  [
    [60, 152],
    [72, 158],
    [70, 166],
    [84, 174],
    [88, 180],
  ],
  [
    [140, 154],
    [132, 162],
    [138, 170],
    [128, 180],
  ],
  [
    [204, 151],
    [214, 160],
    [230, 163],
    [238, 172],
  ],
  [
    [262, 156],
    [252, 166],
    [258, 180],
  ],
];
const TUFTS = CRACKS.flatMap((c, i) =>
  c.slice(1).map(([x, y], j) => ({ x, y, delay: 4 + i * 3 + j * 5 })),
);
const VINES = [
  { x: 58, delay: 10 },
  { x: 104, delay: 22 },
  { x: 218, delay: 16 },
  { x: 262, delay: 30 },
];

const PETALS = ["#e89aa8", "#f4f4f0", "#b77cff", "#f78f08", "#e0443a"];
/** Where on each vine a flower opens, how long after, and in what colour. */
const FLOWERS = VINES.map((_, vi) =>
  Array.from({ length: 40 }, (_, k) => {
    const h = (Math.imul(vi * 977 + k * 131, 2654435761) >>> 0) / 4294967296;
    return {
      d: 12 + Math.floor(h * (FLOOR_Y - 30)),
      side: h < 0.5 ? 2 : -2,
      wait: 4 + ((h * 1000) % 1) * 30,
      colour: PETALS[Math.floor(((h * 7919) % 1) * PETALS.length)],
      bloom: (h * 104729) % 1 < 0.2,
    };
  }).filter((f) => f.bloom),
);

const drawCracks = (ctx: CanvasRenderingContext2D) => {
  ctx.strokeStyle = C.crack;
  ctx.lineWidth = 1;
  for (const c of CRACKS) {
    ctx.beginPath();
    ctx.moveTo(c[0][0] + 0.5, c[0][1] + 0.5);
    for (const [x, y] of c.slice(1)) ctx.lineTo(x + 0.5, y + 0.5);
    ctx.stroke();
  }
};

/**
 * Moss creeps outward from the cracks and the vine roots until it carpets the floor.
 * Each 2 × 2 cell gets the time it turns green, worked out once.
 */
const MOSS_CELL = 2;
const MOSS_GREENS = ["#3f6a2a", "#4f7f33", "#5f9a3a", "#46732e"];
let moss: { x: number; y: number; at: number; colour: string }[] | null = null;
/** Worked out on first use, not on import. */
const mossCells = () =>
  (moss ??= (() => {
    const seeds = [...CRACKS.flat(), ...VINES.map((v) => [v.x, FLOOR_Y] as [number, number])];
    const cells: { x: number; y: number; at: number; colour: string }[] = [];
    for (let y = FLOOR_Y; y < SCENE_H; y += MOSS_CELL) {
      for (let x = 0; x < SCENE_W; x += MOSS_CELL) {
        const near = Math.min(...seeds.map(([sx, sy]) => Math.hypot(x - sx, (y - sy) * 1.6)));
        const hash = (Math.imul(x * 73 + y * 151, 2654435761) >>> 0) / 4294967296;
        cells.push({
          x,
          y,
          at: 6 + near / 0.9 + hash * 8,
          colour: MOSS_GREENS[Math.floor(hash * 97) % MOSS_GREENS.length],
        });
      }
    }
    return cells.sort((p, q) => p.at - q.at);
  })());

/** Fully grown moss never changes again, so it is drawn once and reused. */
let mossDone: HTMLCanvasElement | null = null;

const drawMoss = (ctx: CanvasRenderingContext2D, since: number) => {
  const cells = mossCells();
  const grown = cells[cells.length - 1].at + 3;
  if (since > grown) {
    if (!mossDone) {
      mossDone = document.createElement("canvas");
      mossDone.width = SCENE_W;
      mossDone.height = SCENE_H - FLOOR_Y;
      const off = mossDone.getContext("2d");
      if (off) {
        for (const c of cells) {
          off.fillStyle = c.colour;
          off.fillRect(c.x, c.y - FLOOR_Y, MOSS_CELL, MOSS_CELL);
        }
      }
    }
    ctx.drawImage(mossDone, 0, FLOOR_Y);
    return;
  }
  for (const c of cells) {
    if (c.at > since) break;
    ctx.globalAlpha = Math.min(1, (since - c.at) / 3);
    ctx.fillStyle = c.colour;
    ctx.fillRect(c.x, c.y, MOSS_CELL, MOSS_CELL);
  }
  ctx.globalAlpha = 1;
};

const drawGarden = (ctx: CanvasRenderingContext2D, mood: Mood) => {
  const { since, seed, knocks } = mood;
  drawCracks(ctx);
  drawMoss(ctx, since);
  drawTrees(ctx, since, seed, knocks);
  drawGround(ctx, since);
  for (const t of TUFTS) {
    const h = Math.min(6, Math.max(0, (since - t.delay) * 0.25));
    if (h <= 0) continue;
    for (let i = -2; i <= 2; i++) {
      const bh = Math.round(h * (1 - Math.abs(i) * 0.25));
      rect(ctx, i % 2 ? C.grassDark : C.grass, t.x + i, t.y - bh, 1, bh);
    }
  }
  VINES.forEach((v, vi) => {
    const len = Math.min(FLOOR_Y - 16, Math.max(0, (since - v.delay) * 1.6));
    for (let d = 0; d < len; d++) {
      const y = FLOOR_Y - d;
      const x = v.x + Math.round(Math.sin(d / 7) * 2);
      rect(ctx, C.vine, x, y, 1, 1);
      if (d % 6 === 3) rect(ctx, C.leaf, x + (d % 12 < 6 ? 1 : -2), y, 2, 1);
    }
    // Flowers open here and there, a while after the vine has grown past.
    for (const f of FLOWERS[vi]) {
      if (f.d >= len) continue;
      const age = since - v.delay - f.d / 1.6 - f.wait;
      if (age <= 0) continue;
      const x = v.x + Math.round(Math.sin(f.d / 7) * 2) + f.side;
      const y = FLOOR_Y - f.d;
      if (age < 3) {
        rect(ctx, f.colour, x, y, 1, 1);
        continue;
      }
      rect(ctx, f.colour, x - 1, y, 3, 1);
      rect(ctx, f.colour, x, y - 1, 1, 3);
      rect(ctx, "#f2c230", x, y, 1, 1);
    }
  });
  drawApples(ctx, since, seed, knocks);
};

/**
 * Once the moss is in, a deer wanders through every so often: in from one side, two
 * stops to graze, out the other. Each visit's direction and pace come from its index.
 */
const DEER_FROM = 40;
const DEER_CYCLE = 75;
const DEER_SPEED = 16;
/** Drawn at twice the sprite's size: a deer is big next to a desk. */
const DEER_SCALE = 2;
/** Scene px the deer covers in one pass through its walk frames. */
const DEER_STRIDE = 22;

const drawDeer = (ctx: CanvasRenderingContext2D, since: number) => {
  if (since < DEER_FROM) return;
  const n = Math.floor((since - DEER_FROM) / DEER_CYCLE);
  const c = (since - DEER_FROM) % DEER_CYCLE;
  const h = (Math.imul(n + 1, 2654435761) >>> 0) / 4294967296;
  const face: 1 | -1 = h < 0.5 ? 1 : -1;
  const stops = [70 + h * 40, 180 + ((h * 97) % 1) * 50];
  const graze = [5, 7];
  const w = S.deer.w * DEER_SCALE;
  // Walk to each stop, graze there, then walk off: distance along the path by time.
  let t = c;
  let along = 0;
  let grazing = false;
  let prev = -w;
  for (const [i, stop] of stops.entries()) {
    const walk = (stop - prev) / DEER_SPEED;
    if (t < walk) {
      along = prev + t * DEER_SPEED;
      t = -1;
      break;
    }
    t -= walk;
    if (t < graze[i]) {
      along = stop;
      grazing = true;
      t = -1;
      break;
    }
    t -= graze[i];
    prev = stop;
  }
  if (t >= 0) along = prev + t * DEER_SPEED;
  if (along > SCENE_W + w) return;
  const x = face > 0 ? along : SCENE_W - along - w;
  // The walk frames are one stride, stepped by distance so the hooves plant instead of sliding.
  const frame = grazing
    ? frameOf(S.deer, "graze", since * 3)
    : frameOf(S.deer, "walk", (along / DEER_STRIDE) * (S.deer.animations?.walk.length ?? 1));
  ctx.save();
  ctx.translate(Math.round(x) + (face < 0 ? w : 0), FLOOR_Y + 26 - S.deer.h * DEER_SCALE);
  ctx.scale(DEER_SCALE * face, DEER_SCALE);
  drawSprite(ctx, S.deer, 0, 0, { frame });
  ctx.restore();
};

/** Things that move in once nobody is looking: ants, ladybugs, a snail, a spider. */
const drawCritters = (ctx: CanvasRenderingContext2D, since: number) => {
  const step = Math.floor(since * 8);
  // The floor's small life goes under as the snow comes, and back out as it melts.
  const bare = Math.max(0, 1 - snowCover(since) * 1.6);
  // Ants, a few more every so often, in both directions along the floor.
  const ants = Math.floor(Math.min(14, Math.floor((since - 8) / 5)) * bare);
  for (let i = 0; i < ants; i++) {
    const dir = i % 2 ? -1 : 1;
    const speed = 9 + (i % 4) * 3;
    const span = SCENE_W + 20;
    const along = (((since * speed + i * 53) % span) + span) % span;
    const x = Math.round(dir > 0 ? along - 10 : SCENE_W + 10 - along);
    const y = FLOOR_Y + 3 + ((i * 7) % 24);
    rect(ctx, "#15120f", x, y, 3, 1);
    const legs = (step + i) % 2;
    rect(ctx, "#15120f", x + legs, y + 1, 1, 1);
    rect(ctx, "#15120f", x + 2 - legs, y - 1, 1, 1);
  }
  // Ladybugs, dawdling on the moss.
  for (let i = 0; i < Math.floor(Math.min(4, Math.floor((since - 20) / 12)) * bare); i++) {
    const x = Math.round(40 + i * 70 + Math.sin(since * 0.25 + i * 2) * 26);
    const y = Math.round(FLOOR_Y + 6 + i * 5 + Math.sin(since * 0.4 + i) * 3);
    rect(ctx, "#d0342c", x, y, 3, 2);
    rect(ctx, "#15120f", x + 1, y, 1, 2);
    rect(ctx, "#15120f", x + (Math.sin(since * 0.25 + i * 2) > 0 ? 3 : -1), y, 1, 1);
  }
  // A snail, climbing the wall by the window at snail speed.
  if (since > 15) {
    const y = Math.round(Math.max(64, FLOOR_Y - 4 - (since - 15) * 0.8));
    const x = 96;
    rect(ctx, "#8a6a4a", x, y, 3, 3);
    rect(ctx, "#5e4726", x + 1, y + 1, 1, 1);
    rect(ctx, "#c8b89a", x - 1, y + 3, 5, 1);
    rect(ctx, "#c8b89a", x - 1, y - 1, 1, 1);
  }
  // A spider on its thread from the ceiling, bobbing.
  if (since > 25) {
    const x = 118;
    const y = Math.round(34 + Math.sin(since * 0.6) * 12);
    ctx.globalAlpha = 0.6;
    rect(ctx, "#d8dde2", x, 0, 1, y);
    ctx.globalAlpha = 1;
    rect(ctx, "#15120f", x - 1, y, 3, 2);
    const kick = step % 2;
    rect(ctx, "#15120f", x - 2, y + kick, 1, 1);
    rect(ctx, "#15120f", x + 2, y + 1 - kick, 1, 1);
  }
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
  if (mood.after) drawIvy(ctx, x, top, bottom, w, mood.since);
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
  if (mood.after) drawLedClock(ctx, CLOCK, "12:00", mood.since, true);
  else drawLedClock(ctx, CLOCK, clockAt(progress(s)), sky.t);
  drawPay(ctx, s, mood);
  if (mood.after) drawGarden(ctx, mood);
  // Lit signs, so they read in the dark, and through friday's leaves: the speaker and the screen
  // show their state.
  drawSprite(ctx, S.exit, SIGNS.exit.x, SIGNS.exit.y);
  drawSprite(ctx, S.wc, SIGNS.wc.x, SIGNS.wc.y);
  drawSprite(ctx, S.speaker, SIGNS.speaker.x, SIGNS.speaker.y, { frame: signs.muted ? 1 : 0 });
  if (signs.fullscreen !== null) {
    drawSprite(ctx, S.screen, SIGNS.screen.x, SIGNS.screen.y, { frame: signs.fullscreen ? 1 : 0 });
  }
  drawSlab(ctx, 1, s, mood);
  drawSlab(ctx, 2, s, mood);
  drawDesk(ctx, s, mood);
  if (mood.after) {
    drawArc(ctx, mood.since);
    drawCritters(ctx, mood.since);
    drawGroundlife(ctx, mood.since);
    drawDeer(ctx, mood.since);
    drawVisitors(ctx, mood.since);
    drawWoodlife(ctx, mood.since, mood.seed);
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
