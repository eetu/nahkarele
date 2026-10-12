// Things drawn in voxels (korpi `model`) on the factory's canvas: a sprite with slices in dab is
// a thing in depth, turned as it tips, tumbles and falls. They are painted into a raster the size
// of the scene and laid over the canvas where the draw order puts them, so what is drawn after
// (the shredder over what drops into it) still covers them.

import { lru } from "@anarkisti/korpi/core";
import { matrixOf, type Model, modelOf, paintModel, type Turn } from "@anarkisti/korpi/model";
import { clear, presenter, raster, rasterPen } from "@anarkisti/korpi/paint";
import { obliqueView } from "@anarkisti/korpi/view";

import type { Sprite } from "$lib/sprites/sprite";

import { SCENE_H, SCENE_W } from "./engine";
import type { Look } from "./look";

const VIEW = obliqueView({ w: SCENE_W, h: SCENE_H, pxPerM: 40, k: 0.25, horizon: SCENE_H });

/** Whether `s` has depth to be drawn in. */
export const solid = (s: Sprite) => (s.slices?.length ?? 0) > 0;

const models = lru<string, Model>(64);

/** `look`'s model: its frame, in its variant's colours. */
const modelFor = ({ sprite, frame, variant }: Look): Model =>
  models.get(`${sprite.name}:${frame}:${variant ?? ""}`, () => {
    const swap = variant ? sprite.variants?.[variant] : undefined;
    return modelOf(swap ? { ...sprite, palette: { ...sprite.palette, ...swap } } : sprite, frame);
  });

/** The light korpi lights its icons by (over the viewer's left shoulder), and how dark a face
 *  turned from it goes. A face turned to the screen keeps its drawn colour, so a thing at rest
 *  matches the sprites around it; only what turns away darkens. */
const LIGHT = (() => {
  const [x, y, z] = [-0.45, 0.75, 0.5];
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
})();
const SHADOW = 0.55;
const FACE_ON = SHADOW + (1 - SHADOW) * LIGHT[2];

let shades = new Uint32Array(0);

/** Each of `m`'s voxels in its colour as lit turned `turn`, into `shades`. */
const shade = (m: Model, turn: Turn) => {
  if (shades.length < m.n) shades = new Uint32Array(m.n);
  const r = matrixOf(turn);
  for (let i = 0; i < m.n; i++) {
    const nx = m.nx[i];
    const ny = m.ny[i];
    const nz = m.nz[i];
    const facing =
      (r[0] * nx + r[1] * ny + r[2] * nz) * LIGHT[0] +
      (r[3] * nx + r[4] * ny + r[5] * nz) * LIGHT[1] +
      (r[6] * nx + r[7] * ny + r[8] * nz) * LIGHT[2];
    const k = Math.min(1, (SHADOW + (1 - SHADOW) * Math.max(0, facing)) / FACE_ON);
    const c = m.colour[i];
    shades[i] =
      (c & 0xff000000) |
      (Math.round(((c >>> 16) & 255) * k) << 16) |
      (Math.round(((c >>> 8) & 255) * k) << 8) |
      Math.round((c & 255) * k);
  }
  return shades;
};

export type Models = {
  /** `look` with its middle at scene pixel `sx`, `sy`, `d` out (scene px; nearer covers),
   *  turned `turn`; a look flipped upside down is rolled half over. */
  paint: (look: Look, sx: number, sy: number, turn?: Turn, d?: number) => void;
  /** What was painted since the last, onto `ctx`. */
  present: (ctx: CanvasRenderingContext2D) => void;
};

export const modelsOf = (): Models => {
  const scene = raster(SCENE_W, SCENE_H);
  const pen = rasterPen(scene);
  const out = presenter();
  let painted = false;
  return {
    paint: (look, sx, sy, turn = {}, d = 0) => {
      const m = modelFor(look);
      const turned = { ...turn, roll: (turn.roll ?? 0) + (look.flip === "v" ? Math.PI : 0) };
      paintModel(pen, VIEW, m, { sx, sy, d: -d / VIEW.pxPerM }, turned, {
        colours: shade(m, turned),
      });
      painted = true;
    },
    present: (ctx) => {
      if (!painted) return;
      out.present(ctx, scene);
      clear(scene);
      painted = false;
    },
  };
};
