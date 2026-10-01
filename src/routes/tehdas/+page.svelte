<script lang="ts">
  import DayReview from "$lib/components/DayReview.svelte";
  import FactoryStage from "$lib/components/FactoryStage.svelte";
  import Memo from "$lib/components/Memo.svelte";
  import TopBar from "$lib/components/TopBar.svelte";
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
  <TopBar>
    <dl class="hud">
      <div>
        <dt class="label">{week.current.name}</dt>
        <dd class="num">
          {week.screen === "shift" ? `${week.hud.left} to come` : "clocked out"}
        </dd>
      </div>
      {#if week.screen === "shift"}
        <div>
          <dt class="label">belt</dt>
          <dd class="num" class:fast={week.hud.pace > 1}>×{week.hud.pace.toFixed(1)}</dd>
        </div>
      {/if}
      {#if week.screen === "shift"}
        <div>
          <dt class="label">in queue</dt>
          <dd class="num">{week.hud.queued}</dd>
        </div>
        <div>
          <dt class="label">dropped</dt>
          <dd class="num">{week.hud.dropped}</dd>
        </div>
        <div>
          <dt class="label">shipped</dt>
          <dd class="num">{week.hud.shipped}</dd>
        </div>
      {/if}
    </dl>
  </TopBar>

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
    padding: calc(0.75rem + env(safe-area-inset-top)) 1rem
      calc(1.5rem + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .hud {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.5rem;
    margin: 0;
  }

  dd {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 500;
  }

  .fast {
    color: var(--halo-accent);
  }

  .caption {
    text-align: center;
    margin: 0.5rem 0 0;
  }
</style>
