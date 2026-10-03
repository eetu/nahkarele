<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import Delete from "@lucide/svelte/icons/delete";
  import FileSearch from "@lucide/svelte/icons/file-search";
  import X from "@lucide/svelte/icons/x";

  import { sfx } from "$lib/audio/sfx.svelte";
  import { leaveKey } from "$lib/keys";
  import { DESK_CAPACITY } from "$lib/office/engine";
  import { LONGEST } from "$lib/office/tasks";
  import { officeWeek } from "$lib/office/week.svelte";

  import DiffDialog from "./DiffDialog.svelte";

  const task = $derived(officeWeek.current.task);
  const prompt = $derived(officeWeek.hud.prompt);
  let typed = $state("");
  let reviewing = $state(false);

  // A new message clears the keypad.
  let lastId = 0;
  $effect(() => {
    const id = officeWeek.hud.promptId;
    if (id !== lastId) {
      lastId = id;
      typed = "";
      // The message left the desk, read or not.
      reviewing = false;
    }
  });

  const submit = (value: string) => {
    const verdict = officeWeek.answer(value);
    typed = "";
    if (!verdict) return;
    if (task === "ok") sfx.ok();
    else sfx.verdict(verdict === "correct");
  };

  const key = (k: string) => {
    if (!prompt) return;
    sfx.key(k);
    if (k === "back") typed = typed.slice(0, -1);
    else if (k === "-") typed = typed.startsWith("-") ? typed.slice(1) : `-${typed}`;
    else if (typed.replace("-", "").length < 6) typed += k;
  };

  const onKey = (e: KeyboardEvent) => {
    if (officeWeek.screen !== "shift" || officeWeek.away || !prompt || reviewing) return;
    if (leaveKey(e)) return;
    const k = e.key;
    if (task === "review") {
      if (k === "a" || k === "y" || k === "Enter") submit("approve");
      else if (k === "r" || k === "n" || k === "Backspace") submit("reject");
      else return;
    } else if (task === "hard" || task === "easy") {
      if (/^\d$/.test(k)) key(k);
      else if (k === "-") key("-");
      else if (k === "Backspace") key("back");
      else if (k === "Enter" && typed) submit(typed);
      else return;
    } else if (task === "ok") {
      if (k === "Enter" || k === " ") submit("ok");
      else return;
    } else return;
    e.preventDefault();
  };

  const PAD = ["7", "8", "9", "back", "4", "5", "6", "-", "1", "2", "3", "0"];
</script>

<svelte:window onkeydown={onKey} />

<section class="panel pixel-card" aria-label="your desk">
  <div class="screen pixel-notch" class:glyphs={task === "ok"} aria-live="polite">
    <!-- The longest message the day can send, unseen: the screen keeps its rows. -->
    <span class="lines">
      <span class="room prompt" aria-hidden="true">{LONGEST[task]}</span>
      {#if officeWeek.away}
        <span class="idle">on a break. the AIs are handling it.</span>
      {:else if prompt}
        <span class="prompt">{prompt}</span>
      {:else}
        <span class="idle">…</span>
      {/if}
    </span>
    {#if !officeWeek.away && prompt}
      {#if task === "hard" || task === "easy"}
        <span class="typed num">{typed || "_"}</span>
      {/if}
    {/if}
  </div>
  <div class="pile" role="img" aria-label="{officeWeek.hud.pile} on the desk">
    {#each Array.from({ length: DESK_CAPACITY }, (_, i) => i) as i (i)}
      <span class:on={i < officeWeek.hud.pile} class:full={officeWeek.hud.pile >= DESK_CAPACITY}
      ></span>
    {/each}
  </div>

  {#if officeWeek.away}
    <!-- nothing to press -->
  {:else if task === "review"}
    <div class="row">
      <button
        onmousedown={(e) => e.preventDefault()}
        class="go"
        disabled={!prompt}
        onclick={() => submit("approve")}
      >
        <Check size={18} /> approve
      </button>
      <button
        onmousedown={(e) => e.preventDefault()}
        class="stop"
        disabled={!prompt}
        onclick={() => submit("reject")}
      >
        <X size={18} /> reject
      </button>
      <button
        disabled={!prompt}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => (reviewing = true)}
      >
        <FileSearch size={18} /> review
      </button>
    </div>
  {:else if task === "hard" || task === "easy"}
    <div class="pad">
      {#each PAD as k (k)}
        <button
          onmousedown={(e) => e.preventDefault()}
          class="key"
          disabled={!prompt}
          onclick={() => key(k)}
          aria-label={k === "back" ? "delete" : k}
        >
          {#if k === "back"}<Delete size={16} />{:else}{k === "-" ? "±" : k}{/if}
        </button>
      {/each}
      <button
        onmousedown={(e) => e.preventDefault()}
        class="enter primary"
        disabled={!prompt || !typed}
        onclick={() => submit(typed)}>enter</button
      >
    </div>
  {:else if task === "ok"}
    <button
      onmousedown={(e) => e.preventDefault()}
      class="ok primary"
      disabled={!prompt}
      onclick={() => submit("ok")}>ok</button
    >
  {/if}
</section>

{#if reviewing}
  <DiffDialog
    onClose={() => (reviewing = false)}
    onApprove={(read, total) => {
      officeWeek.reviewed(read, total);
      reviewing = false;
      submit("approve");
    }}
  />
{/if}

<style>
  .panel {
    width: min(100%, 26rem);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem;
    container-type: inline-size;
  }

  /* Over the scene on a desktop the panel is small: the words stay, the icons go. */
  @container (max-width: 22rem) {
    .row button :global(svg) {
      display: none;
    }
  }

  .screen {
    min-height: 3.2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0.8rem;
    border-radius: var(--halo-radius);
    background: #0d1a12;
    color: #9fcf6a;
    font-family: ui-monospace, Menlo, monospace;
    font-size: 0.95rem;
  }

  .lines {
    flex: 1;
    display: grid;
  }

  .lines > * {
    grid-area: 1 / 1;
  }

  .room {
    visibility: hidden;
  }

  .screen.glyphs .prompt {
    color: #b8f0ff;
    letter-spacing: 0.15em;
    font-size: 1.2rem;
  }

  .typed {
    font-size: 1.3rem;
    color: #f2c230;
  }

  .idle {
    color: #3f7a4a;
  }

  .pile {
    display: flex;
    gap: 3px;
  }

  .pile span {
    flex: 1;
    height: var(--px);
    background: var(--halo-off-bg);
  }

  .pile span.on {
    background: var(--halo-accent);
  }

  .pile span.on.full {
    background: var(--halo-error);
  }

  .row {
    display: flex;
    gap: 0.6rem;
  }

  .row button {
    flex: 1;
    justify-content: center;
    gap: 0.3rem;
    padding: 0.7rem 0.3rem;
    min-height: 44px;
  }

  .pad {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.35rem;
  }

  .pad .key {
    justify-content: center;
    padding: 0.35rem;
    min-height: 44px;
    font-size: 1.05rem;
    font-variant-numeric: tabular-nums;
  }

  .enter {
    grid-column: 1 / -1;
    justify-content: center;
  }

  .ok {
    justify-content: center;
    font-size: 2rem;
    padding: 1.2rem;
  }
</style>
