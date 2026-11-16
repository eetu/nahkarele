// The last picture of friday's room, so that the room is never blank while the world catches up.
// A phone waking finds its GL canvas empty (the context goes in the background), and the frame
// that brings friday's world up to the clock takes seconds on a phone; a tab the browser threw
// away comes back to nothing at all. A copy at scene pixels is taken off the canvas shown every
// few seconds and saved as the page is hidden; until the live picture is back it is shown, dimmed
// under a note of how far behind the world is.

import { canvasPen } from "@anarkisti/korpi/paint";

import { paintText, PIXEL_LINE, pixelTextWidth } from "$lib/scene/pixelfont";

import { SCENE_H, SCENE_W } from "./engine";

/** The picture saved as the page is hidden, for the tab loaded again. */
const KEY = "nahkarele:specialist:friday:still";

type Saved = { at: number; since: number; png: string };

/** The room's dark where nothing was kept, and the note's colours: halo's light text, the
 *  amount in its accent. */
const GROUND = "#1c1c1c";
const DIM = "rgba(0, 0, 0, 0.45)";
const NOTE = "#ededed";
const AMOUNT = "#f78f08";

/** How far behind, s, as the note says it: dry, a number and a unit. */
export const behindText = (s: number): string => {
  if (s < 90) return `${Math.max(1, Math.round(s))} s`;
  if (s < 90 * 60) return `${Math.round(s / 60)} min`;
  if (s < 36 * 3600) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
};

const savedStill = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
  } catch {
    return null;
  }
};

export const forgetStill = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing kept to forget */
  }
};

export type Still = {
  /** The picture on `from` (the scene scaled up whole) at friday's `since`: taken in the task
   *  that presented it, as a GL canvas keeps nothing once it is composited. */
  keep: (from: HTMLCanvasElement, since: number) => void;
  /** Onto `onto` (the scene's size): what was kept, dimmed, under a note of how far behind it is
   *  of friday's clock at `now`; with nothing kept, the note on the room's dark. A cover with no
   *  note is the picture alone. */
  cover: (onto: CanvasRenderingContext2D, now: number | null) => void;
  /** Saved for the tab loaded again, friday begun at `at`. */
  save: (at: number) => void;
  /** What was saved for friday begun at `at`, put back once its image is in. */
  load: (at: number) => void;
  /** Whether a picture is kept, or one is still loading. */
  readonly kept: boolean;
  readonly loading: boolean;
};

export const stillOf = (): Still => {
  const canvas = document.createElement("canvas");
  canvas.width = SCENE_W;
  canvas.height = SCENE_H;
  const ctx = canvas.getContext("2d");
  /** The moment kept, friday s, or null with nothing kept. */
  let since: number | null = null;
  let loading = false;
  return {
    keep: (from, at) => {
      if (!ctx || !from.width || !from.height) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(from, 0, 0, from.width, from.height, 0, 0, SCENE_W, SCENE_H);
      since = at;
    },
    cover: (onto, now) => {
      onto.imageSmoothingEnabled = false;
      if (since === null) {
        onto.fillStyle = GROUND;
        onto.fillRect(0, 0, SCENE_W, SCENE_H);
      } else onto.drawImage(canvas, 0, 0);
      if (now === null) return;
      onto.fillStyle = DIM;
      onto.fillRect(0, 0, SCENE_W, SCENE_H);
      const words = "catching up";
      const amount = since === null ? "" : ` ${behindText(now - since)}`;
      const x = Math.round((SCENE_W - pixelTextWidth(words + amount)) / 2);
      const y = Math.round((SCENE_H - PIXEL_LINE) / 2);
      const pen = canvasPen(onto);
      paintText(pen, words, x, y, NOTE);
      if (amount) paintText(pen, amount, x + pixelTextWidth(words), y, AMOUNT);
    },
    save: (at) => {
      if (since === null) return;
      try {
        const saved: Saved = { at, since, png: canvas.toDataURL("image/png") };
        localStorage.setItem(KEY, JSON.stringify(saved));
      } catch {
        /* the tab loaded again then starts on the room's dark */
      }
    },
    load: (at) => {
      const saved = savedStill();
      if (!ctx || saved?.at !== at) return;
      const { since: then, png } = saved;
      const img = new Image();
      loading = true;
      img.onload = () => {
        loading = false;
        // Kept since it was asked for: what was taken is newer.
        if (since !== null) return;
        ctx.drawImage(img, 0, 0);
        since = then;
      };
      img.onerror = () => (loading = false);
      img.src = png;
    },
    get kept() {
      return since !== null;
    },
    get loading() {
      return loading;
    },
  };
};
