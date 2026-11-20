import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // The app's .tsx tests: without it esbuild would use the classic runtime and
  // throw `React is not defined`.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // Files in one worker share loaded modules, so each module is imported
    // once per worker instead of once per file. Measured on CI: about 14 s down
    // to about 5 s with the same 873 tests passing (run 44814978752). A test
    // that needs fresh module state must reset it itself.
    isolate: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // @vvedantb/ui ships compiled .js that imports its own CSS (sonner, katex).
    // Inlined, Vite handles that CSS and `dedupe` below applies; external, Node
    // would load it and fail on `.css`.
    server: { deps: { inline: ["@vvedantb/ui"] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // pnpm installs one @vvedantb/ui copy per peer set, so @eva/ui and the app
    // got different copies, each with its own UiConfig context, and
    // EvaUiProvider configured nothing the tests rendered. The app bundle
    // already resolves to one copy.
    dedupe: ["@vvedantb/ui", "react", "react-dom"],
  },
});
