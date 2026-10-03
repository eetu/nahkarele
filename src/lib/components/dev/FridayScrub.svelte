<script lang="ts">
  import { officeWeek } from "$lib/office/week.svelte";
  import { SEASON_S, seasonAt, SEASONS_FROM } from "$lib/office/wood/seasons";
  import { windAt } from "$lib/office/wood/wind";

  const SEASONS = ["summer", "autumn", "winter", "spring"];
  /** The fastest friday runs, either way, with the thumb pulled all the way. */
  const FASTEST = 200;
  /** Around the middle, a pull this small is still normal speed. */
  const SLACK = 0.08;

  // Friday's clock is not reactive state: read it a few times a second.
  let since = $state(0);
  $effect(() => {
    const id = setInterval(() => (since = officeWeek.mood.since), 150);
    return () => clearInterval(id);
  });

  const clock = $derived(
    `${Math.floor(since / 60)}:${String(Math.floor(since % 60)).padStart(2, "0")}`,
  );
  const where = $derived.by(() => {
    const w = windAt(since, officeWeek.mood.seed);
    const wind = `wind ${Math.abs(w).toFixed(2)} ${w < 0 ? "←" : "→"}`;
    if (since < SEASONS_FROM) return `the wood grows · ${wind}`;
    const { k, p } = seasonAt(since);
    const year = Math.floor((since - SEASONS_FROM) / (4 * SEASON_S)) + 1;
    return `year ${year} · ${SEASONS[k]} ${Math.round(p * 100)}% · ${wind}`;
  });

  /**
   * A shuttle: the thumb rests in the middle at normal speed; pulled right, friday runs ever
   * faster, pulled left, backwards, both up to `FASTEST` times; let go, it springs back to the
   * middle and friday to normal speed. `pull` is how far, -1..1.
   */
  let pull = $state(0);
  let held = $state(false);
  let track: HTMLDivElement | undefined = $state();

  const rateOf = (d: number) => {
    const u = (Math.abs(d) - SLACK) / (1 - SLACK);
    if (u <= 0) return 1;
    const r = FASTEST ** u;
    return d > 0 ? r : -r;
  };
  const rate = $derived(rateOf(pull));
  const speed = $derived(
    `${rate < 0 ? "◀◀" : rate > 1 ? "▶▶" : "▶"} ${Math.abs(rate).toFixed(Math.abs(rate) < 10 ? 1 : 0)}×`,
  );

  const pullTo = (d: number) => {
    pull = Math.max(-1, Math.min(1, d));
    officeWeek.setRate(rateOf(pull));
  };
  const letGo = () => {
    held = false;
    pullTo(0);
  };
  const fromPointer = (e: PointerEvent) => {
    if (!track) return;
    const box = track.getBoundingClientRect();
    pullTo((e.clientX - (box.left + box.width / 2)) / (box.width / 2));
  };

  const onDown = (e: PointerEvent) => {
    held = true;
    track?.setPointerCapture(e.pointerId);
    fromPointer(e);
  };
  const onMove = (e: PointerEvent) => {
    if (held) fromPointer(e);
  };
  // Held arrow keys shuttle too, harder the longer they are held.
  const onKey = (e: KeyboardEvent) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    held = true;
    pullTo(Math.sign(pull) === dir ? pull + dir * 0.1 : dir * 0.4);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") letGo();
  };

  // Leaving the page or the loop never leaves friday racing.
  $effect(() => () => officeWeek.setRate(1));
</script>

<div class="scrub halo-card" aria-label="friday time, dev only">
  <span class="label">dev · friday</span>
  <div
    class="shuttle"
    class:held
    bind:this={track}
    role="slider"
    tabindex="0"
    aria-label="friday speed: pull right to run ahead, left to run back"
    aria-valuemin={-FASTEST}
    aria-valuemax={FASTEST}
    aria-valuenow={Math.round(rate)}
    aria-valuetext={speed}
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={letGo}
    onpointercancel={letGo}
    onkeydown={onKey}
    onkeyup={onKeyUp}
    onblur={letGo}
  >
    <span class="end back" aria-hidden="true">◀◀</span>
    <span class="end ahead" aria-hidden="true">▶▶</span>
    <span class="middle" aria-hidden="true"></span>
    <span
      class="run"
      aria-hidden="true"
      style:left="{50 + Math.min(0, pull) * 50}%"
      style:width="{Math.abs(pull) * 50}%"
    ></span>
    <span class="thumb" aria-hidden="true" style:left="{50 + pull * 50}%"></span>
  </div>
  <span class="num speed">{speed}</span>
  <span class="num time">{clock}</span>
  <span class="label where">{where}</span>
</div>

<style>
  .scrub {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-top: 0.5rem;
    padding: 0.6rem 0.9rem;
  }

  .shuttle {
    position: relative;
    flex: 1 1 14rem;
    height: 1.6rem;
    border-radius: 999px;
    background: var(--halo-bg-light);
    border: 1px solid var(--halo-off-bg);
    cursor: ew-resize;
    touch-action: none;
    user-select: none;
  }

  .shuttle:focus-visible {
    outline: 2px solid var(--halo-accent);
    outline-offset: 2px;
  }

  .end {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.65rem;
    color: var(--halo-text-secondary, #8a8a8a);
  }

  .back {
    left: 0.6rem;
  }

  .ahead {
    right: 0.6rem;
  }

  .middle {
    position: absolute;
    left: 50%;
    top: 0.3rem;
    bottom: 0.3rem;
    width: 1px;
    background: var(--halo-off-bg);
  }

  .run {
    position: absolute;
    top: 0.55rem;
    bottom: 0.55rem;
    background: var(--halo-accent);
    opacity: 0.45;
    border-radius: 999px;
  }

  .thumb {
    position: absolute;
    top: 0.15rem;
    bottom: 0.15rem;
    width: 0.9rem;
    margin-left: -0.45rem;
    border-radius: 999px;
    background: var(--halo-accent);
  }

  /* Let go, the thumb springs back past the middle and settles. */
  .shuttle:not(.held) .thumb,
  .shuttle:not(.held) .run {
    transition:
      left 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
      width 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .speed {
    min-width: 4.5rem;
  }

  .time {
    min-width: 3.5rem;
    text-align: right;
  }

  .where {
    min-width: 11rem;
  }
</style>
