<script lang="ts">
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

  import { DAYS } from "$lib/factory/days";
  import { SPRITES } from "$lib/factory/look";
  import { GRADE_WORD, remark } from "$lib/factory/review";
  import { week } from "$lib/factory/week.svelte";

  import SpriteIcon from "../SpriteIcon.svelte";

  const result = $derived(week.results.find((r) => r.day === week.day));
  const last = $derived(week.day + 1 >= DAYS.length);
</script>

{#if result}
  {@const t = result.tally}
  <section class="card pixel-card" aria-label="performance review">
    <div class="head">
      <SpriteIcon sprite={SPRITES.foreman} animation="write" scale={3} label="the foreman" />
      <div>
        <div class="label">performance review · {week.current.name}</div>
        <div class="grade">
          <span class="num">{result.grade}</span>
          <span class="word">{GRADE_WORD[result.grade]}</span>
        </div>
      </div>
    </div>
    <p>{remark(result.grade)}</p>
    {#if result.inToilet}
      <p>the whistle went while you were on the toilet. reading the paper, we assume.</p>
    {/if}

    <dl>
      <div>
        <dt class="label">defects stamped</dt>
        <dd class="num">{t.hits} / {t.hits + t.misses}</dd>
      </div>
      <div>
        <dt class="label">good boots stamped</dt>
        <dd class="num">{t.falseStamps}</dd>
      </div>
      <div>
        <dt class="label">dropped on the floor</dt>
        <dd class="num">{t.dropped}</dd>
      </div>
      {#if t.automated}
        <div>
          <dt class="label">handled while you were away</dt>
          <dd class="num">{t.automated}</dd>
        </div>
      {/if}
      <div>
        <dt class="label">corrected by <span class="brand">TÄ'h</span></dt>
        <dd class="num">{t.corrections}</dd>
      </div>
      <div>
        <dt class="label">boots shipped</dt>
        <dd class="num">{t.shipped}</dd>
      </div>
      <div>
        <dt class="label">shipped without you</dt>
        <dd class="num">{t.shipped}</dd>
      </div>
    </dl>

    <div class="row">
      <button onclick={week.retry}><RotateCcw size={18} /> retry day</button>
      <button class="primary" onclick={week.next}>
        {last ? "end of week" : "next day"}
        <ArrowRight size={18} />
      </button>
    </div>
  </section>
{/if}

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 32rem;
    padding: 1rem 1.25rem;
  }

  .head {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .grade {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .grade .num {
    font-size: 2.4rem;
    font-weight: 600;
    line-height: 1;
    color: var(--halo-accent);
  }

  .word {
    font-family: var(--halo-font-heading);
  }

  p {
    margin: 0;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem 1rem;
    margin: 0;
  }

  dd {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
  }

  .row {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
</style>
