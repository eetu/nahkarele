<script lang="ts">
  import DeskPanel from "$lib/components/office/DeskPanel.svelte";
  import OfficeMemo from "$lib/components/office/OfficeMemo.svelte";
  import OfficeStage from "$lib/components/office/OfficeStage.svelte";
  import Payslip from "$lib/components/office/Payslip.svelte";
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
  <!-- The numbers are on the walls (calendar, the pay readout); this copy is for ears. -->
  <dl class="sr-only" aria-label="shift">
    <dt>day</dt>
    <dd>{officeWeek.current.name}</dd>
    {#if officeWeek.screen === "shift"}
      <dt>to come</dt>
      <dd>{officeWeek.hud.left}</dd>
      <dt>salary</dt>
      <dd>{eur(officeWeek.hud.salary)}</dd>
    {/if}
  </dl>

  <main>
    <!-- One stage for the whole week: the canvas and its loop survive every screen change. -->
    <OfficeStage
      covered={officeWeek.screen === "memo" || officeWeek.screen === "review"}
      dock={officeWeek.screen === "shift" ? desk : undefined}
    >
      {#if officeWeek.screen === "memo"}
        <OfficeMemo />
      {:else if officeWeek.screen === "review"}
        <Payslip />
      {/if}
    </OfficeStage>
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

  /* Fullscreen is the room alone, centred on black. */
  :global(html:fullscreen) .page {
    max-width: none;
    min-height: 100vh;
    padding: 0;
    justify-content: center;
  }
</style>
