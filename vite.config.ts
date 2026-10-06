import dab from "@anarkisti/dab/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit(), dab({ sprites: "src/lib/sprites" })],
  server: { port: 5173 },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
