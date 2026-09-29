<script lang="ts">
  import { createNixieRow, type NixieRow } from "@glowbox/nixie";

  /** "HH:MM", or "" for a dead clock: tubes in place, nothing lit. */
  type Props = { value: string };

  let { value }: Props = $props();

  const LIT = "#ff9a3c";
  const DEAD = "#24160e";

  let box: HTMLDivElement | undefined = $state();
  let row: NixieRow | null = null;

  $effect(() => {
    if (!box) return;
    row = createNixieRow(box, {
      value: "00:00",
      gap: 2,
      glow: 0.8,
      color: LIT,
      label: "wall clock",
    });
    const ro = new ResizeObserver(() => row?.tubes.forEach((t) => t.resize()));
    ro.observe(box);
    return () => {
      ro.disconnect();
      row?.dispose();
      row = null;
    };
  });

  // Same length every tick, so the tubes relight in place.
  $effect(() => {
    const dead = value === "";
    row?.setOptions({ color: dead ? DEAD : LIT, glow: dead ? 0 : 0.8 });
    row?.setValue(dead ? "00:00" : value);
  });
</script>

<div class="clock" bind:this={box}></div>

<style>
  .clock {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
  }
</style>
