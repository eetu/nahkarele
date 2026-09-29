/**
 * Integer pixel scaling for a scene, and a camera for narrow screens.
 *
 * Whole-number scales keep every scene pixel square, but on a phone the next scale up
 * rarely fits, which leaves the scene small with empty gutters. There the scene goes one
 * scale up instead, is cropped to the screen, and the camera pans to the action.
 */

/** Crop only while at least this much of the scene stays in view. */
const MIN_VISIBLE = 0.7;
const NARROW_PX = 700;

export type Fit = {
  /** Device pixels per scene pixel. */
  scale: number;
  /** CSS width of the whole scene at that scale. */
  sceneCss: number;
  /** CSS width actually shown. */
  viewCss: number;
};

export const fitScene = (
  containerCss: number,
  sceneW: number,
  sceneH: number,
  heightCss: number,
): Fit => {
  const dpr = window.devicePixelRatio || 1;
  const byWidth = Math.floor((containerCss * dpr) / sceneW);
  const byHeight = Math.floor((heightCss * dpr) / sceneH);
  let scale = Math.max(1, Math.min(byWidth, Math.max(byHeight, 2)));
  if (
    containerCss < NARROW_PX &&
    (containerCss * dpr) / (sceneW * (scale + 1)) >= MIN_VISIBLE &&
    ((scale + 1) * sceneH) / dpr <= heightCss
  ) {
    scale += 1;
  }
  const sceneCss = (sceneW * scale) / dpr;
  return { scale, sceneCss, viewCss: Math.min(sceneCss, containerCss) };
};

/** A camera that eases toward the scene x it should centre on. */
export const createCamera = () => {
  let x: number | null = null;
  return {
    /** CSS offset of the scene for this frame. */
    follow: (fit: Fit, sceneW: number, focus: number, dt: number): number => {
      const k = fit.sceneCss / sceneW;
      const max = fit.sceneCss - fit.viewCss;
      const target = Math.min(max, Math.max(0, focus * k - fit.viewCss / 2));
      x = x === null ? target : x + (target - x) * Math.min(1, dt * 3);
      return Math.round(x);
    },
  };
};
