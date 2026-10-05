// How a workbench value reads beside its control.

export const px = (v: number) => `${v} px`;
export const share = (v: number) => `${Math.round(v * 100)}%`;
export const years = (v: number) => `${v} y`;

/** Seconds as h:mm:ss. */
export const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};
