import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // @vvedantb/ui ships .tsx source; without a tsconfig of its own it would
  // compile with the classic runtime and throw `React is not defined`.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Same as vite.config.ts: pnpm installs one @vvedantb/ui per peer set, so
    // @eva/ui's provider and the app would read two UiConfig contexts.
    dedupe: ["@vvedantb/ui"],
  },
});
