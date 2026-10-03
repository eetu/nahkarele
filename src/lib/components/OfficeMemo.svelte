<script lang="ts">
  import Clock from "@lucide/svelte/icons/clock";

  import { leaveKey } from "$lib/keys";
  import { OFFICE_DAYS } from "$lib/office/days";
  import { officeWeek } from "$lib/office/week.svelte";

  const day = $derived(officeWeek.current);

  const onKey = (e: KeyboardEvent) => {
    if (leaveKey(e) || e.key !== "Enter") return;
    e.preventDefault();
    officeWeek.clockIn();
  };
</script>

<svelte:window onkeydown={onKey} />

<section class="card pixel-card" aria-label="memo">
  <div class="label">memo · day {officeWeek.day + 1} of {OFFICE_DAYS.length} · {day.name}</div>
  <p>{day.memo}</p>
  <div class="row">
    <button class="primary" onclick={officeWeek.clockIn}>
      <Clock size={18} />
      {day.task === "jar" ? "continue" : "clock in"}
    </button>
  </div>
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    max-width: 28rem;
  }

  p {
    margin: 0;
    font-size: 1.05rem;
  }

  .row {
    display: flex;
    justify-content: flex-end;
  }
</style>
