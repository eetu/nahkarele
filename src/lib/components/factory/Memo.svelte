<script lang="ts">
  import Clock from "@lucide/svelte/icons/clock";

  import { DAYS, type Defect } from "$lib/factory/days";
  import { DEFECT_LABEL, exampleOf, lookOf } from "$lib/factory/look";
  import { week } from "$lib/factory/week.svelte";
  import { leaveKey } from "$lib/keys";

  import SpriteIcon from "../SpriteIcon.svelte";

  const day = $derived(week.current);
  const stamps = $derived<Defect[]>([...day.defects, ...(day.foreign ? ["foreign" as const] : [])]);
  const models = $derived(
    day.products.map((p) => p.model).filter((m) => !day.foreign?.includes(m)),
  );
  const fine = $derived([
    ...models.map((m) => ({ key: m, label: "fine", look: lookOf(exampleOf(null, m)) })),
    ...(day.flips
      ? [{ key: "flip", label: "fine", look: lookOf(exampleOf(null, models[0]), true) }]
      : []),
  ]);

  const onKey = (e: KeyboardEvent) => {
    if (leaveKey(e)) return;
    if (e.key === "Enter") {
      e.preventDefault();
      week.clockIn();
    }
  };
</script>

<svelte:window onkeydown={onKey} />

<section class="card pixel-card" aria-label="memo">
  <div class="label">memo · day {week.day + 1} of {DAYS.length} · {day.name}</div>
  <p class="memo">{day.memo}</p>

  <div class="examples">
    <div>
      <div class="label">stamp</div>
      <ul>
        {#each stamps as d (d)}
          <li>
            <SpriteIcon {...lookOf(exampleOf(d))} scale={3} />
            <span class="label">{DEFECT_LABEL[d]}</span>
          </li>
        {/each}
      </ul>
    </div>
    <div>
      <div class="label">let pass</div>
      <ul>
        {#each fine as f (f.key)}
          <li>
            <SpriteIcon {...f.look} scale={3} />
            <span class="label">{f.label}</span>
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <div class="row">
    <button class="primary" onclick={week.clockIn}><Clock size={18} /> clock in</button>
  </div>
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    max-width: 30rem;
  }

  .memo {
    margin: 0;
    font-size: 1.05rem;
  }

  .examples {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 2rem;
  }

  ul {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
</style>
