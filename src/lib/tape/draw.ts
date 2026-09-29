import { type DeckState, HUB_R, reelState } from "./cassette";

/** A compact cassette is 100.5 × 63.8 mm; everything below is in those millimetres. */
export const SHELL_W = 100.5;
export const SHELL_H = 63.8;
const HUB_X = 21;
const HUB_Y = 29;
const WINDOW = { x: 32, y: 21, w: 36.5, h: 16 };

export type Palette = {
  shell: string;
  label: string;
  ink: string;
  muted: string;
  accent: string;
  tape: string;
  window: string;
};

export const readPalette = (el: Element): Palette => {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    shell: dark ? "#2e2e2e" : "#3b3b3b",
    // A printed paper label reads the same in either theme.
    label: "#f3eee3",
    ink: "#3d3d3d",
    muted: "#6e6a62",
    accent: v("--halo-accent") || "#f78f08",
    tape: "#4a3426",
    window: dark ? "#141414" : "#1c1c1c",
  };
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

const drawHub = (ctx: CanvasRenderingContext2D, x: number, angle: number, p: Palette) => {
  ctx.save();
  ctx.translate(x, HUB_Y);
  ctx.rotate(angle);
  ctx.fillStyle = p.label;
  ctx.beginPath();
  ctx.arc(0, 0, 5.2, 0, Math.PI * 2);
  ctx.fill();
  // The six drive teeth are what make the rotation visible.
  ctx.fillStyle = p.shell;
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.fillRect(-0.7, -4.6, 1.4, 1.8);
  }
  ctx.beginPath();
  ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/** Paint one frame. `ctx` is already scaled so one unit is one millimetre. */
export const drawCassette = (ctx: CanvasRenderingContext2D, deck: DeckState, p: Palette) => {
  ctx.clearRect(0, 0, SHELL_W, SHELL_H);
  const { supplyR, takeupR } = reelState(deck.frac);
  const cx = SHELL_W / 2;
  const left = cx - HUB_X;
  const right = cx + HUB_X;

  roundRect(ctx, 0, 0, SHELL_W, SHELL_H, 3.5);
  ctx.fillStyle = p.shell;
  ctx.fill();

  // Label.
  roundRect(ctx, 5, 4, SHELL_W - 10, 40, 2);
  ctx.fillStyle = p.label;
  ctx.fill();
  ctx.fillStyle = p.accent;
  ctx.fillRect(5, 13, SHELL_W - 10, 2.2);

  ctx.fillStyle = p.ink;
  ctx.font = "600 5px Inter, system-ui, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("work orientation", 9, 10.5);
  ctx.fillStyle = p.muted;
  ctx.font = "400 3.4px 'Space Grotesk', Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("side a · c-90", SHELL_W - 9, 10.5);
  ctx.textAlign = "left";

  // Window onto the tape packs.
  ctx.save();
  roundRect(ctx, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, 1.5);
  ctx.fillStyle = p.window;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = p.tape;
  for (const [x, r] of [
    [left, supplyR],
    [right, takeupR],
  ]) {
    ctx.beginPath();
    ctx.arc(x, HUB_Y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Hub holes, with the empty hub ring visible around the drive.
  for (const x of [left, right]) {
    ctx.beginPath();
    ctx.arc(x, HUB_Y, HUB_R * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = p.window;
    ctx.fill();
  }
  drawHub(ctx, left, deck.supplyAngle, p);
  drawHub(ctx, right, deck.takeupAngle, p);

  // The trapezoid at the bottom edge where the head meets the tape.
  ctx.beginPath();
  ctx.moveTo(18, SHELL_H);
  ctx.lineTo(24, 50);
  ctx.lineTo(SHELL_W - 24, 50);
  ctx.lineTo(SHELL_W - 18, SHELL_H);
  ctx.closePath();
  ctx.fillStyle = p.window;
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.window;
  for (const x of [cx - 16, cx + 16]) {
    ctx.beginPath();
    ctx.arc(x, 56, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Corner screws.
  ctx.fillStyle = p.window;
  for (const [x, y] of [
    [3, 3],
    [SHELL_W - 3, 3],
    [3, SHELL_H - 3],
    [SHELL_W - 3, SHELL_H - 3],
    [cx, 47],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
};
