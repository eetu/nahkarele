/**
 * Whether a window-level game shortcut should stay out of this key press.
 *
 * Games listen on the window, so without this a focused button or link would get
 * Enter or Space twice: its own activation, and the game's shortcut for the same
 * key. Held keys don't auto-repeat actions, and modifier combinations belong to the
 * browser.
 */
export const leaveKey = (e: KeyboardEvent): boolean => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return true;
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest("dialog, input, textarea, select")) return true;
  return (e.key === "Enter" || e.key === " ") && !!target?.closest("button, a, summary");
};

let reduced: boolean | null = null;

/** The viewer asked for less motion: no strobes, no shaking. */
export const prefersReducedMotion = (): boolean => {
  if (reduced === null) {
    reduced =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return reduced;
};
