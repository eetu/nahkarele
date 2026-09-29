<script lang="ts">
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import Square from "@lucide/svelte/icons/square";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import VolumeX from "@lucide/svelte/icons/volume-x";

  import { type Deck, initialDeck, stepDeck } from "$lib/tape/cassette";
  import { drawCassette, readPalette, SHELL_H, SHELL_W } from "$lib/tape/draw";
  import { cueAt, CUES, TAPE_SECONDS } from "$lib/tape/orientation";

  let canvas: HTMLCanvasElement | undefined = $state();
  let mode = $state<Deck>("stop");
  let position = $state(0);
  let voice = $state(true);

  const cue = $derived(cueAt(position));
  const caption = $derived(cue >= 0 ? CUES[cue].text : "");
  const canSpeak = typeof speechSynthesis !== "undefined";

  const deck = initialDeck();
  let wake: (() => void) | null = null;

  const speak = (text: string) => {
    if (!canSpeak) return;
    speechSynthesis.cancel();
    if (!voice || !text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    u.rate = 1.15;
    u.pitch = 0.8;
    speechSynthesis.speak(u);
  };

  // Speak each caption as the tape reaches it.
  let spoken = -1;
  $effect(() => {
    if (mode !== "play" || cue === spoken) return;
    spoken = cue;
    if (cue >= 0) speak(CUES[cue].text);
  });

  const toggle = () => {
    if (mode === "play") {
      mode = "pause";
      if (canSpeak) speechSynthesis.cancel();
      spoken = -1;
      return;
    }
    if (position >= TAPE_SECONDS) position = 0;
    mode = "play";
  };

  const stop = () => {
    mode = "stop";
    position = 0;
    spoken = -1;
    if (canSpeak) speechSynthesis.cancel();
  };

  const toggleVoice = () => {
    voice = !voice;
    if (!voice && canSpeak) speechSynthesis.cancel();
  };

  // One frame loop while anything moves: playing, or the reels still coasting down.
  // Idle, the canvas holds its last frame and costs nothing.
  $effect(() => {
    const el = canvas;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    let palette = readPalette(el);
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
      if (mode === "play") {
        position = Math.min(TAPE_SECONDS, position + dt);
        if (position >= TAPE_SECONDS) mode = "stop";
      }
      stepDeck(deck, dt, mode, position / TAPE_SECONDS);
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
      palette = readPalette(el);
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
      if (canSpeak) speechSynthesis.cancel();
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
    {#if canSpeak}
      <button class="key" onclick={toggleVoice} aria-label={voice ? "mute voice" : "voice on"}>
        {#if voice}<Volume2 size={18} />{:else}<VolumeX size={18} />{/if}
      </button>
    {/if}
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
