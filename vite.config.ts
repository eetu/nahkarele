import dab from "@anarkisti/dab/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit(), dab({ sprites: "src/lib/sprites" })],
  // korpi and dab are linked from ../korpi and ../dab until they are published: Vite may
  // serve their files.
  server: { port: 5173, fs: { allow: [".", "../korpi", "../dab"] } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
