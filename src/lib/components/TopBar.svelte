<script lang="ts">
  import LogOut from "@lucide/svelte/icons/log-out";
  import type { Snippet } from "svelte";

  import { resolve } from "$app/paths";

  type Props = { children?: Snippet };

  let { children }: Props = $props();
</script>

<header class="top">
  {@render children?.()}
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

  .exit {
    margin-left: auto;
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
