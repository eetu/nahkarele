<script lang="ts">
  import { prefersReducedMotion } from "$lib/keys";
  import { bake, type Flip, frameOf, type Sprite } from "$lib/sprites/sprite";

  type Props = {
    sprite: Sprite;
    frame?: number;
    variant?: string;
    flip?: Flip;
    /** Plays this animation instead of holding `frame`. */
    animation?: string;
    fps?: number;
    scale?: number;
    label?: string;
  };

  let {
    sprite,
    frame = 0,
    variant,
    flip,
    animation,
    fps = 4,
    scale = 3,
    label = "",
  }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    const el = canvas;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const paint = (f: number) => {
      ctx.clearRect(0, 0, sprite.w, sprite.h);
      ctx.drawImage(bake(sprite, f, variant, flip), 0, 0);
    };
    if (!animation || prefersReducedMotion()) {
      paint(frame);
      return;
    }
    let step = 0;
    paint(frameOf(sprite, animation, step));
    const timer = setInterval(() => paint(frameOf(sprite, animation, ++step)), 1000 / fps);
    return () => clearInterval(timer);
  });
</script>

<canvas
  bind:this={canvas}
  width={sprite.w}
  height={sprite.h}
  style:width="{sprite.w * scale}px"
  style:height="{sprite.h * scale}px"
  role={label ? "img" : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : "true"}
></canvas>

<style>
  canvas {
    image-rendering: pixelated;
    display: block;
  }
</style>
