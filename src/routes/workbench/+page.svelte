<script lang="ts">
  import { resolve } from "$app/paths";

  import Tile from "./Tile.svelte";
  import { type Param, type Unit, UNITS, type Values } from "./units";

  /** How many seeds the grid shows. */
  const GRID = 8;

  /** What the bench was last showing, and how: kept through reloads, the hot ones too. */
  const PREFS = "nahkarele:workbench";
  type Prefs = { unit?: string; zoom?: number; grid?: boolean; values?: Record<string, Values> };
  const saved = ((): Prefs => {
    try {
      return (JSON.parse(localStorage.getItem(PREFS) ?? "{}") as Prefs) ?? {};
    } catch {
      return {};
    }
  })();
  /** A unit's saved values over its defaults: only those it still has, of the same type. */
  const valuesOf = (u: Unit): Values => {
    const kept = saved.values?.[u.name] ?? {};
    const out = { ...u.defaults };
    for (const [key, value] of Object.entries(kept)) {
      if (key in out && typeof value === typeof out[key]) out[key] = value;
    }
    return out;
  };

  let index = $state(
    Math.max(
      0,
      UNITS.findIndex((u) => u.name === saved.unit),
    ),
  );
  const values = $state<Record<string, Values>>(
    Object.fromEntries(UNITS.map((u) => [u.name, valuesOf(u)])),
  );
  let zoom = $state(saved.zoom ?? 3);
  let grid = $state(saved.grid ?? false);
  let playing = $state(true);
  let t = $state(0);

  const unit = $derived(UNITS[index]);
  const v = $derived(values[unit.name]);
  const seeded = $derived("seed" in unit.defaults);
  const params = $derived(unit.params(v));
  /** The params folded under each heading, in the order the headings first come. */
  const groups = $derived(
    [...new Set(params.flatMap((p) => (p.group ? [p.group] : [])))].map((name) => ({
      name,
      params: params.filter((p) => p.group === name),
    })),
  );

  $effect(() => {
    const prefs = JSON.stringify({ unit: unit.name, zoom, grid, values });
    try {
      localStorage.setItem(PREFS, prefs);
    } catch {
      /* the bench then forgets */
    }
  });
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

  /**
   * Whether the bench keeps out of a key press: what is being typed, and Space or Enter on a
   * control that takes them itself. A slider takes neither, so every key still works after one
   * has been moved.
   */
  const keepOut = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return true;
    const el = e.target instanceof Element ? e.target : null;
    if (el?.closest("textarea, input[type=text], input[type=number]")) return true;
    const own = "button, a, summary, select, input[type=checkbox]";
    return (e.key === " " || e.key === "Enter") && !!el?.closest(own);
  };

  const onKey = (e: KeyboardEvent) => {
    if (keepOut(e)) return;
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
    if (p.kind === "toggle") set(p.key, (el as HTMLInputElement).checked ? 1 : 0);
    else set(p.key, p.kind === "range" || p.kind === "seed" ? Number(el.value) : el.value);
  };

  const shown = (p: Param & { kind: "range" }) =>
    p.show ? p.show(Number(v[p.key])) : String(v[p.key]);
</script>

{#snippet row(p: Param)}
  {@const hint = p.hint ? `hint-${p.key}` : undefined}
  <div class="param">
    <label>
      <span class="label">{p.key}</span>
      {#if p.kind === "range"}
        <input
          type="range"
          min={p.min}
          max={p.max}
          step={p.step}
          value={v[p.key]}
          aria-describedby={hint}
          oninput={(e) => input(p, e)}
        />
        <span class="num value">{shown(p)}</span>
      {:else if p.kind === "select"}
        <select value={v[p.key]} aria-describedby={hint} onchange={(e) => input(p, e)}>
          {#each p.options as o (o)}<option value={o}>{o}</option>{/each}
        </select>
      {:else if p.kind === "toggle"}
        <input
          type="checkbox"
          checked={Boolean(v[p.key])}
          aria-describedby={hint}
          onchange={(e) => input(p, e)}
        />
      {:else if p.kind === "seed"}
        <input type="number" value={v[p.key]} oninput={(e) => input(p, e)} />
        <button onclick={reseed} title="a random seed (r)">new</button>
      {:else}
        <input type="text" value={v[p.key]} aria-describedby={hint} oninput={(e) => input(p, e)} />
      {/if}
    </label>
    {#if p.hint}<small class="hint" id={hint}>{p.hint}</small>{/if}
  </div>
{/snippet}

<svelte:head>
  <title>workbench · nahkarele</title>
  <meta name="robots" content="noindex" />
</svelte:head>
<svelte:window onkeydown={onKey} />

<div class="bench">
  <header>
    <h1 class="label">workbench</h1>
    <p class="label keys">
      <kbd>[</kbd> <kbd>]</kbd> unit · <kbd>g</kbd> grid of seeds · <kbd>r</kbd> new seed ·
      <kbd>space</kbd> play · <kbd>-</kbd> <kbd>+</kbd> zoom{#if import.meta.env.DEV}
        · <kbd>`</kbd> back to the game{/if}
    </p>
    <a class="label" href={resolve("/")}>front page</a>
  </header>

  <nav>
    {#each UNITS as u, i (u.name)}
      <!-- A click leaves the focus where it was, so Space goes on playing and pausing. -->
      <button
        class:active={i === index}
        title={u.about}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => (index = i)}
      >
        {u.name}
      </button>
    {/each}
  </nav>

  <main class:grid={tiles.length > 1}>
    {#each tiles as tv (tv.seed ?? 0)}
      <Tile {unit} values={tv} {t} {zoom} label={seeded ? `seed ${tv.seed}` : undefined} />
    {/each}
  </main>

  <aside class="halo-card">
    <hgroup>
      <h2>
        {unit.name}
        {#if unit.animated && !playing}<span class="label paused">paused · space</span>{/if}
      </h2>
      <p class="about">{unit.about}</p>
    </hgroup>
    {#each params.filter((p) => !p.group) as p (p.key)}
      {@render row(p)}
    {/each}
    {#each groups as g (g.name)}
      <details>
        <summary class="label">{g.name} · {g.params.length}</summary>
        {#each g.params as p (p.key)}
          {@render row(p)}
        {/each}
      </details>
    {/each}
    <label title="- and + on the keyboard">
      <span class="label">zoom</span>
      <input type="range" min="1" max="8" step="1" bind:value={zoom} />
      <span class="num value">{zoom}×</span>
    </label>
    {#if seeded}
      <label class="check" title="g on the keyboard">
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
    overflow: auto;
  }

  /* Centred while it fits; wider, it starts at the left edge and scrolls, rather than being
     cut off on both sides as a centred overflow is. */
  main:not(.grid) > :global(figure) {
    margin-inline: auto;
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

  hgroup h2 {
    margin: 0;
    font-size: 1rem;
  }

  .about {
    margin: 0.2rem 0 0;
    color: var(--halo-text-muted);
    font-size: 0.85rem;
  }

  .paused {
    margin-left: 0.4rem;
    color: var(--halo-accent);
  }

  .param {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .hint {
    padding-left: 5.5rem;
    color: var(--halo-text-muted);
    font-size: 0.75rem;
    line-height: 1.3;
  }

  details[open] summary {
    margin-bottom: 0.7rem;
  }

  summary {
    cursor: pointer;
  }

  details .param + .param {
    margin-top: 0.7rem;
  }

  label {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
  }

  label input[type="range"] {
    min-width: 0;
  }

  label input[type="checkbox"] {
    justify-self: start;
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
    min-width: 3.5rem;
    text-align: right;
    white-space: nowrap;
  }

  /* No keyboard, no use for its keys. */
  @media (hover: none) {
    .keys {
      display: none;
    }

    header a {
      margin-left: auto;
    }
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
