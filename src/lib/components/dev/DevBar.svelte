<script lang="ts">
  import Wrench from "@lucide/svelte/icons/wrench";

  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { DAYS } from "$lib/factory/days";
  import { week } from "$lib/factory/week.svelte";
  import { OFFICE_DAYS } from "$lib/office/days";
  import { officeWeek } from "$lib/office/week.svelte";

  import FridayScrub from "./FridayScrub.svelte";

  const room = $derived(
    page.url.pathname === resolve("/tehdas")
      ? "factory"
      : page.url.pathname === resolve("/specialist")
        ? "office"
        : null,
  );
  const days = $derived(room === "factory" ? DAYS : room === "office" ? OFFICE_DAYS : []);
  const today = $derived(room === "factory" ? week.day : room === "office" ? officeWeek.day : -1);

  const jump = (day: number) => (room === "factory" ? week.jump(day) : officeWeek.jump(day));
</script>

<aside class="devbar" aria-label="development tools">
  <div class="row halo-card">
    <span class="label">dev</span>
    {#if days.length}
      <div class="days">
        {#each days as d, i (d.name)}
          <button
            class:active={i === today}
            onclick={() => jump(i)}
            title="{d.name} (shift+{i + 1})">{d.name.slice(0, 3)}</button
          >
        {/each}
      </div>
    {/if}
    <a class="bench" href={resolve("/workbench")} title="workbench (the key left of 1)">
      <Wrench size={14} /> workbench <kbd>`</kbd>
    </a>
  </div>
  {#if room === "office" && officeWeek.screen === "loop"}<FridayScrub />{/if}
</aside>

<style>
  .devbar {
    max-width: 72rem;
    margin: 0 auto;
    padding: 0 max(1rem, env(safe-area-inset-right)) calc(1rem + env(safe-area-inset-bottom))
      max(1rem, env(safe-area-inset-left));
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    padding: 0.5rem 0.9rem;
  }

  .days {
    display: flex;
    gap: 0.35rem;
  }

  .days button {
    padding: 0.3rem 0.55rem;
    font-size: 0.8rem;
  }

  .days button.active {
    border-color: var(--halo-accent);
    color: var(--halo-accent);
  }

  .bench {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--halo-border);
    border-radius: var(--halo-radius);
    color: var(--halo-text-main);
    font-family: var(--halo-font-heading);
    font-size: 0.8rem;
    text-decoration: none;
  }

  .bench:hover {
    border-color: var(--halo-text-muted);
  }

  kbd {
    font-family: var(--halo-font-heading);
    opacity: 0.6;
  }
</style>
