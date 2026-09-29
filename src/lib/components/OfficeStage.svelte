<script lang="ts">
  import type { Snippet } from "svelte";

  import { drawOffice } from "$lib/office/draw";
  import { AI_MOUTH, FLY_S, type OfficeState, SCENE_H, SCENE_W } from "$lib/office/engine";
  import { officeWeek } from "$lib/office/week.svelte";
  import { createCamera, type Fit, fitScene } from "$lib/scene/camera";

  type Props = {
    /** A card over the whole scene: memo, payslip. */
    children?: Snippet;
    /** The desk controls: floating in a corner of the scene on a wide screen, below it on a
     *  narrow one. */
    dock?: Snippet;
    /** CSS px of page around the stage, so the scene never pushes the page into scrolling. */
    reserve?: number;
    /** Dim the scene and show `children` over it. */
    covered?: boolean;
  };

  let { children, dock, reserve = 140, covered = false }: Props = $props();

  let wrap: HTMLDivElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let frameEl: HTMLDivElement | undefined = $state();
  let fit = $state<Fit>({ scale: 2, sceneCss: SCENE_W, viewCss: SCENE_W });

  $effect(() => {
    const el = wrap;
    if (!el) return;
    const resize = () => {
      const next = fitScene(el.clientWidth, SCENE_W, SCENE_H, window.innerHeight - reserve);
      fit = next;
      if (canvas) {
        canvas.width = SCENE_W * next.scale;
        canvas.height = SCENE_H * next.scale;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  });

  /** Where the camera looks when the screen is too narrow for the whole room. */
  const focusOf = (s: OfficeState): number => {
    const desk = SCENE_W / 2;
    if (s.drone.carrying !== null) return s.drone.x;
    let flying: (typeof s.envelopes)[number] | undefined;
    for (let i = s.envelopes.length - 1; i >= 0 && !flying; i--) {
      const e = s.envelopes[i];
      if (e.stage === "fly-in" || e.stage === "fly-out") flying = e;
    }
    if (!flying) return desk;
    const early = s.t - flying.stageAt < FLY_S * 0.5;
    if (flying.stage === "fly-in") return early ? AI_MOUTH[flying.from].x : desk;
    return early ? desk : AI_MOUTH[flying.to].x;
  };

  $effect(() => {
    const el = canvas;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const camera = createCamera();
    let raf = 0;
    let last = performance.now();
    let shown = NaN;
    let skip = false;
    const frame = (now: number) => {
      // Friday is a screensaver: half the frame rate is plenty for moss and a deer.
      skip = officeWeek.mood.after && !skip;
      if (skip) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      officeWeek.tick(dt);
      const k = el.width / SCENE_W;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      drawOffice(ctx, officeWeek.sim, officeWeek.mood);
      const focus = officeWeek.mood.after ? SCENE_W / 2 : focusOf(officeWeek.sim);
      const offset = camera.follow(fit, SCENE_W, focus, dt);
      if (frameEl && offset !== shown) {
        frameEl.style.transform = `translateX(${-offset}px)`;
        shown = offset;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="stage" bind:this={wrap}>
  <div class="box" style:width="{fit.viewCss}px">
    <div class="viewport">
      <div class="frame" bind:this={frameEl} style:width="{fit.sceneCss}px">
        <canvas bind:this={canvas} aria-label="an office: two AI slabs and a desk between them"
        ></canvas>
      </div>
    </div>
    {#if children && covered}
      <div class="overlay">{@render children()}</div>
    {/if}
    {#if dock}
      <div class="dock">{@render dock()}</div>
    {/if}
  </div>
</div>

<style>
  .stage {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  .box {
    position: relative;
    max-width: 100%;
  }

  .viewport {
    overflow: hidden;
    border-radius: var(--halo-radius);
    box-shadow: var(--halo-shadow);
  }

  canvas {
    display: block;
    width: 100%;
    image-rendering: pixelated;
    aspect-ratio: 320 / 180;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 0.5rem;
    background: rgb(0 0 0 / 25%);
    border-radius: var(--halo-radius);
  }

  .dock {
    position: absolute;
    right: 0.6rem;
    bottom: 0.6rem;
  }

  .dock :global(.panel) {
    width: 19rem;
    padding: 0.75rem;
  }

  .dock :global(.row) {
    gap: 0.4rem;
  }

  .dock :global(.row button) {
    min-width: 0;
    padding-inline: 0.45rem;
    font-size: 0.85rem;
    gap: 0.3rem;
  }

  @media (max-width: 760px) {
    .overlay {
      position: static;
      background: none;
      padding: 1rem 0 0;
    }
  }

  /* Below this the floating desk would cover too much of a small scene. */
  @media (max-width: 900px) {
    .dock {
      position: static;
      display: flex;
      justify-content: center;
      padding-top: 0.75rem;
    }

    .dock :global(.panel) {
      width: min(100%, 26rem);
    }
  }
</style>
