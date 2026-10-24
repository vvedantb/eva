import { defineConfig } from "vitest/config";

export default defineConfig({
  // @vvedantb/ui ships .tsx source; without a tsconfig of its own it would
  // compile with the classic runtime and throw `React is not defined`.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
