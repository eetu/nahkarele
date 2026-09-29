<script lang="ts">
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

  import { resolve } from "$app/paths";
  import { DAYS } from "$lib/factory/days";
  import { GRADE_WORD } from "$lib/factory/review";
  import { week } from "$lib/factory/week.svelte";

  import Fireworks from "./Fireworks.svelte";

  const shipped = $derived(week.results.reduce((sum, r) => sum + r.tally.shipped, 0));
  const corrections = $derived(week.results.reduce((sum, r) => sum + r.tally.corrections, 0));
</script>

<section class="card halo-card" aria-label="end of week">
  <Fireworks />
  <div class="label">end of week · kumitehdas</div>
  <div class="grade">
    <span class="num">{week.average.toFixed(1)}</span>
    <span class="word">{GRADE_WORD[Math.round(week.average)]}</span>
  </div>
  <ol>
    {#each week.results.toSorted((a, b) => a.day - b.day) as r (r.day)}
      <li>
        <span class="label">{DAYS[r.day].name.slice(0, 2)}</span>
        <span class="num">{r.grade}</span>
      </li>
    {/each}
  </ol>
  <p>
    {shipped} shipped. TÄ'h corrected {corrections} of your decisions. on monday it is replaced by TÄ'h
    2, which has no inspection station. thank you for your service.
  </p>
  {#if week.best !== null}
    <p class="label">best week {week.best.toFixed(1)}</p>
  {/if}
  <div class="row">
    <a class="label" href={resolve("/specialist")}>
      2026: software specialist <ArrowRight size={14} />
    </a>
    <button class="primary" onclick={week.newWeek}><RotateCcw size={18} /> new week</button>
  </div>
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 32rem;
    padding: 1rem 1.25rem;
  }

  .grade {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .grade .num {
    font-size: 2.4rem;
    font-weight: 600;
    line-height: 1;
    color: var(--halo-accent);
  }

  .word {
    font-family: var(--halo-font-heading);
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.5rem;
  }

  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.3rem 0;
    border-radius: var(--halo-radius);
    background: var(--halo-bg-light);
  }

  p {
    margin: 0;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  a {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--halo-text-main);
  }
</style>
