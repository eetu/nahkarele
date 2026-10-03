<script lang="ts">
  import "@fontsource/inter/400.css";
  import "@fontsource/inter/500.css";
  import "@fontsource/inter/600.css";
  import "@fontsource/space-grotesk/400.css";
  import "@fontsource/space-grotesk/500.css";
  import "@fontsource/pixelify-sans/400.css";
  import "@fontsource/pixelify-sans/600.css";
  import "$lib/styles/halo.css";
  import "$lib/styles/pixel.css";

  import type { Component } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page, updated } from "$app/state";
  import { sfx } from "$lib/audio/sfx.svelte";
  import { benchKey } from "$lib/debug";
  import { leaveKey } from "$lib/keys";

  let { children } = $props();

  // Dev only, and loaded only in dev: a production build drops this branch and the bar with it.
  let DevBar = $state<Component | null>(null);
  if (import.meta.env.DEV) {
    void import("$lib/components/DevBar.svelte").then((m) => (DevBar = m.default));
  }

  /** Set when the key opened the workbench, so the same key goes back to where it was. */
  let fromGame = false;

  const onKey = (e: KeyboardEvent) => {
    sfx.unlock();
    if (!benchKey(e) || leaveKey(e)) return;
    e.preventDefault();
    if (page.url.pathname !== resolve("/workbench")) {
      fromGame = true;
      void goto(resolve("/workbench"));
    } else if (fromGame) {
      fromGame = false;
      history.back();
    } else {
      void goto(resolve("/"));
    }
  };

  // A new deploy loads straight away on the front page, where nothing is lost. In a room the
  // week stays; SvelteKit reloads on the next navigation anyway.
  $effect(() => {
    if (updated.current && page.url.pathname === "/") location.reload();
  });

  $effect(() => {
    const standalone =
      ("standalone" in navigator && navigator.standalone === true) ||
      matchMedia("(display-mode: standalone)").matches;
    document.documentElement.classList.toggle("standalone", standalone);
  });
</script>

<!-- Sound may only start inside a gesture. A touch counts when the finger lifts, not when it
     lands, and iOS wants the context created in a counted gesture: no pointerdown here. -->
<svelte:window
  onpointerup={sfx.unlock}
  ontouchend={sfx.unlock}
  onclick={sfx.unlock}
  onkeydown={onKey}
/>

{@render children()}

{#if DevBar && page.url.pathname !== resolve("/workbench")}<DevBar />{/if}

<style>
  :global(html),
  :global(body) {
    height: 100svh;
    height: 100dvh;
  }

  :global(html.standalone),
  :global(html.standalone body) {
    height: 100vh;
  }

  /* A game page: a fast second tap next to a button must not zoom the page, and a drag
     past the edge must not pull-to-refresh. Pinch zoom and scrolling stay. */
  :global(html) {
    touch-action: manipulation;
    overscroll-behavior: none;
  }

  :global(body) {
    margin: 0;
    background: var(--halo-body);
    color: var(--halo-text-main);
    font-family: var(--halo-font-body);
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  :global(button) {
    font: inherit;
    font-family: var(--halo-font-heading);
    font-size: 0.9rem;
    letter-spacing: 0.01em;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--halo-border);
    border-radius: var(--halo-radius);
    background: var(--halo-bg-main);
    color: var(--halo-text-main);
    cursor: pointer;
    transition:
      background var(--halo-d-fast),
      border-color var(--halo-d-fast);
    -webkit-tap-highlight-color: transparent;
    -webkit-user-select: none;
    user-select: none;
  }

  :global(button:hover:not(:disabled)) {
    border-color: var(--halo-text-muted);
  }

  :global(a:focus-visible) {
    outline: 2px solid var(--halo-accent);
    outline-offset: 2px;
  }

  :global(.sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  :global(button:focus-visible) {
    outline: 2px solid var(--halo-accent);
    outline-offset: 2px;
  }

  :global(button:disabled) {
    opacity: 0.45;
    cursor: default;
  }

  :global(button.primary) {
    background: var(--halo-accent);
    border-color: var(--halo-accent);
    color: var(--halo-on-accent);
    font-weight: 500;
  }

  :global(button.key) {
    padding: 0.5rem;
  }

  :global(.label) {
    font-family: var(--halo-font-heading);
    font-size: 0.75rem;
    text-transform: lowercase;
    letter-spacing: 0.04em;
    color: var(--halo-text-muted);
  }

  :global(.brand) {
    text-transform: none;
  }

  :global(.num) {
    font-variant-numeric: tabular-nums;
  }
</style>
