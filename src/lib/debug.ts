/**
 * Dev only: Shift + a number key jumps to the start of that day. Read from the key's
 * position (`code`), not the character it types, so it never collides with the keypad
 * days and works on any keyboard layout. Returns the zero-based day, or null.
 */
export const debugDay = (e: KeyboardEvent): number | null => {
  if (!import.meta.env.DEV || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return null;
  const m = /^Digit([1-9])$/.exec(e.code);
  return m ? Number(m[1]) - 1 : null;
};

/** Dev only: the key left of 1 (backquote / §) flips between the game and the workbench. */
export const benchKey = (e: KeyboardEvent): boolean =>
  import.meta.env.DEV &&
  (e.code === "Backquote" || e.code === "IntlBackslash") &&
  !e.metaKey &&
  !e.ctrlKey &&
  !e.altKey;
