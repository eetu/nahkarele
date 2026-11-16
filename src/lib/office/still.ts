// Friday's last picture across a reload, and the note over it while the world catches up. korpi's
// frame keeps the picture presented last (`Frame.still`) and shows it where the GPU's went (a GL
// context lost in the background); a page hidden saves it here, and the tab loaded again gives it
// back before its first frame.

import { canvasPen, type Raster, raster } from "@anarkisti/korpi/paint";

import { paintText, PIXEL_LINE, pixelTextWidth } from "$lib/scene/pixelfont";

import { SCENE_H, SCENE_W } from "./engine";

/** The picture saved as the page is hidden, for the tab loaded again. */
const KEY = "nahkarele:specialist:friday:still";

type Saved = { at: number; png: string };

/** The room's dark where nothing was kept, and the note's colours: halo's light text, the
 *  amount in its accent. */
const GROUND = "#1c1c1c";
const DIM = "rgba(0, 0, 0, 0.45)";
const NOTE = "#ededed";
const AMOUNT = "#f78f08";

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

/** `still` saved for the tab loaded again, friday begun at `at`. */
export const saveStill = (still: Raster, at: number) => {
  const canvas = Object.assign(document.createElement("canvas"), {
    width: still.w,
    height: still.h,
  });
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const bytes = new Uint8ClampedArray(
    still.px.buffer as ArrayBuffer,
    still.px.byteOffset,
    still.px.byteLength,
  );
  ctx.putImageData(new ImageData(bytes, still.w, still.h), 0, 0);
  try {
    const saved: Saved = { at, png: canvas.toDataURL("image/png") };
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* the tab loaded again then starts on the room's dark */
  }
};

/** What was saved for friday begun at `at`, handed to `then` once its image is in. Whether there
 *  is one coming. */
export const loadStill = (at: number, then: (still: Raster) => void): boolean => {
  const saved = savedStill();
  if (saved?.at !== at) return false;
  const img = new Image();
  img.onload = () => {
    const { width: w, height: h } = img;
    const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const still = raster(w, h);
    still.px.set(new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer));
    then(still);
  };
  img.src = saved.png;
  return true;
};

/** Onto `onto` (the scene's size, over the room): the picture under it dimmed, or with none the
 *  room's dark, under a note of how far through catching up friday's world is, 0..1. */
export const paintNote = (onto: CanvasRenderingContext2D, picture: boolean, share: number) => {
  onto.clearRect(0, 0, SCENE_W, SCENE_H);
  onto.fillStyle = picture ? DIM : GROUND;
  onto.fillRect(0, 0, SCENE_W, SCENE_H);
  const words = "catching up";
  const amount = ` ${Math.floor(share * 100)}%`;
  const x = Math.round((SCENE_W - pixelTextWidth(words + amount)) / 2);
  const y = Math.round((SCENE_H - PIXEL_LINE) / 2);
  const pen = canvasPen(onto);
  paintText(pen, words, x, y, NOTE);
  paintText(pen, amount, x + pixelTextWidth(words), y, AMOUNT);
};
