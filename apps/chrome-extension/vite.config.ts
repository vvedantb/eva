import { defineConfig, build as viteBuild, normalizePath } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/postcss";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync, readdirSync } from "fs";

const isWatchMode = process.argv.includes("--watch");
const isDev =
  process.argv.includes("development") || process.argv.includes("staging");
const extensionRoot = normalizePath(resolve(__dirname));
const workspaceRoot = normalizePath(resolve(__dirname, "../.."));

const watchInclude = [
  `${extensionRoot}/src/**`,
  `${extensionRoot}/public/**`,
  `${extensionRoot}/manifest.json`,
  `${extensionRoot}/tailwind.config.js`,
  `${extensionRoot}/postcss.config.js`,
  `${extensionRoot}/.env*`,
  `${workspaceRoot}/packages/ui/src/**`,
  `${workspaceRoot}/packages/shared/src/**`,
  `${workspaceRoot}/packages/backend/index.ts`,
  `${workspaceRoot}/packages/backend/convex/_generated/**`,
  `${workspaceRoot}/packages/backend/convex/validators.ts`,
];

const watchExclude = [`${extensionRoot}/dist/**`];

const contentScriptWatchRoots = [
  `${extensionRoot}/src/content`,
  `${extensionRoot}/src/shared`,
  `${workspaceRoot}/packages/ui/src`,
  `${workspaceRoot}/packages/shared/src`,
];

const contentScriptWatchFiles = [
  `${extensionRoot}/tailwind.config.js`,
  `${extensionRoot}/postcss.config.js`,
];

function isFileInDirectory(filePath: string, directoryPath: string) {
  return filePath === directoryPath || filePath.startsWith(`${directoryPath}/`);
}

function copyStaticFiles() {
  return {
    name: "copy-static-files",
    closeBundle() {
      copyFileSync("manifest.json", "dist/manifest.json");

      if (!existsSync("dist/icons")) {
        mkdirSync("dist/icons", { recursive: true });
      }

      if (existsSync("public/icons")) {
        const icons = readdirSync("public/icons");
        for (const icon of icons) {
          copyFileSync(`public/icons/${icon}`, `dist/icons/${icon}`);
        }
      }
    },
  };
}

function runContentScriptBuild() {
  return viteBuild({
    configFile: false,
    root: resolve(__dirname),
    plugins: [react()],
    resolve: {
      alias: { "@": resolve(__dirname, "src") },
      // One copy for @eva/ui's provider and the toolbar, so the config applies.
      dedupe: ["react", "react-dom", "@vvedantb/ui"],
    },
    css: {
      // Tailwind v4 reads its config from `@config` inside content.css; `base`
      // just anchors source scanning to the extension root. Prefixing is now
      // handled by Lightning CSS, so autoprefixer is gone.
      postcss: {
        plugins: [tailwindcss({ base: resolve(__dirname) })],
      },
    },
    esbuild: { charset: "ascii" },
    logLevel: "warn",
    build: {
      minify: isDev ? false : "esbuild",
      reportCompressedSize: !isDev,
      chunkSizeWarningLimit: 3000,
      write: true,
      outDir: resolve(__dirname, "dist"),
      emptyOutDir: false,
      rollupOptions: {
        input: { content: resolve(__dirname, "src/content/index.ts") },
        output: {
          format: "iife",
          dir: resolve(__dirname, "dist"),
          entryFileNames: "[name].js",
          inlineDynamicImports: true,
        },
      },
    },
  });
}

function buildContentScript() {
  let shouldBuildContentScript = true;

  return {
    name: "build-content-script",
    watchChange(id: string) {
      if (!isWatchMode) return;

      const filePath = normalizePath(id);

      if (contentScriptWatchFiles.includes(filePath)) {
        shouldBuildContentScript = true;
        return;
      }

      const touchedContentSource = contentScriptWatchRoots.some((watchRoot) =>
        isFileInDirectory(filePath, watchRoot),
      );

      if (touchedContentSource) {
        shouldBuildContentScript = true;
      }
    },
    async closeBundle() {
      if (isWatchMode && !shouldBuildContentScript) return;
      shouldBuildContentScript = false;
      await runContentScriptBuild();
    },
  };
}

export default defineConfig({
  plugins: [react(), copyStaticFiles(), buildContentScript()],
  base: "",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    ...(isWatchMode && {
      watch: {
        include: watchInclude,
        exclude: watchExclude,
      },
    }),
    outDir: "dist",
    emptyOutDir: true,
    minify: isDev ? false : "esbuild",
    reportCompressedSize: !isDev,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
