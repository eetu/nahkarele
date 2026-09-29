<script lang="ts">
  import flask from "$lib/sprites/flask.json";
  import { drawSprite, type Sprite } from "$lib/sprites/sprite";

  const W = 160;
  const H = 60;
  const COLOURS = ["#f78f08", "#e0443a", "#6ccf5a", "#f2c230", "#e8ecf0", "#57b6ff"];

  type Spark = { x: number; y: number; vx: number; vy: number; born: number; colour: string };
  type Rocket = { x: number; y: number; vy: number; top: number; colour: string };

  let canvas: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let sparks: Spark[] = [];
    let rockets: Rocket[] = [];
    let t = 0;
    let nextLaunch = 0;
    let last = performance.now();
    let raf = 0;

    const burst = (x: number, y: number, colour: string) => {
      const n = 30;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const speed = 22 + Math.random() * 14;
        sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, born: t, colour });
      }
    };

    const paint = () => {
      ctx.fillStyle = "#0b1426";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#1a2640";
      ctx.fillRect(0, H - 12, W, 12);
      for (const r of rockets) {
        ctx.fillStyle = r.colour;
        ctx.fillRect(Math.round(r.x), Math.round(r.y), 1, 2);
      }
      for (const sp of sparks) {
        const age = t - sp.born;
        ctx.globalAlpha = Math.max(0, 1 - age / 1.3);
        ctx.fillStyle = sp.colour;
        ctx.fillRect(Math.round(sp.x), Math.round(sp.y), 1, 1);
      }
      ctx.globalAlpha = 1;
      // The skyline, then the bottle on the sill in front of it.
      ctx.fillStyle = "#262e3a";
      for (const [bx, bw, bh] of [
        [4, 14, 16],
        [24, 10, 22],
        [40, 18, 12],
        [104, 12, 20],
        [122, 20, 14],
        [146, 10, 24],
      ]) {
        ctx.fillRect(bx, H - bh, bw, bh);
      }
      ctx.save();
      ctx.translate(W / 2 - 10, H - 45);
      ctx.scale(2, 2);
      drawSprite(ctx, flask as Sprite, 0, 0);
      ctx.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (t >= nextLaunch) {
        rockets.push({
          x: 12 + Math.random() * (W - 24),
          y: H,
          vy: -70 - Math.random() * 20,
          top: 8 + Math.random() * 20,
          colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
        });
        nextLaunch = t + 0.25 + Math.random() * 0.45;
      }
      for (const r of rockets) {
        r.y += r.vy * dt;
        if (r.y <= r.top) burst(r.x, r.y, r.colour);
      }
      rockets = rockets.filter((r) => r.y > r.top);
      for (const sp of sparks) {
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vx *= 0.97;
        sp.vy = sp.vy * 0.97 + 26 * dt;
      }
      sparks = sparks.filter((sp) => t - sp.born < 1.3);
      paint();
      raf = requestAnimationFrame(frame);
    };

    if (still) {
      burst(50, 22, COLOURS[0]);
      burst(112, 16, COLOURS[2]);
      t = 0.35;
      for (const sp of sparks) {
        sp.x += sp.vx * 0.35;
        sp.y += sp.vy * 0.35;
      }
      paint();
      return;
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
</script>

<canvas bind:this={canvas} width={W} height={H} aria-hidden="true"></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    aspect-ratio: 160 / 60;
    height: auto;
    image-rendering: pixelated;
    border-radius: var(--halo-radius);
  }
</style>
