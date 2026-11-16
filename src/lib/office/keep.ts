// When friday began is kept twice: in localStorage, and in a cookie nginx sets (`/friday` in
// default.conf). Safari clears what a script stores after seven days of use without a visit to
// the site, but not a cookie the site's own responses set, so a visitor back after months finds
// friday where it was, the wood grown by the time away. What was tapped is in localStorage only.

/** Friday's start (ms) in a cookie string as `document.cookie` reads, or null. */
export const cookieStart = (cookie: string): number | null => {
  const m = /(?:^|;\s*)friday=(\d{10,13})(?:;|$)/.exec(cookie);
  return m ? Number(m[1]) : null;
};

/** Friday's start (ms): localStorage's (`stored`), else the cookie's, else null. */
export const startOf = (stored: string | null, cookie: string): number | null => {
  const v = Number(stored);
  return Number.isFinite(v) && v > 0 ? v : cookieStart(cookie);
};

/** Has nginx keep friday's start `at` in the cookie for 400 days from now, or forget it (null).
 *  Nothing waits on it. The dev server has no such route (asked, it answers 404, an error in the
 *  console): there localStorage alone keeps friday. */
export const keepStart = (at: number | null) => {
  if (import.meta.env.DEV) return;
  const url = at === null ? "/friday" : `/friday?at=${Math.floor(at)}`;
  fetch(url, { cache: "no-store" }).catch(() => {});
};
