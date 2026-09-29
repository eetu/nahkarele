<script lang="ts">
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

  import { eur, signed } from "$lib/format";
  import { accuracy } from "$lib/office/engine";
  import { officeWeek, remark } from "$lib/office/week.svelte";

  const r = $derived(officeWeek.results.find((x) => x.day === officeWeek.day));
</script>

{#if r}
  {@const t = r.tally}
  <section class="card halo-card" aria-label="payslip">
    <div class="label">payslip · {officeWeek.current.name}</div>
    <p>{remark(r)}</p>

    <dl>
      <div>
        <dt class="label">salary</dt>
        <dd class="num">{eur(r.salary)}</dd>
      </div>
      <div>
        <dt class="label">accuracy bonus</dt>
        <dd class="num" class:neg={r.bonus < 0}>{signed(r.bonus)} eur</dd>
      </div>
      <div>
        <dt class="label">total</dt>
        <dd class="num total">{eur(r.salary + r.bonus)}</dd>
      </div>
      <div>
        <dt class="label">accuracy</dt>
        <dd class="num">{Math.round(accuracy(t) * 100)} %</dd>
      </div>
      <div>
        <dt class="label">unanswered</dt>
        <dd class="num">{t.dropped}</dd>
      </div>
      <div>
        <dt class="label">messages delivered</dt>
        <dd class="num">{t.delivered} / {officeWeek.current.messages}</dd>
      </div>
      {#if t.automated}
        <div>
          <dt class="label">handled while you were away</dt>
          <dd class="num">{t.automated}</dd>
        </div>
      {/if}
      {#if r.diff.total}
        <div>
          <dt class="label">diff lines approved / read</dt>
          <dd class="num">
            {r.diff.total.toLocaleString("en-US")} / {r.diff.read.toLocaleString("en-US")}
          </dd>
        </div>
      {/if}
    </dl>

    <div class="row">
      <button onclick={officeWeek.retry}><RotateCcw size={18} /> retry day</button>
      <button class="primary" onclick={officeWeek.next}>next day <ArrowRight size={18} /></button>
    </div>
  </section>
{/if}

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    max-width: 32rem;
    padding: 1rem 1.25rem;
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

  .total {
    color: var(--halo-accent);
  }

  .neg {
    color: var(--halo-error);
  }

  .row {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
</style>
