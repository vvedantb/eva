import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tanstackRouter from "@tanstack/router-plugin/vite";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import { tablerDeepImports } from "./vite/deepImports";
import { tablerIconData } from "./vite/tablerIconData";
import { originHints } from "./vite/originHints";
import { convexDevProxy } from "./vite/convexDevProxy";
import { redline } from "@vvedantb/redline/vite";

function agentLoginPlugin(): Plugin {
  let env: Record<string, string>;

  return {
    name: "agent-login",
    configureServer(server) {
      env = loadEnv("development", server.config.root, "");

      server.middlewares.use("/api/auth/agent-login", async (_req, res) => {
        const secretKey = env.CLERK_SECRET_KEY;
        const agentUserId = env.AGENT_CLERK_USER_ID;

        if (!secretKey || !agentUserId) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                "CLERK_SECRET_KEY and AGENT_CLERK_USER_ID must be set in .env.local",
            }),
          );
          return;
        }

        const resp = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: agentUserId,
            expires_in_seconds: 60,
          }),
        });

        if (!resp.ok) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Failed to create sign-in token",
              details: await resp.text(),
            }),
          );
          return;
        }

        const data = await resp.json();
        const token = data.token;
        if (typeof token !== "string") {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No token in Clerk response" }));
          return;
        }

        res.writeHead(302, {
          Location: `/agent-callback?ticket=${encodeURIComponent(token)}`,
        });
        res.end();
      });
    },
  };
}

/** Everything in node_modules except @vvedantb/ui (also under pnpm's `.pnpm` store). */
const COMPILER_EXCLUDE = /\/node_modules\/(?!\.pnpm\/@vvedantb\+ui@|@vvedantb\/ui\/)/;

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({
      routesDirectory: "./src/routes",
      // The generator tests this against each bare directory-entry name (not the
      // full path), so a plain `_utils` excludes both the `_utils.ts` helper file
      // and the `_utils/` folder — mirroring how `_components` is matched.
      routeFileIgnorePattern:
        "(_components|_utils|Client\\.tsx|Panel\\.tsx|\\.test\\.tsx?)",
      autoCodeSplitting: true,
    }),
    // Redline tags JSX with data-redline-source before the React transform.
    // Dev-only by default (off for vite build).
    redline(),
    // React Compiler for both dev and build so local runtime matches production
    // memoization. `compiler: true` runs oxc-transform-react (Rust) in-process —
    // no Babel pass. Bailouts surface as build warnings; `pnpm compiler:check`
    // is the gate that fails on a new one.
    // @vvedantb/ui ships TSX source and holds what used to be @eva/ui, so it
    // is compiled like app code; the plugin skips node_modules by default.
    react({ compiler: true, exclude: COMPILER_EXCLUDE }),
    // Nothing imports the icon barrel anymore: static imports are rewritten to
    // deep paths here, and icon-by-name resolution reads raw path data from
    // the virtual module below — see lib/components/TablerIconByName.tsx.
    tablerDeepImports(),
    tablerIconData(),
    originHints(),
    convexDevProxy(),
    agentLoginPlugin(),
    process.env.ANALYZE === "true" &&
      visualizer({
        filename: "stats.html",
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
  // Served as source in dev (not pre-bundled) so the React Compiler sees it.
  // Its own dependencies are still pre-bundled: several ship CommonJS, which
  // the browser cannot import from unbundled source.
  optimizeDeps: {
    exclude: ["@vvedantb/ui"],
    include: [
      "@vvedantb/ui > @dnd-kit/core",
      "@vvedantb/ui > @dnd-kit/modifiers",
      "@vvedantb/ui > @dnd-kit/sortable",
      "@vvedantb/ui > @dnd-kit/utilities",
      "@vvedantb/ui > @radix-ui/react-accordion",
      "@vvedantb/ui > @radix-ui/react-checkbox",
      "@vvedantb/ui > @radix-ui/react-collapsible",
      "@vvedantb/ui > @radix-ui/react-context-menu",
      "@vvedantb/ui > @radix-ui/react-dialog",
      "@vvedantb/ui > @radix-ui/react-dropdown-menu",
      "@vvedantb/ui > @radix-ui/react-hover-card",
      "@vvedantb/ui > @radix-ui/react-label",
      "@vvedantb/ui > @radix-ui/react-popover",
      "@vvedantb/ui > @radix-ui/react-progress",
      "@vvedantb/ui > @radix-ui/react-scroll-area",
      "@vvedantb/ui > @radix-ui/react-select",
      "@vvedantb/ui > @radix-ui/react-separator",
      "@vvedantb/ui > @radix-ui/react-slider",
      "@vvedantb/ui > @radix-ui/react-slot",
      "@vvedantb/ui > @radix-ui/react-switch",
      "@vvedantb/ui > @radix-ui/react-tabs",
      "@vvedantb/ui > @radix-ui/react-tooltip",
      "@vvedantb/ui > @radix-ui/react-use-controllable-state",
      "@vvedantb/ui > @radix-ui/react-visually-hidden",
      "@vvedantb/ui > @streamdown/cjk",
      "@vvedantb/ui > @streamdown/code",
      "@vvedantb/ui > @streamdown/math",
      "@vvedantb/ui > @streamdown/mermaid",
      "@vvedantb/ui > @tabler/icons-react",
      "@vvedantb/ui > @tanstack/react-hotkeys",
      "@vvedantb/ui > @vvedantb/server",
      "@vvedantb/ui > ai",
      "@vvedantb/ui > class-variance-authority",
      "@vvedantb/ui > clsx",
      "@vvedantb/ui > cmdk",
      "@vvedantb/ui > dayjs",
      "@vvedantb/ui > dayjs/plugin/relativeTime",
      "@vvedantb/ui > embla-carousel-react",
      "@vvedantb/ui > media-chrome/react",
      "@vvedantb/ui > motion/react",
      "@vvedantb/ui > nanoid",
      "@vvedantb/ui > radix-ui",
      "@vvedantb/ui > react-day-picker",
      "@vvedantb/ui > shiki",
      "@vvedantb/ui > sonner",
      "@vvedantb/ui > streamdown",
      "@vvedantb/ui > tailwind-merge",
      "@vvedantb/ui > use-stick-to-bottom",
      "@vvedantb/ui > vaul",
      "@vvedantb/ui > zod",
    ],
  },
  server: {
    host: "0.0.0.0",
    cors: false,
  },
  // The @pierre/diffs highlight worker keeps a dynamic `import("shiki/wasm")`
  // that never runs (we stay on the JS highlighter). Vite's default `iife`
  // worker format cannot code-split, so it would inline that ~1MB wasm payload
  // into the worker bundle; ES workers leave it as a lazy chunk.
  worker: {
    format: "es",
  },
  resolve: {
    alias: [
      // STAGE CHECK (temporary): eva's "@vvedantb/ui" goes through the stage module.
      { find: /^@vvedantb\/ui$/, replacement: "/tmp/repo/apps/web/src/__stage__/vvedantb.tsx" },
      { find: /^@vvedantb\/ui-real$/, replacement: "/tmp/repo/apps/web/node_modules/@vvedantb/ui/src/index.ts" },
      { find: /^@streamdown\/(cjk|code|math|mermaid)$/, replacement: "/tmp/repo/node_modules/.pnpm/@vvedantb+ui@https+++codeload.github.com+vvedantb+packages+tar.gz+2d4f31b58a1acd499b918_1def7fedb9cf7ae94d1a231bc795e582/node_modules/@streamdown/$1" },
      { find: /^katex\/(.*)$/, replacement: "/tmp/repo/node_modules/.pnpm/@vvedantb+ui@https+++codeload.github.com+vvedantb+packages+tar.gz+2d4f31b58a1acd499b918_1def7fedb9cf7ae94d1a231bc795e582/node_modules/katex/$1" },
      { find: /^katex$/, replacement: "/tmp/repo/node_modules/.pnpm/@vvedantb+ui@https+++codeload.github.com+vvedantb+packages+tar.gz+2d4f31b58a1acd499b918_1def7fedb9cf7ae94d1a231bc795e582/node_modules/katex" },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
    // Packages using React Context MUST be deduplicated to prevent "Context not found" errors
    // When pnpm installs multiple copies (different peer deps), each has its own context instance
    // This forces all imports to resolve to the same instance at bundle time
    dedupe: [
      "react",
      "react-dom",
      "convex",
      "convex-helpers",
      "@tanstack/react-router",
      "@tanstack/react-query",
      "@clerk/clerk-react",
      "@tiptap/react",
      "@tiptap/core",
      "@convex-dev/prosemirror-sync",
      "@json-render/react",
      "@pierre/diffs",
      "@pierre/trees",
      "shiki",
      "frimousse",
      "sonner",
      // eva's provider (@eva/ui) and the app must share one copy, or the
      // UiConfig context splits and components lose eva's config.
      "@vvedantb/ui",
    ],
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Only group packages whose whole cost we are happy to load eagerly.
          //
          // A group's `test` claims EVERY module under the matched path,
          // including third-party utilities the package bundles inside its own
          // dist (dayjs inside mermaid, clsx inside streamdown). One eager
          // import of such a utility pulls the entire group chunk into the
          // entry graph, so index.html modulepreloads all of it. That is how
          // mermaid/shiki/streamdown/katex were costing 1.2 MB gzip on first
          // load — do not add groups for them.
          groups: [
            {
              name: "vendor-radix",
              test: /node_modules[\\/]@radix-ui/,
              priority: 15,
            },
            {
              name: "vendor-convex",
              test: /node_modules[\\/](convex|convex-helpers)/,
              priority: 15,
            },
            {
              name: "vendor-clerk",
              test: /node_modules[\\/]@clerk/,
              priority: 15,
            },
            {
              name: "vendor-motion",
              test: /node_modules[\\/](motion|framer-motion)/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
});
