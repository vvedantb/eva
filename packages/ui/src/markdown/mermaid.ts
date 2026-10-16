import type { MermaidConfig } from "@streamdown/mermaid";
import { useSyncExternalStore } from "react";
import type { DiagramPlugin } from "streamdown";

/**
 * Mermaid for markdown, loaded on first use. `@streamdown/mermaid` imports
 * mermaid statically, so a plain plugin import put mermaid in every chunk
 * that renders markdown. Here the plugin is a dynamic import that runs only
 * when a finished mermaid fence mounts.
 *
 * One render serves two readers: `MarkdownMermaid` waits for it to decide
 * diagram or plain code block (a diagram that will not parse stays code), and
 * Streamdown's diagram view gets the same cached SVG through `mermaidPlugin`.
 */

type MermaidTheme = Extract<MermaidConfig["theme"], "default" | "dark">;
/** `id` is the element id mermaid baked into `svg` (its styles and markers use it). */
type RenderResult = { svg: string; id: string };
type Entry = {
  promise: Promise<RenderResult>;
  status: "pending" | "done" | "error";
};

/** Enough for every diagram on screen plus scroll-back; oldest dropped. */
const CACHE_LIMIT = 50;

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

let pluginPromise: Promise<DiagramPlugin> | null = null;
/** `initialize` is global to mermaid, so set-theme-then-render runs one at a time. */
let queue: Promise<unknown> = Promise.resolve();
let renderCount = 0;

function loadPlugin(): Promise<DiagramPlugin> {
  pluginPromise ??= import("@streamdown/mermaid").then(
    (module) => module.mermaid,
    (error) => {
      // A failed chunk load may succeed later; do not cache the failure.
      pluginPromise = null;
      throw error;
    },
  );
  return pluginPromise;
}

function renderNow(theme: MermaidTheme, code: string): Promise<RenderResult> {
  const job = queue.then(async () => {
    const plugin = await loadPlugin();
    renderCount += 1;
    // The `-svg` suffix keeps one id from being a prefix of another.
    const id = `eva-mermaid-${renderCount}-svg`;
    const { svg } = await plugin.getMermaid({ theme }).render(id, code);
    return { svg, id };
  });
  queue = job.catch(() => undefined);
  return job;
}

function cacheKey(theme: MermaidTheme, code: string): string {
  return `${theme}\u0000${code}`;
}

function store(key: string, entry: Entry): void {
  cache.delete(key);
  cache.set(key, entry);
  // Drop the oldest entries nobody is watching; mounted diagrams stay.
  for (const candidate of cache.keys()) {
    if (cache.size <= CACHE_LIMIT) return;
    if (!listeners.has(candidate)) cache.delete(candidate);
  }
}

function request(theme: MermaidTheme, code: string): Entry {
  const key = cacheKey(theme, code);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const promise = renderNow(theme, code);
  const entry: Entry = { promise, status: "pending" };
  store(key, entry);
  const settle = (status: Entry["status"]) => {
    // An entry evicted (or replaced) while pending stays gone.
    if (cache.get(key)?.promise !== promise) return;
    store(key, { promise, status });
    for (const notify of listeners.get(key) ?? []) notify();
  };
  promise.then(
    () => settle("done"),
    () => settle("error"),
  );
  return entry;
}

function subscribe(key: string, notify: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  set.add(notify);
  listeners.set(key, set);
  return () => {
    set.delete(notify);
    if (set.size === 0) listeners.delete(key);
  };
}

/** The app theme lives as a `dark` class on `<html>` (neutral is dark-family). */
function readTheme(): MermaidTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "default";
}

function subscribeTheme(notify: () => void): () => void {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

/**
 * Streamdown's diagram plugin, backed by the shared cache. It renders in the
 * current app theme; `MarkdownMermaid` remounts the diagram when that changes.
 */
export const mermaidPlugin: DiagramPlugin = {
  name: "mermaid",
  type: "diagram",
  language: "mermaid",
  getMermaid: () => ({
    initialize: () => {},
    // The cached SVG is shared, so give each copy the caller's unique id:
    // two copies with one id (inline + fullscreen, or a repeated diagram)
    // would share `#id` styles and `url(#id_marker)` references.
    render: (id, code) =>
      request(readTheme(), code).promise.then((result) => ({
        svg: result.svg.replaceAll(result.id, id),
      })),
  }),
};

/**
 * Renders `code` in the current theme once `enabled` (the fence is closed) and
 * reports progress. Nothing loads while disabled, so a fence still streaming
 * costs nothing and never surfaces a parse error.
 */
export function useMermaidRender(
  code: string,
  enabled: boolean,
): { theme: MermaidTheme; status: Entry["status"] } {
  const theme = useSyncExternalStore(subscribeTheme, readTheme);
  const key = enabled ? cacheKey(theme, code) : "";
  const entry = useSyncExternalStore(
    (notify) => (key === "" ? () => {} : subscribe(key, notify)),
    () => (key === "" ? null : request(theme, code)),
  );
  return { theme, status: entry?.status ?? "pending" };
}
