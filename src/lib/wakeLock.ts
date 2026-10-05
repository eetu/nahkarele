/**
 * Keeps the screen from sleeping until the returned release is called. The browser drops the
 * lock whenever the page is hidden, so it is taken again each time the page comes back, and
 * at the next tap where a browser wants one first. Where it is refused or unsupported the
 * screen sleeps as it would.
 */
export const holdScreen = (): (() => void) => {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return () => {};
  let held = true;
  let lock: WakeLockSentinel | null = null;
  let asking = false;
  const take = async () => {
    if (!held || lock || asking || document.visibilityState !== "visible") return;
    asking = true;
    try {
      const got = await navigator.wakeLock.request("screen");
      if (!held) void got.release();
      else {
        lock = got;
        got.addEventListener("release", () => {
          if (lock === got) lock = null;
        });
      }
    } catch {
      /* refused: low battery, a power saver, a policy */
    } finally {
      asking = false;
    }
  };
  const retake = () => void take();
  document.addEventListener("visibilitychange", retake);
  window.addEventListener("pointerdown", retake);
  retake();
  return () => {
    held = false;
    document.removeEventListener("visibilitychange", retake);
    window.removeEventListener("pointerdown", retake);
    void lock?.release();
    lock = null;
  };
};
