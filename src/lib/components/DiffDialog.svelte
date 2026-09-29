<script lang="ts">
  import X from "@lucide/svelte/icons/x";

  import { fakeDiff } from "$lib/office/diff";

  type Props = { onApprove: (read: number, total: number) => void; onClose: () => void };

  let { onApprove, onClose }: Props = $props();

  // Drawn once per opening: a fresh pile of reading every time.
  const diff = fakeDiff();
  const total = diff.lines.length;
  let read = $state(24);
  let dialog: HTMLDialogElement | undefined = $state();

  // A native modal: focus moves in, Tab stays inside, Escape closes, and focus returns
  // to where it was when it closes.
  $effect(() => {
    dialog?.showModal();
    return () => dialog?.close();
  });

  const onScroll = (e: Event) => {
    const el = e.currentTarget as HTMLElement;
    read = Math.max(read, Math.round(((el.scrollTop + el.clientHeight) / el.scrollHeight) * total));
  };

  // A click on the backdrop lands on the dialog element itself.
  const onClick = (e: MouseEvent) => {
    if (e.target === dialog) onClose();
  };
</script>

<dialog
  bind:this={dialog}
  class="halo-dialog halo-card"
  aria-label="review"
  onclose={onClose}
  onclick={onClick}
>
  <header>
    <span>
      <strong>diff</strong>
      <span class="label num">{diff.files} files · {total.toLocaleString("en-US")} lines</span>
    </span>
    <button class="key" aria-label="close" onclick={onClose}><X size={18} /></button>
  </header>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div data-body onscroll={onScroll} tabindex="0" aria-label="the diff">
    <pre>{#each diff.lines as l (l.id)}<span
          class={l.mark === "+" ? "add" : l.mark === "-" ? "del" : ""}
          >{l.mark} {l.text}
</span>{/each}</pre>
  </div>
  <footer>
    <span class="label num"
      >read {read.toLocaleString("en-US")} of {total.toLocaleString("en-US")}</span
    >
    <button class="primary" onclick={() => onApprove(read, total)}>👍 looks good there mate</button>
  </footer>
</dialog>

<style>
  dialog.halo-dialog {
    --halo-dialog-width: 46rem;
    height: calc(100dvh - 4rem);
    margin: 0;
    border: none;
    color: var(--halo-text-main);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 35%);
  }

  pre {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.45;
    white-space: pre;
    overflow-x: auto;
  }

  .add {
    color: var(--halo-connected);
  }

  .del {
    color: var(--halo-error);
  }
</style>
