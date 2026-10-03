<script lang="ts">
  import type { Unit, Values } from "./units";

  type Props = { unit: Unit; values: Values; t: number; zoom: number; label?: string };

  let { unit, values, t, zoom, label }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  const size = $derived(unit.size(values));
  /** Bumped by a tap, so a paused tile still shows what the tap did. */
  let taps = $state(0);

  const onTap = (e: PointerEvent) => {
    if (!unit.tap || !canvas) return;
    const box = canvas.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * size.w;
    const y = ((e.clientY - box.top) / box.height) * size.h;
    unit.tap(values, t, { x, y });
    taps += 1;
  };

  // Redrawn whenever anything it reads changes: the values, the clock, the zoom.
  $effect(() => {
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const k = zoom * (window.devicePixelRatio || 1);
    canvas.width = size.w * k;
    canvas.height = size.h * k;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    void taps;
    unit.draw(ctx, values, t);
  });
</script>

<figure>
  <canvas
    bind:this={canvas}
    class:tappable={unit.tap !== undefined}
    onpointerdown={onTap}
    style:width="{size.w * zoom}px"
    style:height="{size.h * zoom}px"
  ></canvas>
  {#if label}<figcaption class="label num">{label}</figcaption>{/if}
</figure>

<style>
  figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  canvas {
    display: block;
    image-rendering: pixelated;
    border-radius: 2px;
  }

  canvas.tappable {
    cursor: pointer;
  }
</style>
