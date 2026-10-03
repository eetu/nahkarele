import { drawCalendar } from "$lib/scene/calendar";
import { rect } from "$lib/scene/pixel";
import { drawPixelText } from "$lib/scene/pixelfont";
import { drawWindow, flash, roomDarkness, type SkyInput } from "$lib/scene/sky";
import { bake, drawSprite, frameOf } from "$lib/sprites/sprite";

import {
  BELT_Y,
  BOT_MAX,
  current,
  type FactoryState,
  GATE_X,
  type Item,
  ITEM_W,
  MACHINE_IN,
  MACHINE_OUT,
  MACHINE_S,
  next,
  OUT_X,
  SCENE_H,
  SCENE_W,
  shiftProgress,
  ZONE,
} from "./engine";
import { lookOf, SPRITES } from "./look";

/** The factory's window: where the glass is, and the day it shows. */
const GLASS = { x: 16, y: 18, w: 56, h: 44 };
const skyOf = (s: FactoryState): SkyInput => ({
  t: s.t,
  progress: shiftProgress(s),
  weather: s.day.weather,
});

/** Scene-only state the engine does not care about: the press, the lever, the sparkles. */
export type Stagecraft = {
  plungeAt: number;
  /** The boot the press came down on; the carriage stays over it until the stamp lifts. */
  plungeId: number | null;
  /** Where the press carriage is along its beam, and the scene time it was last moved. */
  pressX: number;
  pressT: number;
  pullAt: number;
  sparkles: { at: number; caught: boolean }[];
  /** What the wall signs show: the speaker's state, and fullscreen (null where unsupported). */
  muted: boolean;
  fullscreen: boolean | null;
};

export const createStagecraft = (): Stagecraft => ({
  plungeAt: -10,
  plungeId: null,
  pressX: GATE_X,
  pressT: 0,
  pullAt: -10,
  sparkles: [],
  muted: false,
  fullscreen: null,
});

/** Scene rect the nixie clock overlay covers. */
export const CLOCK = { x: 146, y: 22, w: 40, h: 16 };
/** The way out, and the toilet, on the wall past TÄ'h where the belt leaves the room. */
export const SIGNS = {
  exit: { x: 295, y: 3, w: SPRITES.exit.w, h: SPRITES.exit.h },
  wc: { x: 298, y: 18, w: SPRITES.wc.w, h: SPRITES.wc.h },
  // Not part of the job, so away from the door: up by the lamp frame, where a phone still sees.
  speaker: { x: 79, y: 3, w: SPRITES.speaker.w, h: SPRITES.speaker.h },
  screen: { x: 94, y: 3, w: SPRITES.screen.w, h: SPRITES.screen.h },
};
/** The wall calendar, where the safety poster hung. */
const CALENDAR_AT = { x: 197, y: 18 };

const WORKER_X = GATE_X + 14;
/** Waist height: the belt hides the worker's hips, the legs show underneath. */
const WORKER_Y = BELT_Y - 26;
/** The control box bolted to the belt front: stamp and gate. Clickable. */
export const BUTTONS = {
  stamp: { x: GATE_X + 26, y: BELT_Y + 9 },
  pass: { x: GATE_X + 40, y: BELT_Y + 9 },
  r: 5,
};
const LEVER_X = WORKER_X + 26;
const BOT_Y = 161;
const OUT_CRATE = { x: OUT_X - 14, y: 158, w: 26, h: 20 };

const C = {
  wall: "#cfc6ad",
  wallLow: "#6f7f63",
  stripe: "#5b6a50",
  floor: "#5a5249",
  floorLine: "#4d463e",
  frame: "#3d3a33",
  face: "#efe6cf",
  steel: "#3d3f42",
  steelDark: "#2a2c2f",
  beltTop: "#55585c",
  tread: "#6a6e73",
  red: "#c8452f",
  machine: "#8b9aa0",
  machineDark: "#5c6a70",
  machineEdge: "#3d4a50",
  hole: "#1a1c1e",
  crate: "#8a6a3a",
  crateDark: "#5e4726",
  shredder: "#6b6f73",
  steam: "#e8e8e0",
  machineLight: "#b7c4c9",
  glass: "#1c2a30",
  reelFlange: "#9aa6ab",
  tape: "#4a3426",
  hazard: "#f2c230",
  crumb: "#2a2d31",
  crumbLight: "#4d545b",
  screen: "#0d1a12",
  screenText: "#3f7a4a",
  good: "#6ccf5a",
  bad: "#e0443a",
  warn: "#f2c230",
  xray: "#081418",
  lamp: "rgba(247, 143, 8, 0.13)",
  bulb: "#fff3c4",
};

/** The beam the press runs along: over the whole lit stretch, just under the window sill. */
const BEAM = { from: ZONE.from - 10, to: GATE_X + 42, y: 67 };
const PRESS_REST = 87;
const PRESS_DOWN = BELT_Y - ITEM_W - 4;
const PLUNGE_S = 0.09;
/** How long the carriage stays on a stamped boot before going after the next one. */
const PRESS_HOLD_S = 0.3;

/** 0 → 1 → 0 over one stamp. */
const plunge = (t: number, at: number): number => {
  const p = (t - at) / PLUNGE_S;
  return p < 0 || p > 2 ? 0 : p < 1 ? p : 2 - p;
};

const drawRoom = (ctx: CanvasRenderingContext2D, s: FactoryState) => {
  rect(ctx, C.wall, 0, 0, SCENE_W, 96);
  rect(ctx, C.stripe, 0, 94, SCENE_W, 2);
  rect(ctx, C.wallLow, 0, 96, SCENE_W, 54);
  rect(ctx, C.floor, 0, 150, SCENE_W, 30);
  for (let y = 156; y < SCENE_H; y += 8) rect(ctx, C.floorLine, 0, y, SCENE_W, 1);

  drawWindow(ctx, skyOf(s), GLASS, C.frame);

  // Mounting plate for the nixie clock, which sits on top of the canvas.
  const { x: kx, y: ky, w: kw, h: kh } = CLOCK;
  rect(ctx, C.frame, kx - 2, ky - 2, kw + 4, kh + 4);
  rect(ctx, "#1a1c1e", kx - 1, ky - 1, kw + 2, kh + 2);
  rect(ctx, C.steel, kx + kw / 2 - 1, 0, 2, ky - 2);

  // The day's calendar page. Between shifts the line runs on with nothing to count.
  const left = Number.isFinite(s.total) ? s.total - s.spawned : null;
  drawCalendar(ctx, CALENDAR_AT.x, CALENDAR_AT.y, s.day.name, left);
};

const drawLamp = (ctx: CanvasRenderingContext2D) => {
  const x = (ZONE.from + ZONE.to) / 2;
  rect(ctx, C.steelDark, x, 0, 1, 12);
  ctx.fillStyle = C.lamp;
  ctx.beginPath();
  ctx.moveTo(x - 6, 18);
  ctx.lineTo(x + 7, 18);
  ctx.lineTo(ZONE.to + ITEM_W / 2, BELT_Y);
  ctx.lineTo(ZONE.from - ITEM_W / 2, BELT_Y);
  ctx.closePath();
  ctx.fill();
  rect(ctx, C.steelDark, x - 7, 12, 15, 6);
  rect(ctx, C.bulb, x - 2, 18, 5, 2);
};

/**
 * The press rides its beam over the next boot to decide, the one a stamp would land on, and
 * waits at the end of the lamp for boots still on their way. It stays on a stamped boot until
 * the stamp lifts.
 */
const movePress = (st: Stagecraft, s: FactoryState) => {
  const holding = s.t - st.plungeAt < PRESS_HOLD_S;
  const item = (holding && s.items.find((i) => i.id === st.plungeId)) || next(s);
  const dt = Math.min(0.1, Math.max(0, s.t - st.pressT));
  st.pressT = s.t;
  if (!item) return;
  const to = Math.min(GATE_X, Math.max(ZONE.from, item.x + ITEM_W / 2));
  st.pressX += (to - st.pressX) * (1 - Math.exp(-(holding ? 40 : 14) * dt));
};

const drawPress = (ctx: CanvasRenderingContext2D, st: Stagecraft, s: FactoryState) => {
  const { from, to, y } = BEAM;
  const leg = GATE_X - 40;
  rect(ctx, C.steel, leg, 0, 2, y + 2);
  rect(ctx, C.steel, to - 2, 0, 2, y + 2);
  rect(ctx, C.steel, from, y, to - from, 3);
  // A knee brace carries the beam out past the leg, toward the window.
  for (let i = 0; i <= 28; i++) rect(ctx, C.steel, leg - i, y - 21 + Math.round(i * 0.75), 2, 2);
  movePress(st, s);
  const x = Math.round(st.pressX);
  const head = Math.round(PRESS_REST + (PRESS_DOWN - PRESS_REST) * plunge(s.t, st.plungeAt));
  rect(ctx, C.steelDark, x - 4, y - 1, 8, 1);
  rect(ctx, C.red, x - 6, y - 4, 12, 9);
  rect(ctx, C.steelDark, x - 6, y + 4, 12, 1);
  rect(ctx, C.steel, x - 1, y + 5, 3, head - y - 5);
  rect(ctx, C.steelDark, x - 6, head, 12, 4);
  rect(ctx, C.red, x - 5, head + 4, 10, 1);
};

const drawWorker = (ctx: CanvasRenderingContext2D, st: Stagecraft, t: number) => {
  const pulling = t - st.pullAt < 0.2;
  const frame = pulling
    ? frameOf(SPRITES.worker, "pull", 0)
    : frameOf(SPRITES.worker, "idle", t * 4);
  drawSprite(ctx, SPRITES.worker, WORKER_X, WORKER_Y, { frame });
  // The pass lever, pivoting on the belt frame.
  const tipX = pulling ? LEVER_X + 6 : LEVER_X + 2;
  const tipY = pulling ? 120 : 110;
  ctx.strokeStyle = C.steelDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LEVER_X, BELT_Y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  rect(ctx, C.red, tipX - 2, tipY - 2, 4, 4);
};

const drawBelt = (ctx: CanvasRenderingContext2D, from: number, to: number, offset: number) => {
  rect(ctx, C.beltTop, from, BELT_Y, to - from, 4);
  for (let x = from - 8 + (offset % 8); x < to; x += 8) {
    if (x >= from) rect(ctx, C.tread, x, BELT_Y + 1, 3, 1);
  }
  rect(ctx, C.steel, from, BELT_Y + 4, to - from, 10);
  rect(ctx, C.steelDark, from, BELT_Y + 13, to - from, 1);
  for (let x = from + 6; x < to - 4; x += 28) {
    ctx.fillStyle = C.steelDark;
    ctx.beginPath();
    ctx.arc(x, BELT_Y + 9, 3, 0, Math.PI * 2);
    ctx.fill();
    const a = offset / 3;
    rect(ctx, C.tread, x + Math.cos(a) * 2 - 0.5, BELT_Y + 9 + Math.sin(a) * 2 - 0.5, 1, 1);
  }
};

const drawLegs = (ctx: CanvasRenderingContext2D, xs: number[]) => {
  for (const x of xs) rect(ctx, C.steelDark, x, BELT_Y + 14, 4, 150 - BELT_Y - 14);
};

const drawItems = (ctx: CanvasRenderingContext2D, s: FactoryState, stage: "belt" | "shipped") => {
  for (const item of s.items) {
    if (item.stage !== stage) continue;
    const look = lookOf(item, item.flipped && stage === "belt");
    const bob = stage === "belt" ? Math.round(Math.sin(s.t * 9 + item.id) * 0.4) : 0;
    const y = BELT_Y - ITEM_W + bob;
    drawSprite(ctx, look.sprite, item.x, y, look);
    if (item.stamped && stage === "belt") {
      drawSprite(ctx, SPRITES.fx, item.x + 1, y + 2, { frame: frameOf(SPRITES.fx, "mark", 0) });
    }
  }
};

/** The barrier that holds the front boot: down while it waits, up once decided. */
const drawGate = (ctx: CanvasRenderingContext2D, s: FactoryState) => {
  const front = current(s);
  const waiting = front !== null && front.x + ITEM_W / 2 >= GATE_X - 0.01;
  const x = GATE_X + ITEM_W / 2 + 1;
  rect(ctx, C.steelDark, x, 104, 2, 4);
  if (!waiting) return;
  for (let y = 108; y < BELT_Y; y += 4) rect(ctx, y % 8 === 0 ? C.red : C.face, x, y, 2, 4);
};

const drawLying = (ctx: CanvasRenderingContext2D, item: Item, x: number, y: number, turn = 1) => {
  const look = lookOf(item);
  ctx.save();
  ctx.translate(Math.round(x) + ITEM_W / 2, Math.round(y) + ITEM_W / 2);
  ctx.rotate((Math.PI / 2) * turn);
  ctx.drawImage(bake(look.sprite, look.frame, look.variant), -ITEM_W / 2, -ITEM_W / 2);
  ctx.restore();
};

const drawFloor = (ctx: CanvasRenderingContext2D, s: FactoryState) => {
  for (const item of s.items) {
    if (item.stage !== "floor") continue;
    // Tips over as it falls from the belt.
    const p = Math.min(1, (s.t - item.stageAt) / 0.3);
    drawLying(ctx, item, item.x, BELT_Y - ITEM_W + (153 - BELT_Y + ITEM_W) * p * p, p);
  }
};

const drawOutCrate = (ctx: CanvasRenderingContext2D, s: FactoryState) => {
  for (const item of s.items) {
    if (item.stage !== "delivered") continue;
    const p = Math.min(1, (s.t - item.stageAt) / 0.3);
    drawLying(ctx, item, OUT_CRATE.x + 5, 140 + p * 20);
  }
  const { x, y, w, h } = OUT_CRATE;
  rect(ctx, C.crateDark, x, y, w, h);
  rect(ctx, C.crate, x + 1, y + 1, w - 2, h - 2);
  rect(ctx, C.crateDark, x + 1, y + 8, w - 2, 1);
  // Stencilled on the crate: how many went out today.
  drawPixelText(ctx, String(s.tally.shipped), x + 11, y + 11, C.crateDark, { align: "center" });
};

const drawBots = (ctx: CanvasRenderingContext2D, s: FactoryState) => {
  for (const bot of s.bots) {
    const x = bot.x - SPRITES.bot.w / 2;
    const speed = Math.abs(bot.v) / BOT_MAX;
    if (speed > 0.4) {
      const tail = bot.v > 0 ? x - 1 : x + SPRITES.bot.w + 1;
      const dir = bot.v > 0 ? -1 : 1;
      ctx.globalAlpha = speed * 0.6;
      for (let i = 0; i < 3; i++) {
        const len = Math.round(speed * (8 - i * 2));
        rect(ctx, C.steam, dir < 0 ? tail - len : tail, BOT_Y + 2 + i * 2, len, 1);
      }
      ctx.globalAlpha = 1;
    }
    drawSprite(ctx, SPRITES.bot, x, BOT_Y, {
      frame: frameOf(SPRITES.bot, "roll", Math.floor(bot.x / 3)),
      variant: bot.carrying ? "busy" : undefined,
      flip: bot.facing < 0 ? "h" : undefined,
    });
    const item = bot.carrying ? s.items.find((i) => i.id === bot.item) : null;
    if (item) drawLying(ctx, item, bot.x - ITEM_W / 2, BOT_Y - ITEM_W + 2);
  }
};

const drawButtons = (ctx: CanvasRenderingContext2D, st: Stagecraft, s: FactoryState) => {
  const { stamp, pass, r } = BUTTONS;
  rect(ctx, C.machineEdge, stamp.x - 8, BELT_Y + 3, pass.x - stamp.x + 16, 12);
  rect(ctx, C.machineDark, stamp.x - 7, BELT_Y + 4, pass.x - stamp.x + 14, 10);
  const button = (x: number, y: number, colour: string, pressed: boolean) => {
    ctx.fillStyle = C.steelDark;
    ctx.beginPath();
    ctx.arc(x, y + 1, r - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y + (pressed ? 1 : 0), r - 1.5, 0, Math.PI * 2);
    ctx.fill();
  };
  button(stamp.x, stamp.y, "#d0342c", s.t - st.plungeAt < 0.15);
  button(pass.x, pass.y, "#4caf50", s.t - st.pullAt < 0.15);
};

const SHREDDER = { x: 236, y: 150, w: 52, h: 28 };
const SHRED_FALL_S = 0.3;

const drawRejects = (ctx: CanvasRenderingContext2D, s: FactoryState) => {
  for (const item of s.items) {
    if (item.stage !== "rejected") continue;
    const age = s.t - item.stageAt;
    const p = Math.min(1, age / SHRED_FALL_S);
    const look = lookOf(item);
    // Down through the hatch and into the rollers, where the shredder body hides it.
    drawSprite(ctx, look.sprite, SHREDDER.x + SHREDDER.w / 2 - 8, 130 + p * p * 30, look);
  }
};

/** Rubber crumbs thrown up by the rollers, for as long as a boot is going through. */
const drawCrumbs = (ctx: CanvasRenderingContext2D, s: FactoryState) => {
  for (const item of s.items) {
    if (item.stage !== "rejected") continue;
    const age = s.t - item.stageAt - SHRED_FALL_S * 0.6;
    if (age < 0) continue;
    for (let i = 0; i < 7; i++) {
      const seed = (item.id * 7 + i) * 2654435761;
      const vx = ((seed % 97) / 97 - 0.5) * 40;
      const vy = -18 - ((seed >>> 8) % 20);
      const x = SHREDDER.x + SHREDDER.w / 2 + vx * age;
      const y = SHREDDER.y + vy * age + 60 * age * age;
      if (y > SHREDDER.y + 2) continue;
      rect(ctx, i % 3 === 0 ? C.crumbLight : C.crumb, x, y, 1, 1);
    }
  }
};

const drawShredder = (ctx: CanvasRenderingContext2D, s: FactoryState) => {
  const busy = s.items.some((i) => i.stage === "rejected" && s.t - i.stageAt < 0.8);
  const shake = busy ? Math.round(Math.sin(s.t * 70)) : 0;
  const { x, y, w, h } = SHREDDER;
  rect(ctx, C.machineEdge, x - 1 + shake, y - 1, w + 2, h + 1);
  rect(ctx, C.shredder, x + shake, y, w, h);
  // The mouth and its two toothed rollers.
  rect(ctx, C.hole, x + 6 + shake, y, w - 12, 5);
  const turn = Math.floor(s.t * (busy ? 30 : 4));
  for (let i = 0; i < (w - 12) / 2; i++) {
    const top = (i + turn) % 2 === 0;
    rect(ctx, C.tread, x + 6 + i * 2 + shake, y + (top ? 1 : 3), 1, 1);
  }
  // Hazard band.
  for (let i = 0; i < w; i += 6) {
    rect(ctx, C.hazard, x + i + shake, y + 18, 3, 4);
    rect(ctx, C.hole, x + i + 3 + shake, y + 18, 3, 4);
  }
  rect(ctx, busy ? "#e0443a" : "#5a2a28", x + w - 8 + shake, y + 9, 3, 3);
  // Its counter: how many it has eaten today.
  rect(ctx, C.hole, x + 3 + shake, y + 7, 21, 9);
  const eaten = String(s.tally.rejected).padStart(3, "0");
  drawPixelText(ctx, eaten, x + 13.5 + shake, y + 8, "#e8ecf0", { align: "center" });
};

/** Two tape reels that spool back and forth: fast while scanning, idling otherwise. */
const drawReels = (
  ctx: CanvasRenderingContext2D,
  s: FactoryState,
  x: number,
  cy: number,
  busy: boolean,
) => {
  // Tape moves from one reel to the other and back over a long cycle.
  const wind = (Math.sin(s.t * 0.15) + 1) / 2;
  const spin = s.t * (busy ? 9 : 1.2);
  const reel = (cx: number, pack: number, dir: number) => {
    ctx.fillStyle = C.reelFlange;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.tape;
    ctx.beginPath();
    ctx.arc(cx, cy, 5 + pack * 6, 0, Math.PI * 2);
    ctx.fill();
    // Three cut-outs in the flange, turning with the hub.
    ctx.fillStyle = C.glass;
    for (let i = 0; i < 3; i++) {
      const a = spin * dir + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = C.machineLight;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.machineEdge;
    ctx.beginPath();
    ctx.arc(cx, cy, 1.2, 0, Math.PI * 2);
    ctx.fill();
  };
  const left = x + 17;
  const right = x + 47;
  // The tape path: down from each reel to a head block between them.
  rect(ctx, C.tape, left - 1, cy + 11, 1, 7);
  rect(ctx, C.tape, right, cy + 11, 1, 7);
  rect(ctx, C.tape, left - 1, cy + 18, right - left + 2, 1);
  rect(ctx, C.machineEdge, x + 28, cy + 15, 8, 5);
  reel(left, 1 - wind, 1);
  reel(right, wind, 1);
};

type Verdict = { reject: boolean; note: string };

const verdictOf = (item: Item): Verdict => ({
  reject: item.defect !== null,
  note: item.defect && !item.stamped ? "no stamp" : !item.defect && item.stamped ? "undone" : "",
});

/** Share of the scan after which the verdict shows. */
const VERDICT_AT = 0.65;

const drawMachine = (ctx: CanvasRenderingContext2D, s: FactoryState) => {
  const x = MACHINE_IN;
  const w = MACHINE_OUT - MACHINE_IN;
  const scanning = s.items.find((i) => i.stage === "machine");
  const recent = s.items
    .filter((i) => (i.stage === "shipped" || i.stage === "rejected") && s.t - i.stageAt < 1.2)
    .reduce<Item | null>((a, i) => (!a || i.stageAt > a.stageAt ? i : a), null);

  // Cabinet: a tape-drive computer, reels behind glass above the controls.
  const top = 18;
  rect(ctx, C.machineEdge, x - 1, top - 1, w + 2, 147 - top + 1);
  rect(ctx, C.machine, x, top, w, 146 - top);
  rect(ctx, C.machineLight, x, top, w, 2);
  rect(ctx, C.machineEdge, x + 3, top + 3, w - 6, 44);
  rect(ctx, C.glass, x + 4, top + 4, w - 8, 42);
  drawReels(ctx, s, x, top + 20, scanning !== undefined);
  rect(ctx, C.machineDark, x + 4, 73, w - 8, 29);
  const lights = ["#e0443a", "#6ccf5a", "#f2c230"];
  for (let i = 0; i < 5; i++) {
    const on = Math.floor(s.t * (scanning ? 8 : 2) + i * 1.7) % 3;
    rect(ctx, lights[on], x + 10 + i * 10, 76, 3, 2);
  }

  // Scan progress and the verdict it arrives at, whatever the stamp says.
  const p = scanning ? Math.min(1, (s.t - scanning.stageAt) / MACHINE_S) : 0;
  const shown =
    scanning && p >= VERDICT_AT
      ? verdictOf(scanning)
      : !scanning && recent
        ? verdictOf(recent)
        : null;
  const verdictColour = shown ? (shown.reject ? C.bad : C.good) : null;

  // Readout, two lines of eight characters: what it is doing, and the belt speed it has
  // earned the relay; or its verdict, and what it had to change.
  rect(ctx, C.screen, x + 4, 81, w - 8, 18);
  if (shown) {
    drawPixelText(ctx, shown.reject ? "reject" : "ok", x + 6, 83, verdictColour ?? C.good);
    if (shown.note) drawPixelText(ctx, shown.note, x + 6, 91, C.warn);
  } else {
    drawPixelText(ctx, scanning ? "scanning" : "ready", x + 6, 83, C.screenText);
    if (scanning) rect(ctx, C.screenText, x + 6, 95, Math.round(p * (w - 12)), 2);
    else drawPixelText(ctx, `belt ${s.pace.toFixed(1)}`, x + 6, 91, C.screenText);
  }

  // Intake, outlet, and the x-ray window between them.
  rect(ctx, C.hole, x, 108, 8, BELT_Y - 108 + 4);
  rect(ctx, C.hole, x + w - 8, 108, 8, BELT_Y - 108 + 4);
  rect(ctx, verdictColour ?? C.machineEdge, x + 15, 103, 34, 28);
  rect(ctx, C.xray, x + 16, 104, 32, 26);
  if (scanning) {
    const reveal = Math.round(p * 32);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 16, 104, reveal, 26);
    ctx.clip();
    const look = lookOf(scanning, false, true);
    drawSprite(ctx, look.sprite, x + 24, 111, look);
    ctx.restore();
    rect(ctx, C.good, x + 16 + Math.min(31, reveal), 104, 1, 26);
  }

  // Nameplate.
  rect(ctx, C.machineEdge, x + 21, 133, 22, 9);
  rect(ctx, C.face, x + 22, 134, 20, 7);
  ctx.fillStyle = C.machineEdge;
  ctx.font = "600 6px 'Space Grotesk', Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("TÄ'h", x + 32, 137.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // Reject hatch opens as a boot drops.
  const dropping = s.items.some((i) => i.stage === "rejected" && s.t - i.stageAt < SHRED_FALL_S);
  rect(ctx, dropping ? C.hole : C.machineEdge, x + 22, 145, 20, 2);
};

const drawSparkles = (ctx: CanvasRenderingContext2D, st: Stagecraft, t: number) => {
  for (const sp of st.sparkles) {
    const age = t - sp.at;
    if (age < 0 || age > 0.45) continue;
    const frame = frameOf(SPRITES.fx, "sparkle", age / 0.15);
    drawSprite(ctx, SPRITES.fx, MACHINE_IN + 8 + (sp.caught ? 42 : 0), 10 - age * 12, {
      frame,
      variant: sp.caught ? "red" : undefined,
    });
  }
};

/** Paint one frame. `ctx` is already scaled so one unit is one scene pixel. */
export const drawFactory = (
  ctx: CanvasRenderingContext2D,
  s: FactoryState,
  st: Stagecraft,
  staffed: boolean,
) => {
  ctx.imageSmoothingEnabled = false;
  const offset = s.t * s.day.speed;
  drawRoom(ctx, s);
  // Night and weather darken the room; the lamp, the belt and TÄ'h are drawn over it.
  const dark = roomDarkness(skyOf(s));
  if (dark > 0) {
    ctx.globalAlpha = dark;
    rect(ctx, "#0a0f1c", 0, 0, SCENE_W, SCENE_H);
    ctx.globalAlpha = 1;
  }
  // Lit signs, so they read in the dark; the speaker and the screen show their state.
  drawSprite(ctx, SPRITES.exit, SIGNS.exit.x, SIGNS.exit.y);
  drawSprite(ctx, SPRITES.wc, SIGNS.wc.x, SIGNS.wc.y);
  drawSprite(ctx, SPRITES.speaker, SIGNS.speaker.x, SIGNS.speaker.y, { frame: st.muted ? 1 : 0 });
  if (st.fullscreen !== null) {
    drawSprite(ctx, SPRITES.screen, SIGNS.screen.x, SIGNS.screen.y, {
      frame: st.fullscreen ? 1 : 0,
    });
  }
  drawLamp(ctx);
  if (staffed) drawWorker(ctx, st, s.t);
  drawBelt(ctx, 0, MACHINE_IN + 4, offset);
  drawBelt(ctx, MACHINE_OUT - 4, SCENE_W, offset);
  drawLegs(ctx, [8, 100, 196, 300]);
  if (staffed) drawButtons(ctx, st, s);
  drawItems(ctx, s, "belt");
  drawItems(ctx, s, "shipped");
  drawPress(ctx, st, s);
  drawGate(ctx, s);
  drawRejects(ctx, s);
  drawShredder(ctx, s);
  drawCrumbs(ctx, s);
  drawOutCrate(ctx, s);
  drawFloor(ctx, s);
  drawBots(ctx, s);
  drawMachine(ctx, s);
  drawSparkles(ctx, st, s.t);
  const bolt = flash(skyOf(s));
  if (bolt) {
    ctx.globalAlpha = 0.18 * bolt;
    rect(ctx, "#f4f6ff", 0, 0, SCENE_W, SCENE_H);
    ctx.globalAlpha = 1;
  }
};
