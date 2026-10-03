<script lang="ts">
  import { resolve } from "$app/paths";
  import { leaveKey } from "$lib/keys";

  import Tile from "./Tile.svelte";
  import { type Param, UNITS, type Values } from "./units";

  /** How many seeds the grid shows. */
  const GRID = 8;

  let index = $state(0);
  const values = $state<Record<string, Values>>(
    Object.fromEntries(UNITS.map((u) => [u.name, { ...u.defaults }])),
  );
  let zoom = $state(3);
  let grid = $state(false);
  let playing = $state(true);
  let t = $state(0);

  const unit = $derived(UNITS[index]);
  const v = $derived(values[unit.name]);
  const seeded = $derived("seed" in unit.defaults);
  const tiles = $derived(
    grid && seeded
      ? Array.from({ length: GRID }, (_, i) => ({ ...v, seed: Number(v.seed) + i }))
      : [v],
  );

  const set = (key: string, value: number | string) => (values[unit.name][key] = value);
  const reseed = () => set("seed", Math.floor(Math.random() * 100000));

  // The clock runs only for units that move.
  $effect(() => {
    if (!unit.animated || !playing) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      t += (now - last) / 1000;
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });

  const onKey = (e: KeyboardEvent) => {
    if (leaveKey(e)) return;
    const k = e.key;
    if (k === "]") index = (index + 1) % UNITS.length;
    else if (k === "[") index = (index - 1 + UNITS.length) % UNITS.length;
    else if (k === "g" && seeded) grid = !grid;
    else if (k === "r" && seeded) reseed();
    else if (k === " ") playing = !playing;
    else if (k === "+" || k === "=") zoom = Math.min(8, zoom + 1);
    else if (k === "-") zoom = Math.max(1, zoom - 1);
    else return;
    e.preventDefault();
  };

  const input = (p: Param, e: Event) => {
    const el = e.currentTarget as HTMLInputElement | HTMLSelectElement;
    set(p.key, p.kind === "range" || p.kind === "seed" ? Number(el.value) : el.value);
  };
</script>

<svelte:head><title>workbench · nahkarele</title></svelte:head>
<svelte:window onkeydown={onKey} />

<div class="bench">
  <header>
    <h1 class="label">workbench</h1>
    <p class="label keys">
      <kbd>[</kbd> <kbd>]</kbd> unit · <kbd>g</kbd> grid of seeds · <kbd>r</kbd> new seed ·
      <kbd>space</kbd> play · <kbd>-</kbd> <kbd>+</kbd> zoom · <kbd>`</kbd> back to the game
    </p>
    <a class="label" href={resolve("/")}>front page</a>
  </header>

  <nav>
    {#each UNITS as u, i (u.name)}
      <button class:active={i === index} onclick={() => (index = i)}>{u.name}</button>
    {/each}
  </nav>

  <main class:grid={tiles.length > 1}>
    {#each tiles as tv (tv.seed ?? 0)}
      <Tile {unit} values={tv} {t} {zoom} label={seeded ? `seed ${tv.seed}` : undefined} />
    {/each}
  </main>

  <aside class="halo-card">
    {#each unit.params(v) as p (p.key)}
      <label>
        <span class="label">{p.key}</span>
        {#if p.kind === "range"}
          <input
            type="range"
            min={p.min}
            max={p.max}
            step={p.step}
            value={v[p.key]}
            oninput={(e) => input(p, e)}
          />
          <span class="num value">{v[p.key]}</span>
        {:else if p.kind === "select"}
          <select value={v[p.key]} onchange={(e) => input(p, e)}>
            {#each p.options as o (o)}<option value={o}>{o}</option>{/each}
          </select>
        {:else if p.kind === "seed"}
          <input type="number" value={v[p.key]} oninput={(e) => input(p, e)} />
          <button onclick={reseed}>new</button>
        {:else}
          <input type="text" value={v[p.key]} oninput={(e) => input(p, e)} />
        {/if}
      </label>
    {/each}
    <label>
      <span class="label">zoom</span>
      <input type="range" min="1" max="8" step="1" bind:value={zoom} />
      <span class="num value">{zoom}×</span>
    </label>
    {#if seeded}
      <label class="check">
        <input type="checkbox" bind:checked={grid} />
        <span class="label">grid of {GRID} seeds</span>
      </label>
    {/if}
  </aside>
</div>

<style>
  .bench {
    display: grid;
    grid-template-columns: 9rem 1fr 18rem;
    grid-template-rows: auto 1fr;
    gap: 1rem;
    min-height: 100dvh;
    padding: 1rem;
  }

  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    gap: 1.5rem;
  }

  header h1,
  header p {
    margin: 0;
  }

  .keys {
    flex: 1;
  }

  kbd {
    font-family: var(--halo-font-heading);
    padding: 0 0.3em;
    border: 1px solid var(--halo-border);
    border-radius: 3px;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  nav button {
    justify-content: flex-start;
  }

  nav button.active {
    border-color: var(--halo-accent);
    color: var(--halo-accent);
  }

  main {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    overflow: auto;
  }

  main.grid {
    flex-wrap: wrap;
    justify-content: flex-start;
    align-content: flex-start;
    gap: 1rem;
  }

  aside {
    align-self: start;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 1rem;
  }

  label {
    display: grid;
    grid-template-columns: 5rem 1fr auto;
    align-items: center;
    gap: 0.5rem;
  }

  label.check {
    grid-template-columns: auto 1fr;
  }

  label input[type="number"],
  label input[type="text"],
  label select {
    min-width: 0;
    font: inherit;
  }

  label input[type="text"],
  label select {
    grid-column: 2 / -1;
  }

  .value {
    min-width: 2.5rem;
    text-align: right;
  }

  @media (max-width: 900px) {
    .bench {
      grid-template-columns: 1fr;
    }

    nav {
      flex-direction: row;
      flex-wrap: wrap;
    }
  }
</style>
