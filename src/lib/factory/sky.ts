import type { SkyInput } from "$lib/scene/sky";

import type { FactoryState } from "./engine";

export const FACTORY_GLASS = { x: 16, y: 18, w: 56, h: 44 };

export const shiftProgress = (s: FactoryState): number =>
  Number.isFinite(s.total) && s.total > 0 ? Math.min(1, s.spawned / s.total) : 0;

export const skyOf = (s: FactoryState): SkyInput => ({
  t: s.t,
  progress: shiftProgress(s),
  weather: s.day.weather,
});
