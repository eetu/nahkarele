<script lang="ts">
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import Square from "@lucide/svelte/icons/square";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import VolumeX from "@lucide/svelte/icons/volume-x";

  import { asset } from "$app/paths";
  import { type Reel, sfx } from "$lib/audio/sfx.svelte";
  import { type Deck, initialDeck, stepDeck } from "$lib/tape/cassette";
  import { drawCassette, readPalette, SHELL_H, SHELL_W } from "$lib/tape/draw";
  import { cueAt, CUES, TAPE_SECONDS } from "$lib/tape/orientation";

  const RECORDING = asset("/tape/orientation.mp3");

  let canvas: HTMLCanvasElement | undefined = $state();
  let mode = $state<Deck>("stop");
  let position = $state(0);

  const cue = $derived(cueAt(position));
  const caption = $derived(cue >= 0 ? CUES[cue].text : "");

  const deck = initialDeck();
  let wake: (() => void) | null = null;

  let recording: AudioBuffer | null = null;
  /** The tape on the head, and one still running out after stop rewound the counter. */
  let reel: Reel | null = null;
  let coast: Reel | null = null;

  const unthread = () => {
    reel?.stop();
    coast?.stop();
    reel = coast = null;
  };

  const toggle = () => {
    // Play is the only gesture on the front page: the sound has to start from it, in the
    // session that plays through the silent switch.
    sfx.session("playback");
    sfx.unlock();
    if (mode === "play") {
      mode = "pause";
      return;
    }
    coast?.stop();
    coast = null;
    if (position >= TAPE_SECONDS) position = 0;
    mode = "play";
    fetchRecording();
  };

  const fetchRecording = () => {
    if (!recording) void sfx.load(RECORDING).then((buffer) => (recording ??= buffer));
  };

  /** The tape runs out past the head as the reels wind down. */
  const release = () => {
    coast?.stop();
    coast = reel;
    reel = null;
  };

  const stop = () => {
    sfx.session("auto");
    mode = "stop";
    position = 0;
    release();
  };

  // Muting stops the tape; unmuting threads it again where the counter is.
  $effect(() => {
    if (sfx.muted) unthread();
    else if (mode === "play") fetchRecording();
  });

  // One frame loop while anything moves: playing, or the reels still coasting down.
  // Idle, the canvas holds its last frame and costs nothing.
  $effect(() => {
    const el = canvas;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    let palette = readPalette();
    let raf = 0;
    let last = performance.now();

    const paint = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      if (el.width !== Math.round(w * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(((w * SHELL_H) / SHELL_W) * dpr);
      }
      const k = el.width / SHELL_W;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      drawCassette(ctx, deck, palette);
    };

    const frame = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      // The tape moves at the reels' speed, so a pause slurs out and play winds up.
      if (mode === "play" || mode === "pause") {
        position = Math.min(TAPE_SECONDS, position + dt * deck.spin);
        if (position >= TAPE_SECONDS) {
          sfx.session("auto");
          mode = "stop";
          release();
        }
      }
      stepDeck(deck, dt, mode, position / TAPE_SECONDS);
      if (mode === "play" && !reel && recording) reel = sfx.reel(recording, position);
      reel?.speed(deck.spin);
      coast?.speed(deck.spin);
      if (deck.spin === 0) {
        coast?.stop();
        coast = null;
        if (mode !== "play") {
          reel?.stop();
          reel = null;
        }
      }
      paint();
      raf = mode === "play" || deck.spin > 0 ? requestAnimationFrame(frame) : 0;
    };

    wake = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      palette = readPalette();
      paint();
    };
    scheme.addEventListener("change", onScheme);
    const resize = new ResizeObserver(paint);
    resize.observe(el);
    document.fonts?.ready.then(paint);

    return () => {
      cancelAnimationFrame(raf);
      scheme.removeEventListener("change", onScheme);
      resize.disconnect();
      wake = null;
      unthread();
      sfx.session("auto");
    };
  });

  $effect(() => {
    void mode;
    wake?.();
  });
</script>

<figure class="deck">
  <canvas bind:this={canvas} aria-label="orientation cassette"></canvas>
  <div class="keys">
    <button class="key" onclick={toggle} aria-label={mode === "play" ? "pause" : "play"}>
      {#if mode === "play"}<Pause size={18} />{:else}<Play size={18} />{/if}
    </button>
    <button class="key" onclick={stop} aria-label="stop" disabled={position === 0}>
      <Square size={16} />
    </button>
    <button class="key" onclick={sfx.toggleMute} aria-label={sfx.muted ? "sound on" : "sound off"}>
      {#if sfx.muted}<VolumeX size={18} />{:else}<Volume2 size={18} />{/if}
    </button>
  </div>
  <figcaption aria-live="polite">
    {#if caption}
      {caption}
    {:else if position >= TAPE_SECONDS}
      end of side a.
    {:else}
      press play for your orientation.
    {/if}
  </figcaption>
</figure>

<style>
  .deck {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  canvas {
    width: 100%;
    aspect-ratio: 100.5 / 63.8;
    display: block;
  }

  figcaption {
    min-height: 4.2em;
    color: var(--halo-text-main);
    line-height: 1.4;
  }

  .keys {
    display: flex;
    gap: 0.5rem;
  }
</style>
