/**
 * Fullscreen, where the browser lets a page go fullscreen. iPhone Safari does not (video
 * only); there, add to home screen hides the browser's bars instead.
 */
class Fullscreen {
  on = $state(false);
  readonly supported = typeof document !== "undefined" && document.fullscreenEnabled;

  constructor() {
    if (typeof document === "undefined") return;
    document.addEventListener("fullscreenchange", () => {
      this.on = document.fullscreenElement !== null;
    });
  }

  toggle = () => {
    if (!this.supported) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };
}

export const fullscreen = new Fullscreen();
