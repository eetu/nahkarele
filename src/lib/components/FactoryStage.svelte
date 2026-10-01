<script lang="ts">
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Stamp from "@lucide/svelte/icons/stamp";
  import type { Snippet } from "svelte";

  import { panOf, sfx } from "$lib/audio/sfx.svelte";
  import { BUTTONS, CLOCK, createStagecraft, drawFactory, SIGNS } from "$lib/factory/draw";
  import {
    decide,
    type FactoryEvent,
    GATE_X,
    MACHINE_IN,
    MACHINE_OUT,
    onCurrent,
    SCENE_H,
    SCENE_W,
    SHRED_X,
    step,
  } from "$lib/factory/engine";
  import { week } from "$lib/factory/week.svelte";
  import { leaveKey } from "$lib/keys";
  import { createCamera, type Fit, fitScene } from "$lib/scene/camera";

  import NixieClock from "./NixieClock.svelte";
  import SceneSign from "./SceneSign.svelte";

  type Props = {
    children?: Snippet;
    /** Dim the scene and show `children` over it: memo, review. */
    covered?: boolean;
  };

  let { children, covered = false }: Props = $props();

  let wrap: HTMLDivElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let frameEl: HTMLDivElement | undefined = $state();
  let fit = $state<Fit>({ scale: 2, sceneCss: SCENE_W, viewCss: SCENE_W });
  /** On a narrow screen the camera holds the stretch from the gate to TÄ'h. */
  const FOCUS_X = 205;
  /** Set when the canvas was cleared by a resize, so a held frame is painted again. */
  let dirty = true;

  const staffed = $derived(week.screen === "shift");
  const SCENE = { w: SCENE_W, h: SCENE_H };
  const st = createStagecraft();

  const act = (stampIt: boolean) => {
    if (!staffed || week.away || !decide(week.sim, stampIt)) return;
    if (stampIt) {
      st.plungeAt = week.sim.t;
      sfx.stamp();
    } else {
      st.pullAt = week.sim.t;
      sfx.lever();
    }
    week.sync();
  };

  const onPointer = (e: PointerEvent) => {
    if (!staffed || !canvas) return;
    const box = canvas.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * SCENE_W;
    const y = ((e.clientY - box.top) / box.height) * SCENE_H;
    const near = (b: { x: number; y: number }) => Math.hypot(x - b.x, y - b.y) <= BUTTONS.r + 3;
    if (near(BUTTONS.stamp) || onCurrent(week.sim, x, y)) act(true);
    else if (near(BUTTONS.pass)) act(false);
  };

  const STAMP_KEYS = new Set([" ", "x", "X", "ArrowDown"]);
  const PASS_KEYS = new Set(["Enter", "ArrowRight", "d", "D"]);

  const onKey = (e: KeyboardEvent) => {
    if (!staffed || leaveKey(e)) return;
    if (e.key === "w" || e.key === "W") week.toggleBreak();
    else if (STAMP_KEYS.has(e.key)) act(true);
    else if (PASS_KEYS.has(e.key)) act(false);
    else return;
    e.preventDefault();
  };

  // The scale follows the space the page gives the stage, never the canvas's own size.
  $effect(() => {
    const el = wrap;
    if (!el) return;
    const resize = () => {
      const next = fitScene(el.clientWidth, SCENE_W, SCENE_H, window.innerHeight - 220);
      fit = next;
      if (canvas) {
        canvas.width = SCENE_W * next.scale;
        canvas.height = SCENE_H * next.scale;
        dirty = true;
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

  const pan = (x: number) => panOf(x, SCENE_W);

  const play = (e: FactoryEvent) => {
    if (e.kind === "gate") sfx.relay(pan(GATE_X));
    else if (e.kind === "tip") sfx.flop(e.model === "boot", pan(e.x));
    else if (e.kind === "scan") sfx.scan(pan(MACHINE_IN + 30));
    else if (e.kind === "verdict") {
      if (e.correction) sfx.chime(e.correction === "caught", pan(MACHINE_OUT));
      if (e.defect) sfx.shred(pan(SHRED_X));
    } else if (e.kind === "lift") sfx.whirr(pan(e.x));
    else if (e.kind === "drop") {
      if (e.defect) sfx.shred(pan(e.x));
      else sfx.flop(false, pan(e.x));
    } else sfx.whistle();
  };

  $effect(() => {
    const el = canvas;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    let raf = 0;
    let last = performance.now();
    // Boots reach TÄ'h in id order, so the highest id seen is enough.
    let lastSeen = 0;
    let sim = week.sim;
    let painted: typeof sim | null = null;
    const camera = createCamera();
    let shown = NaN;

    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const offset = camera.follow(fit, SCENE_W, FOCUS_X, dt);
      if (frameEl && offset !== shown) {
        frameEl.style.transform = `translateX(${-offset}px)`;
        shown = offset;
      }
      const s = week.sim;
      if (s !== sim) {
        sim = s;
        lastSeen = 0;
        st.sparkles = [];
        if (week.screen === "shift") sfx.whistle();
      }
      // Reviews hold the last frame; nothing moves and nothing is redrawn.
      const live = week.screen === "shift" || week.screen === "memo";
      // Between shifts the line is heard from the door.
      sfx.duck(week.screen === "shift" ? 1 : 0.4);
      sfx.bed("belt", live ? 0.05 : 0, s.pace);
      if (!live && painted === s && !dirty) {
        raf = requestAnimationFrame(frame);
        return;
      }
      // A break: time flies.
      if (live) step(s, s.away ? dt * 3 : dt);
      for (const item of s.items) {
        if (item.correction && item.id > lastSeen) {
          lastSeen = item.id;
          st.sparkles = [
            ...st.sparkles.filter((sp) => s.t - sp.at < 1),
            { at: s.t, caught: item.correction === "caught" },
          ];
        }
      }
      for (const e of s.events.splice(0)) play(e);
      week.sync();
      const k = el.width / SCENE_W;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      drawFactory(ctx, s, st, week.screen === "shift" && !s.away);
      painted = live ? null : s;
      dirty = false;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      sfx.bed("belt", 0);
      sfx.duck(1);
    };
  });

  const ready = $derived(staffed && !week.away && week.hud.waiting);
</script>

<svelte:window onkeydown={onKey} />

<div class="stage" bind:this={wrap}>
  <div class="box" style:width="{fit.viewCss}px">
    <div class="viewport">
      <div class="frame" bind:this={frameEl} style:width="{fit.sceneCss}px">
        <canvas
          bind:this={canvas}
          onpointerdown={onPointer}
          class:staffed
          aria-label="a conveyor belt of rubber boots, a gate, and TÄ'h the inspection machine"
        ></canvas>
        <div
          class="nixie"
          style:left="{(CLOCK.x / SCENE_W) * 100}%"
          style:top="{(CLOCK.y / SCENE_H) * 100}%"
          style:width="{(CLOCK.w / SCENE_W) * 100}%"
          style:height="{(CLOCK.h / SCENE_H) * 100}%"
        >
          <NixieClock value={week.hud.clock} />
        </div>
        <SceneSign at={SIGNS.exit} scene={SCENE} label="exit" home />
        {#if staffed}
          <SceneSign
            at={SIGNS.wc}
            scene={SCENE}
            label={week.away ? "back to work (w)" : "toilet break (w)"}
            onclick={week.toggleBreak}
            invite={!week.away}
          />
        {/if}
      </div>
    </div>
    {#if children && covered}
      <div class="overlay">{@render children()}</div>
    {/if}
  </div>
  {#if staffed}
    <p class="sr-only" aria-live="polite">{ready ? "a boot is waiting at the gate" : ""}</p>
    <div class="controls">
      <!-- Mouse clicks don't take focus, so Enter and Space keep meaning pass and stamp. -->
      <button
        class="stamp"
        disabled={!ready}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => act(true)}
      >
        <Stamp size={18} /> stamp <kbd>space</kbd>
      </button>
      <button
        class="pass"
        disabled={!ready}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => act(false)}
      >
        pass <ArrowRight size={18} /> <kbd>enter</kbd>
      </button>
    </div>
  {/if}
</div>

<style>
  .stage {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
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

  .frame {
    position: relative;
  }

  canvas {
    display: block;
    width: 100%;
    image-rendering: pixelated;
    aspect-ratio: 320 / 180;
    touch-action: manipulation;
  }

  canvas.staffed {
    cursor: crosshair;
  }

  .nixie {
    position: absolute;
    pointer-events: none;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 0.5rem;
    background: rgb(0 0 0 / 25%);
    border-radius: var(--halo-radius);
    /* The signs on the wall stay pressable through the dimming; only the card takes clicks. */
    pointer-events: none;
  }

  .overlay > :global(*) {
    pointer-events: auto;
  }

  .controls {
    display: flex;
    gap: 0.75rem;
  }

  .controls button {
    padding: 0.7rem 1.4rem;
    font-size: 1rem;
  }

  .stamp:not(:disabled) {
    background: #c8452f;
    border-color: #c8452f;
    color: #fff;
  }

  .pass:not(:disabled) {
    border-color: var(--halo-connected);
  }

  kbd {
    font-family: var(--halo-font-heading);
    font-size: 0.7rem;
    opacity: 0.7;
  }

  @media (max-width: 760px) {
    .overlay {
      position: static;
      background: none;
      padding: 1rem 0 0;
    }

    kbd {
      display: none;
    }

    .controls button {
      flex: 1;
      justify-content: center;
    }

    .controls {
      width: 100%;
    }
  }
</style>
