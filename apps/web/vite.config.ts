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

      server.middlewares.use("/api/auth/agent-login", async (req, res) => {
        const remote = req.socket.remoteAddress;
        if (
          remote !== "127.0.0.1" &&
          remote !== "::1" &&
          remote !== "::ffff:127.0.0.1"
        ) {
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

function previewAuthEntryPlugin(): Plugin {
  return {
    name: "preview-auth-entry",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/preview-auth" || req.url?.startsWith("/preview-auth?")) {
          req.url = req.url.replace("/preview-auth", "/preview-auth.html");
        }
        next();
      });
    },
  };
}

const COMPILER_EXCLUDE = [
  /\/node_modules\//,
  /\/src\/lib\/stageshow\//,
];

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({
      routesDirectory: "./src/routes",
      routeFileIgnorePattern:
        "(_components|_utils|Client\\.tsx|Panel\\.tsx|\\.test\\.tsx?)",
      autoCodeSplitting: true,
    }),
    redline(),
    react({ compiler: true, exclude: COMPILER_EXCLUDE }),
    tablerDeepImports(),
    tablerIconData(),
    originHints(),
    convexDevProxy(),
    agentLoginPlugin(),
    previewAuthEntryPlugin(),
    process.env.ANALYZE === "true" &&
      visualizer({
        filename: "stats.html",
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
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
      "@vvedantb/ui > dayjs/plugin/relativeTime.js",
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
  worker: {
    format: "es",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
      "@vvedantb/ui",
    ],
  },
  build: {
    rolldownOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        previewAuth: path.resolve(__dirname, "preview-auth.html"),
      },
      output: {
        codeSplitting: {
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
