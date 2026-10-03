<script lang="ts">
  type Props = { class?: string; jam?: boolean };

  let { class: klass = "", jam = false }: Props = $props();
</script>

<!-- A gear with a person wedged between two teeth: the accent dot is the relay. -->
<svg class={klass} class:jam width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
  <g class="rotor">
    <path
      d="M51.9 27.06 L58.73 28.2 L58.73 35.8 L51.9 36.94 L49.56 42.57 L53.59 48.21 L48.21 53.59 L42.57 49.56 L36.94 51.9 L35.8 58.73 L28.2 58.73 L27.06 51.9 L21.43 49.56 L15.79 53.59 L10.41 48.21 L14.44 42.57 L12.1 36.94 L5.27 35.8 L5.27 28.2 L12.1 27.06 L14.44 21.43 L10.41 15.79 L15.79 10.41 L21.43 14.44 L27.06 12.1 L28.2 5.27 L35.8 5.27 L36.94 12.1 L42.57 14.44 L48.21 10.41 L53.59 15.79 L49.56 21.43 Z"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linejoin="round"
    />
    <circle cx="32" cy="32" r="7" fill="none" stroke="currentColor" stroke-width="2.5" />
  </g>
  <circle cx="40.99" cy="10.29" r="3.2" fill="#f78f08" />
</svg>

<style>
  .rotor {
    transform-origin: 32px 32px;
  }

  /* The gear tries to turn, hits the relay, shudders, gives up. */
  @media (prefers-reduced-motion: no-preference) {
    .jam .rotor {
      animation: jam 3.2s ease-in-out infinite;
    }
  }

  @keyframes jam {
    0%,
    30% {
      transform: rotate(0deg);
    }
    46% {
      transform: rotate(-9deg);
    }
    49% {
      transform: rotate(-7deg);
    }
    52% {
      transform: rotate(-9deg);
    }
    55% {
      transform: rotate(-7.5deg);
    }
    58% {
      transform: rotate(-9deg);
    }
    80%,
    100% {
      transform: rotate(0deg);
    }
  }
</style>
