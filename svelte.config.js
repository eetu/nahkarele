import adapter from "@sveltejs/adapter-static";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    runes: ({ filename }) => (filename.split(/[/\\]/).includes("node_modules") ? undefined : true),
  },
  kit: {
    // Pure SPA served by nginx: only the fallback page is emitted, and nginx
    // answers every unmatched path with it.
    adapter: adapter({
      pages: "dist",
      assets: "dist",
      fallback: "index.html",
      precompress: false,
      strict: true,
    }),
    // A shift holds no state worth keeping across a deploy, so the root layout
    // reloads as soon as SvelteKit sees a new build.
    version: {
      pollInterval: 60_000,
    },
  },
};

export default config;
