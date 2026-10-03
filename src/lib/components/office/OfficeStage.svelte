<script lang="ts">
  import type { Snippet } from "svelte";

  import { panOf, sfx } from "$lib/audio/sfx.svelte";
  import { fullscreen } from "$lib/fullscreen.svelte";
  import { leaveKey } from "$lib/keys";
  import { birdCue, drawOffice, signAt, SIGNS, wallCue } from "$lib/office/draw";
  import {
    AI_MOUTH,
    FLY_S,
    type OfficeEvent,
    type OfficeState,
    SCENE_H,
    SCENE_W,
  } from "$lib/office/engine";
  import { officeWeek } from "$lib/office/week.svelte";
  import { owlCue } from "$lib/office/wood/life";
  import { shedCue } from "$lib/office/wood/shedding";
  import { appleCue, appleTreeAt, fellCue, shakeApple } from "$lib/office/wood/stand";
  import { windAt } from "$lib/office/wood/wind";
  import { createCamera, type Fit, fitScene } from "$lib/scene/camera";

  import SceneSign from "../SceneSign.svelte";

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
  const SCENE = { w: SCENE_W, h: SCENE_H };

  /** The apple tree's crown on friday, while there is a ripe apple to shake down. */
  let appleRect = $state<{ x: number; y: number; w: number; h: number } | null>(null);
  let appleKey = "";
  // On friday the signs come down with the wall, and their buttons go with them.
  let signRects = $state({ ...SIGNS });
  let signKey = "";

  const shake = () => {
    const { mood } = officeWeek;
    const key = shakeApple(mood.since, mood.seed, mood.knocks);
    if (!key) return;
    mood.knocks[key] = mood.since;
    sfx.rustle();
  };
  const staffed = $derived(officeWeek.screen === "shift");
  /** A viewport shorter than this (a phone on its side) puts the desk beside the scene. */
  const SHORT_PX = 520;
  const short = () => window.innerHeight < SHORT_PX;

  const onKey = (e: KeyboardEvent) => {
    if (leaveKey(e)) return;
    const k = e.key.toLowerCase();
    if (k === "m") sfx.toggleMute();
    else if (k === "f") fullscreen.toggle();
    else if (k === "w" && staffed) officeWeek.toggleBreak();
    else return;
    e.preventDefault();
  };

  $effect(() => {
    const el = wrap;
    if (!el) return;
    const resize = () => {
      // Room for the desk: over or under the scene, or beside it on a phone held sideways.
      const next = short()
        ? fitScene(el.clientWidth - 320, SCENE_W, SCENE_H, window.innerHeight - 72)
        : fitScene(el.clientWidth, SCENE_W, SCENE_H, window.innerHeight - reserve);
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

  const pan = (x: number) => panOf(x, SCENE_W);

  const play = (e: OfficeEvent) => {
    if (e.kind === "send") sfx.send(pan(AI_MOUTH[e.from].x), e.direct);
    else if (e.kind === "receive") sfx.receive(pan(AI_MOUTH[e.to].x));
    else if (e.kind === "land") sfx.land();
    else sfx.flutter(pan(e.x));
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
      const { mood } = officeWeek;
      const before = { blast: mood.blast, since: mood.since };
      officeWeek.tick(dt);
      const s = officeWeek.sim;
      for (const e of s.events.splice(0)) play(e);
      if (before.blast === null && mood.blast !== null) sfx.blast();
      if (mood.after) {
        const cue = birdCue(before.since, mood.since);
        if (cue === "chirp") sfx.chirp();
        else if (cue === "peck") sfx.peck();
        if (owlCue(before.since, mood.since, mood.seed)) sfx.hoot();
        for (const x of appleCue(before.since, mood.since, mood.seed, mood.knocks)) {
          sfx.apple(pan(x));
        }
        for (const hit of wallCue(before.since, mood.since, mood)) sfx.crumble(pan(hit.x), hit.big);
        for (const x of shedCue(before.since, mood.since, mood.seed)) sfx.twig(pan(x));
        for (const fell of fellCue(before.since, mood.since, mood.seed)) {
          sfx.timber(fell.kind, pan(fell.x));
        }
        // The tree takes a tap while it has ripe apples; the rect changes rarely.
        const tree = appleTreeAt(mood.since, mood.seed, mood.knocks);
        const key = tree ? `${tree.x},${tree.y},${tree.w},${tree.h}` : "";
        if (key !== appleKey) {
          appleKey = key;
          appleRect = tree;
        }
      }
      const signsNow = {
        exit: signAt("exit", mood),
        speaker: signAt("speaker", mood),
        screen: signAt("screen", mood),
        wc: signAt("wc", mood),
      };
      const placed = Object.values(signsNow)
        .map((r) => `${r.x},${r.y}`)
        .join("|");
      if (placed !== signKey) {
        signKey = placed;
        signRects = signsNow;
      }
      // Friday's wind, swelling and rising with the gusts.
      const wind = mood.after ? Math.abs(windAt(mood.since, mood.seed)) : 0;
      sfx.bed("wind", Math.min(0.035, wind * 0.022), 0.7 + wind * 0.8);
      // The AIs' fans, and the drone's rotors pitched by how fast it is going.
      sfx.bed("fans", 0.03);
      const speed = Math.hypot(s.drone.vx, s.drone.vy) / 320;
      // Silent at rest: a hovering drone buzzing all through friday wore thin on a phone.
      sfx.bed("drone", speed > 0.02 ? 0.004 + speed * 0.02 : 0, 1 + speed * 0.6);
      const k = el.width / SCENE_W;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      drawOffice(ctx, officeWeek.sim, officeWeek.mood, {
        muted: sfx.muted,
        fullscreen: fullscreen.supported ? fullscreen.on : null,
      });
      const focus = officeWeek.mood.after ? SCENE_W / 2 : focusOf(officeWeek.sim);
      const offset = camera.follow(fit, SCENE_W, focus, dt);
      if (frameEl && offset !== shown) {
        frameEl.style.transform = `translateX(${-offset}px)`;
        shown = offset;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      sfx.bed("fans", 0);
      sfx.bed("drone", 0);
      sfx.bed("wind", 0);
    };
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="stage" bind:this={wrap}>
  <div class="box" style:--px="{fit.sceneCss / SCENE_W}px">
    <div class="viewport" style:width="{fit.viewCss}px">
      <div class="frame" bind:this={frameEl} style:width="{fit.sceneCss}px">
        <canvas bind:this={canvas} aria-label="an office: two AI slabs and a desk between them"
        ></canvas>
        <!-- Leaving is leaving: the next visit starts a new week. -->
        {#if appleRect && officeWeek.screen === "loop"}
          <SceneSign
            at={appleRect}
            scene={SCENE}
            label="shake the apple tree"
            onclick={shake}
            wash={false}
          />
        {/if}
        <SceneSign
          at={signRects.exit}
          scene={SCENE}
          label="exit"
          home
          onclick={officeWeek.newWeek}
        />
        <SceneSign
          at={signRects.speaker}
          scene={SCENE}
          label={sfx.muted ? "sound on (m)" : "sound off (m)"}
          onclick={sfx.toggleMute}
        />
        {#if fullscreen.supported}
          <SceneSign
            at={signRects.screen}
            scene={SCENE}
            label={fullscreen.on ? "leave fullscreen (f)" : "fullscreen (f)"}
            onclick={fullscreen.toggle}
          />
        {/if}
        {#if staffed}
          <SceneSign
            at={signRects.wc}
            scene={SCENE}
            label={officeWeek.away ? "back to work (w)" : "toilet break (w)"}
            onclick={officeWeek.toggleBreak}
            invite={!officeWeek.away}
          />
        {/if}
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

  .frame {
    position: relative;
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
    /* The signs on the wall stay pressable through the dimming; only the card takes clicks. */
    pointer-events: none;
  }

  .overlay > :global(*) {
    pointer-events: auto;
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

  /* A phone on its side: the scene takes the height, the desk sits beside it. */
  @media (max-height: 519px) and (orientation: landscape) {
    .box {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
    }

    .dock {
      position: static;
      padding-top: 0;
    }

    .dock :global(.panel) {
      width: 19rem;
    }
  }
</style>
