import svelte from "@anarkisti/eslint-config/svelte";

import svelteConfig from "./svelte.config.js";

export default [{ ignores: [".svelte-kit/", "dist/"] }, ...svelte(svelteConfig)];
