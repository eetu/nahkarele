<script lang="ts">
  import { OFFICE_DAYS } from "$lib/office/days";
  import { drawOffice } from "$lib/office/draw";
  import { createOffice } from "$lib/office/engine";

  const times = [44, 44.3, 44.6, 44.9, 45.2, 45.5, 52, 60];
  const paint = (el: HTMLCanvasElement, since: number) => {
    const s = createOffice(OFFICE_DAYS[4], 5);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(4, 0, 0, 4, 0, 0);
    ctx.translate(-205, -122);
    drawOffice(ctx, s, { blast: null, after: true, since, pressedAt: -10 });
  };
</script>

<div style="display: flex; flex-wrap: wrap; gap: 6px">
  {#each times as since (since)}
    <canvas width="400" height="232" use:paint={since}></canvas>
  {/each}
</div>
