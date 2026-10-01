<script lang="ts">
  import LogOut from "@lucide/svelte/icons/log-out";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import VolumeX from "@lucide/svelte/icons/volume-x";
  import type { Snippet } from "svelte";

  import { resolve } from "$app/paths";
  import { sfx } from "$lib/audio/sfx.svelte";
  import { leaveKey } from "$lib/keys";

  type Props = { children?: Snippet };

  let { children }: Props = $props();

  const label = $derived(sfx.muted ? "sound on" : "sound off");

  const onKey = (e: KeyboardEvent) => {
    if (leaveKey(e) || e.key.toLowerCase() !== "m") return;
    e.preventDefault();
    sfx.toggleMute();
  };
</script>

<svelte:window onkeydown={onKey} />

<header class="top">
  {@render children?.()}
  <button
    class="sound"
    onmousedown={(e) => e.preventDefault()}
    onclick={sfx.toggleMute}
    aria-label={label}
    title="{label} (m)"
  >
    {#if sfx.muted}<VolumeX size={16} />{:else}<Volume2 size={16} />{/if}
  </button>
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

  .sound {
    margin-left: auto;
    padding: 0.4rem 0.6rem;
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
