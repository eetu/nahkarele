export const seconds = (s: number): string => {
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.floor(s % 60)} s`;
};

export const eur = (v: number): string => `${v.toFixed(2)} eur`;

/** Signed, with a real minus sign, and a plain 0.00 for zero. */
export const signed = (v: number): string =>
  Math.abs(v) < 0.005 ? "0.00" : `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(2)}`;

export const count = (n: number): string => n.toLocaleString("en-US");

export const percent = (share: number): string => `${Math.round(share * 100)} %`;
