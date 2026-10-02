<script lang="ts">
  import ArrowRight from "@lucide/svelte/icons/arrow-right";

  import { resolve } from "$app/paths";
  import { lookOf, SPRITES } from "$lib/factory/look";
  import specialist from "$lib/sprites/specialist.json";
  import type { Sprite } from "$lib/sprites/sprite";

  import Cassette from "./Cassette.svelte";
  import Glyph from "./Glyph.svelte";
  import SpriteIcon from "./SpriteIcon.svelte";
</script>

<main class="intro">
  <section class="hero">
    <Glyph class="hero-glyph" jam />
    <div>
      <h1>nahkarele<span class="accent">.</span></h1>
      <p class="def">
        <span class="label">fi. noun</span> a person placed inside an automated process to pass along
        what the machine already knows. at best a pass-through, at worst the slowest part.
      </p>
      <p class="def">
        <span class="label">since 1978</span> on the factory floor. <span class="label">2026</span> between
        two ai agents, as the meat proxy.
      </p>
    </div>
  </section>

  <div class="grid">
    <div class="modes">
      <a class="mode halo-card primary-mode" href={resolve("/tehdas")}>
        <div class="art" aria-hidden="true">
          <SpriteIcon sprite={SPRITES.worker} animation="idle" scale={2} />
          <SpriteIcon {...lookOf({ model: "boot", defect: null })} scale={3} />
          <SpriteIcon {...lookOf({ model: "boot", defect: "hole" })} scale={3} />
        </div>
        <span class="label">1978 · legacy</span>
        <span class="title">kumitehdas</span>
        <span class="brief"> rubber boots inspector. </span>
        <span class="go">clock in <ArrowRight size={16} /></span>
      </a>
      <a class="mode halo-card" href={resolve("/specialist")}>
        <div class="art" aria-hidden="true">
          <span class="slab">AI #1</span>
          <span class="seat">
            <SpriteIcon sprite={specialist as Sprite} animation="idle" scale={2} />
            <span class="desk"></span>
          </span>
          <span class="slab">AI #2</span>
        </div>
        <span class="label">2026 · current</span>
        <span class="title">software specialist</span>
        <span class="brief">two AIs. one desk.</span>
        <span class="go">start shift <ArrowRight size={16} /></span>
      </a>
    </div>
    <section class="halo-card orientation">
      <h2 class="label">orientation</h2>
      <Cassette />
    </section>
  </div>
</main>

<style>
  .intro {
    max-width: 62rem;
    margin: 0 auto;
    padding: calc(1rem + env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
      calc(2rem + env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .hero {
    display: flex;
    gap: 2rem;
    align-items: center;
    padding-block: 1rem;
  }

  .hero :global(.hero-glyph) {
    flex: none;
    width: 6rem;
    height: 6rem;
    color: var(--halo-text-main);
  }

  h1 {
    margin: 0 0 0.5rem;
    font-size: 2.6rem;
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1.1;
  }

  .accent {
    color: var(--halo-accent);
  }

  .def {
    margin: 0.25rem 0;
    max-width: 38rem;
  }

  .def .label {
    margin-right: 0.4rem;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
    /* Orientation as tall as the two mode cards together. */
    align-items: stretch;
  }

  .orientation {
    display: flex;
    flex-direction: column;
  }

  .orientation :global(.deck) {
    flex: 1;
  }

  h2 {
    margin: 0 0 1rem;
    font-weight: 500;
  }

  .modes {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .mode {
    flex: 1;
    display: grid;
    align-content: start;
    gap: 0.3rem;
    color: inherit;
    text-decoration: none;
    border: 1px solid transparent;
    transition: border-color var(--halo-d-fast);
  }

  .mode:hover,
  .mode:focus-visible {
    border-color: var(--halo-accent);
    outline: none;
  }

  .primary-mode {
    background: var(--halo-accent-soft);
  }

  .art {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    min-height: 72px;
    margin-bottom: 0.4rem;
  }

  /* The sprite stops at the waist: in the office the desk hides that, so here too. */
  .seat {
    position: relative;
    padding-bottom: 8px;
  }

  .desk {
    position: absolute;
    left: -0.75rem;
    right: -0.75rem;
    bottom: 0;
    height: 18px;
    border-top: 2px solid #4f3a28;
    background: linear-gradient(#8a6a4a 0 4px, #6f5238 4px);
  }

  .slab {
    display: grid;
    place-items: end center;
    width: 30px;
    height: 72px;
    padding-bottom: 4px;
    border-radius: 2px;
    background: #0a0a0d;
    color: #d8dde2;
    font-family: var(--halo-font-heading);
    font-size: 0.55rem;
  }

  .title {
    font-size: 1.4rem;
    font-weight: 600;
    letter-spacing: -0.03em;
  }

  .brief {
    font-size: 0.95rem;
  }

  .go {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.4rem;
    font-family: var(--halo-font-heading);
    color: var(--halo-accent);
  }

  @media (max-width: 760px) {
    .grid {
      grid-template-columns: 1fr;
    }

    .hero {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }

    .hero :global(.hero-glyph) {
      width: 5rem;
      height: 5rem;
    }
  }
</style>
