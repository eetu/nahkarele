<script lang="ts">
  import LogOut from "@lucide/svelte/icons/log-out";
  import Maximize from "@lucide/svelte/icons/maximize";
  import Minimize from "@lucide/svelte/icons/minimize";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import VolumeX from "@lucide/svelte/icons/volume-x";
  import type { Snippet } from "svelte";

  import { resolve } from "$app/paths";
  import { sfx } from "$lib/audio/sfx.svelte";
  import { leaveKey } from "$lib/keys";

  type Props = { children?: Snippet };

  let { children }: Props = $props();

  const label = $derived(sfx.muted ? "sound on" : "sound off");

  // Fullscreen hides the browser's bars where the browser allows it (not iPhone Safari,
  // which only lets video go fullscreen; there, add to home screen does the same job).
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;
  let fullscreen = $state(false);
  const fullLabel = $derived(fullscreen ? "leave fullscreen" : "fullscreen");

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };

  const onKey = (e: KeyboardEvent) => {
    if (leaveKey(e)) return;
    const k = e.key.toLowerCase();
    if (k === "m") sfx.toggleMute();
    else if (k === "f" && canFullscreen) toggleFullscreen();
    else return;
    e.preventDefault();
  };
</script>

<svelte:window
  onkeydown={onKey}
  onfullscreenchange={() => (fullscreen = document.fullscreenElement !== null)}
/>

<header class="top">
  {@render children?.()}
  <button
    class="icon sound"
    onmousedown={(e) => e.preventDefault()}
    onclick={sfx.toggleMute}
    aria-label={label}
    title="{label} (m)"
  >
    {#if sfx.muted}<VolumeX size={16} />{:else}<Volume2 size={16} />{/if}
  </button>
  {#if canFullscreen}
    <button
      class="icon"
      onmousedown={(e) => e.preventDefault()}
      onclick={toggleFullscreen}
      aria-label={fullLabel}
      title="{fullLabel} (f)"
    >
      {#if fullscreen}<Minimize size={16} />{:else}<Maximize size={16} />{/if}
    </button>
  {/if}
  <a class="exit" href={resolve("/")}><LogOut size={16} /> exit</a>
</header>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 0.75rem 2rem;
    flex-wrap: wrap;
    min-height: 2.5rem;
  }

  .icon {
    padding: 0.4rem 0.6rem;
  }

  .sound {
    margin-left: auto;
  }

  .exit {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--halo-border);
    border-radius: var(--halo-radius);
    color: var(--halo-text-main);
    font-family: var(--halo-font-heading);
    font-size: 0.9rem;
    text-decoration: none;
  }

  .exit:hover {
    border-color: var(--halo-text-muted);
  }
</style>
