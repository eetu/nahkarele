<script lang="ts">
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

  import DeskPanel from "$lib/components/DeskPanel.svelte";
  import OfficeMemo from "$lib/components/OfficeMemo.svelte";
  import OfficeStage from "$lib/components/OfficeStage.svelte";
  import Payslip from "$lib/components/Payslip.svelte";
  import TopBar from "$lib/components/TopBar.svelte";
  import { debugDay } from "$lib/debug";
  import { eur } from "$lib/format";
  import { officeWeek } from "$lib/office/week.svelte";

  const onDebugKey = (e: KeyboardEvent) => {
    const day = debugDay(e);
    if (day === null) return;
    e.preventDefault();
    officeWeek.jump(day);
  };
</script>

<svelte:head><title>software specialist · nahkarele</title></svelte:head>
<svelte:window onkeydown={onDebugKey} />

{#snippet desk()}<DeskPanel />{/snippet}

<div class="page">
  <TopBar>
    <dl class="hud">
      <div>
        <dt class="label">{officeWeek.current.name}</dt>
        <dd class="num">
          {#if officeWeek.screen === "loop"}—{:else if officeWeek.screen === "shift"}{officeWeek.hud
              .left}
            to come{:else}clocked out{/if}
        </dd>
      </div>
      {#if officeWeek.screen === "shift" || officeWeek.screen === "blast"}
        <div>
          <dt class="label">salary</dt>
          <dd class="num">{eur(officeWeek.hud.salary)}</dd>
        </div>
      {/if}
    </dl>
  </TopBar>

  <main>
    <!-- One stage for the whole week: the canvas and its loop survive every screen change. -->
    <OfficeStage
      covered={officeWeek.screen === "memo" || officeWeek.screen === "review"}
      dock={officeWeek.screen === "shift" ? desk : undefined}
      reserve={officeWeek.screen === "loop" ? 200 : 140}
    >
      {#if officeWeek.screen === "memo"}
        <OfficeMemo />
      {:else if officeWeek.screen === "review"}
        <Payslip />
      {/if}
    </OfficeStage>

    {#if officeWeek.screen === "loop"}
      <div class="after">
        <p class="label">no one is clocked in.</p>
        <button onclick={officeWeek.newWeek}><RotateCcw size={16} /> new week</button>
      </div>
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

  .after {
    display: flex;
    justify-content: center;
    margin-top: 0.75rem;
  }

  .after {
    align-items: center;
    gap: 1rem;
  }

  .after p {
    margin: 0;
  }
</style>
