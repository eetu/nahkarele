<script lang="ts">
  import DayReview from "$lib/components/DayReview.svelte";
  import FactoryStage from "$lib/components/FactoryStage.svelte";
  import Memo from "$lib/components/Memo.svelte";
  import WeekReview from "$lib/components/WeekReview.svelte";
  import { debugDay } from "$lib/debug";
  import { week } from "$lib/factory/week.svelte";

  const onDebugKey = (e: KeyboardEvent) => {
    const day = debugDay(e);
    if (day === null) return;
    e.preventDefault();
    week.jump(day);
  };
</script>

<svelte:window onkeydown={onDebugKey} />

<svelte:head><title>kumitehdas · nahkarele</title></svelte:head>

<div class="page">
  <!-- The numbers are on the walls (calendar, TÄ'h's readout); this copy is for ears. -->
  <dl class="sr-only" aria-label="shift">
    <dt>day</dt>
    <dd>{week.current.name}</dd>
    {#if week.screen === "shift"}
      <dt>to come</dt>
      <dd>{week.hud.left}</dd>
      <dt>belt</dt>
      <dd>×{week.hud.pace.toFixed(1)}</dd>
      <dt>in queue</dt>
      <dd>{week.hud.queued}</dd>
      <dt>shipped</dt>
      <dd>{week.hud.shipped}</dd>
    {/if}
  </dl>

  <main>
    <!-- One stage for the whole week: the canvas and its loop survive every screen change. -->
    <FactoryStage covered={week.screen !== "shift"}>
      {#if week.screen === "memo"}
        <Memo />
      {:else if week.screen === "review"}
        <DayReview />
      {:else if week.screen === "week"}
        <WeekReview />
      {/if}
    </FactoryStage>
    {#if week.screen !== "shift"}
      <p class="label caption">the line runs without you. it always has.</p>
    {/if}
  </main>
</div>

<style>
  .page {
    max-width: 72rem;
    margin: 0 auto;
    padding: calc(0.75rem + env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
      calc(1.5rem + env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .caption {
    text-align: center;
    margin: 0.5rem 0 0;
  }
</style>
