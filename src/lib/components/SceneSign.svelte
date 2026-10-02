<script lang="ts">
  import { resolve } from "$app/paths";

  type Rect = { x: number; y: number; w: number; h: number };

  type Props = {
    /** Where the sign is drawn, in scene pixels. */
    at: Rect;
    scene: { w: number; h: number };
    label: string;
    /** A link to the front page (with `onclick` run before leaving), or a button. */
    home?: boolean;
    onclick?: () => void;
    /** Pulse a few times when it appears: this one is meant to be pressed. */
    invite?: boolean;
  };

  let { at, scene, label, home = false, onclick, invite = false }: Props = $props();

  const left = $derived(`${(at.x / scene.w) * 100}%`);
  const top = $derived(`${(at.y / scene.h) * 100}%`);
  const width = $derived(`${(at.w / scene.w) * 100}%`);
  const height = $derived(`${(at.h / scene.h) * 100}%`);
</script>

{#if home}
  <a
    class="sign"
    href={resolve("/")}
    {onclick}
    aria-label={label}
    title={label}
    style:left
    style:top
    style:width
    style:height
  ></a>
{:else}
  <button
    class="sign"
    class:invite
    onmousedown={(e) => e.preventDefault()}
    {onclick}
    aria-label={label}
    title={label}
    style:left
    style:top
    style:width
    style:height
  ></button>
{/if}

<style>
  .sign {
    position: absolute;
    display: block;
    padding: 0;
    border: none;
    border-radius: 1px;
    background: none;
    cursor: pointer;
    transition: background var(--halo-d-fast);
    /* A long press on a sign is a mis-tap, not a request for a link preview. */
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-user-select: none;
    user-select: none;
  }

  /* A wash of light over the sign; nothing is drawn around it. A plain background, not a
     backdrop filter: Chromium does not repaint a filtered backdrop when the canvas under it
     changes, so a toggled sign kept its old frame until the pointer left. A touch screen has
     no hover, and a tapped sign would otherwise stay lit. */
  @media (hover: hover) {
    .sign:hover {
      background: rgb(255 255 255 / 18%);
    }
  }

  .sign:focus-visible {
    background: rgb(255 255 255 / 18%);
    outline: 1px solid var(--halo-accent);
    outline-offset: 1px;
  }

  .invite {
    animation: invite 1.4s ease-in-out 0.6s 3;
  }

  @keyframes invite {
    50% {
      background: rgb(255 255 255 / 28%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .invite {
      animation: none;
    }
  }
</style>
