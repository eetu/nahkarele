<script lang="ts">
  import "@fontsource/inter/400.css";
  import "@fontsource/inter/500.css";
  import "@fontsource/inter/600.css";
  import "@fontsource/space-grotesk/400.css";
  import "@fontsource/space-grotesk/500.css";
  import "$lib/styles/halo.css";

  import { updated } from "$app/state";

  let { children } = $props();

  // Nothing in a shift is worth keeping across a deploy.
  $effect(() => {
    if (updated.current) location.reload();
  });

  $effect(() => {
    const standalone =
      ("standalone" in navigator && navigator.standalone === true) ||
      matchMedia("(display-mode: standalone)").matches;
    document.documentElement.classList.toggle("standalone", standalone);
  });
</script>

{@render children()}

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
