<script lang="ts">
  import { officeWeek } from "$lib/office/week.svelte";
  import { SEASON_S, seasonAt, SEASONS_FROM } from "$lib/office/wood/seasons";
  import { windAt } from "$lib/office/wood/wind";

  /** Two years of seasons after the wood has grown. */
  const END = SEASONS_FROM + 8 * SEASON_S;
  const RATES = [-60, -10, 1, 10, 60];
  const SEASONS = ["summer", "autumn", "winter", "spring"];

  // Friday's clock is not reactive state: read it a few times a second.
  let since = $state(0);
  $effect(() => {
    const id = setInterval(() => (since = officeWeek.mood.since), 150);
    return () => clearInterval(id);
  });

  const clock = $derived(
    `${Math.floor(since / 60)}:${String(Math.floor(since % 60)).padStart(2, "0")}`,
  );
  const where = $derived.by(() => {
    const w = windAt(since, officeWeek.mood.seed);
    const wind = `wind ${Math.abs(w).toFixed(2)} ${w < 0 ? "←" : "→"}`;
    if (since < SEASONS_FROM) return `the wood grows · ${wind}`;
    const { k, p } = seasonAt(since);
    const year = Math.floor((since - SEASONS_FROM) / (4 * SEASON_S)) + 1;
    return `year ${year} · ${SEASONS[k]} ${Math.round(p * 100)}% · ${wind}`;
  });

  const label = (r: number) => (r < 0 ? `◀◀ ${-r}×` : r === 1 ? "▶ 1×" : `▶▶ ${r}×`);
</script>

<div class="scrub halo-card" aria-label="friday time, dev only">
  <span class="label">dev · friday</span>
  <input
    type="range"
    min="0"
    max={END}
    step="1"
    value={Math.min(since, END)}
    oninput={(e) => officeWeek.warp(Number(e.currentTarget.value))}
  />
  <span class="num time">{clock}</span>
  <span class="label where">{where}</span>
  <div class="rates">
    {#each RATES as r (r)}
      <button class:active={officeWeek.rate === r} onclick={() => officeWeek.setRate(r)}>
        {label(r)}
      </button>
    {/each}
  </div>
</div>

<style>
  .scrub {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-top: 0.5rem;
    padding: 0.6rem 0.9rem;
  }

  input {
    flex: 1 1 14rem;
  }

  .time {
    min-width: 3.5rem;
    text-align: right;
  }

  .where {
    min-width: 11rem;
  }

  .rates {
    display: flex;
    gap: 0.35rem;
  }

  .rates button {
    padding: 0.3rem 0.55rem;
    font-size: 0.8rem;
  }

  .rates button.active {
    border-color: var(--halo-accent);
    color: var(--halo-accent);
  }
</style>
