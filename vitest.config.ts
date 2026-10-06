import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

// The tests' own config, without the dab plugin: a test run would open its MCP port.
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
