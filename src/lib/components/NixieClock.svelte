<script lang="ts">
  import { createNixieRow, type NixieRow } from "@glowbox/nixie";

  /** "HH:MM", or "" for a dead clock: tubes in place, nothing lit. */
  type Props = { value: string };

  let { value }: Props = $props();

  const LIT = "#ff9a3c";
  const DEAD = "#24160e";
  /** Below this CSS height the tubes drop their glass. */
  const SMALL_PX = 32;

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
    // The tube's glass keeps a fixed few-pixel margin and rim, which swallows the numeral in a
    // phone-sized clock. Small, the numerals go bare (and meshless) over the scene's housing.
    let small: boolean | null = null;
    const ro = new ResizeObserver(() => {
      const next = (box?.clientHeight ?? 0) < SMALL_PX;
      if (next !== small) {
        small = next;
        row?.setOptions({ bare: small, mesh: !small });
      }
      row?.tubes.forEach((t) => t.resize());
    });
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
