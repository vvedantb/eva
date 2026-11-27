import type { ThemesType } from "@pierre/diffs";
import type {
  WorkerInitializationRenderOptions,
  WorkerPoolOptions,
} from "@pierre/diffs/react";
// oxlint-disable-next-line import/default -- Vite's ?worker transform provides the generated default constructor.
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";

/**
 * Worker pool configuration for `@pierre/diffs`. Without a pool, syntax
 * highlighting and word-level diffing run synchronously on the main thread,
 * which is what made opening a large PR's Diffs tab block for seconds.
 *
 * The pool's own render options take precedence over the per-instance options
 * passed to `FileDiff`, so the theme and diff granularity live here as shared
 * constants and `ReviewableFileDiff` reads the same ones. Changing one in
 * isolation would silently restyle every diff.
 */
export const DIFF_THEMES: ThemesType = {
  light: "github-light",
  dark: "github-dark",
};

export const DIFF_POOL_OPTIONS: WorkerPoolOptions = {
  workerFactory: () => new DiffsWorker(),
  // Per-file highlight tasks run in tens of milliseconds, so four workers keep
  // the queue drained without paying for eight shiki instances alongside an
  // already memory-heavy review surface.
  poolSize: 4,
};

export const DIFF_HIGHLIGHTER_OPTIONS: WorkerInitializationRenderOptions = {
  theme: DIFF_THEMES,
  lineDiffType: "word",
};
