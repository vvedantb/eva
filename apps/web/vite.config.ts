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

function agentLoginPlugin(): Plugin {
  let env: Record<string, string>;

  return {
    name: "agent-login",
    configureServer(server) {
      env = loadEnv("development", server.config.root, "");

      server.middlewares.use("/api/auth/agent-login", async (req, res) => {
        const addr = req.socket?.remoteAddress ?? "";
        const isLoopback =
          addr === "127.0.0.1" ||
          addr === "::1" ||
          addr === "::ffff:127.0.0.1";
        if (!isLoopback) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Forbidden" }));
          return;
        }

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
    // React Compiler for both dev and build so local runtime matches production
    // memoization. `compiler: true` runs oxc-transform-react (Rust) in-process —
    // no Babel pass. Bailouts surface as build warnings; `pnpm compiler:check`
    // is the gate that fails on a new one.
    react({ compiler: true }),
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
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
      "@pierre/diffs",
      "@pierre/trees",
      "shiki",
      "frimousse",
      "sonner",
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
