import { code as shiki } from "@streamdown/code";
import { useState, useSyncExternalStore } from "react";
import type { BundledLanguage, CodeHighlighterPlugin } from "streamdown";

/** Streamdown declares these without exporting them. */
type HighlightResult = NonNullable<ReturnType<CodeHighlighterPlugin["highlight"]>>;
export type HighlightToken = HighlightResult["tokens"][number][number];

/**
 * Syntax highlighting for markdown code blocks, on the same Shiki plugin
 * Streamdown ships (JS regex engine, one lazily-created highlighter per
 * language, `github-light` / `github-dark` tokens in a single pass).
 *
 * The plugin's own cache is keyed by a hash of the code's length and edges and
 * starts a fresh job on every uncached call, so this module keeps a small
 * cache of its own that dedupes in-flight work and notifies subscribers — the
 * shape `useSyncExternalStore` needs, with no effect.
 */

const THEMES = shiki.getThemes();
/** Fence language (lowercased) → Shiki id. Aliases (`ts`, `sh`, `py`) are
 *  keys too; the plugin resolves them to their grammar. */
const LANGUAGES = new Map<string, BundledLanguage>(
  shiki.getSupportedLanguages().map((id) => [id, id]),
);
/** Enough for every code block on screen plus scroll-back; oldest dropped. */
const CACHE_LIMIT = 200;

type Entry = { status: "pending" } | { status: "done"; result: HighlightResult };

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

function cacheKey(language: BundledLanguage, source: string): string {
  return `${language}\u0000${source}`;
}

function store(key: string, entry: Entry): void {
  cache.delete(key);
  cache.set(key, entry);
  if (cache.size <= CACHE_LIMIT) return;
  const oldest = cache.keys().next().value;
  if (oldest !== undefined && !listeners.has(oldest)) cache.delete(oldest);
}

function request(language: BundledLanguage, source: string): HighlightResult | null {
  const key = cacheKey(language, source);
  const hit = cache.get(key);
  if (hit !== undefined) return hit.status === "done" ? hit.result : null;

  store(key, { status: "pending" });
  const sync = shiki.highlight(
    { code: source, language, themes: THEMES },
    (result) => {
      store(key, { status: "done", result });
      for (const notify of listeners.get(key) ?? []) notify();
    },
  );
  if (sync === null) return null;
  store(key, { status: "done", result: sync });
  return sync;
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

/**
 * What to highlight. A finished block is highlighted whole. A block still
 * streaming is highlighted up to its last complete line only: the tokens for
 * finished lines never change, so each new line costs one job instead of one
 * per token, and the partial line renders plain until its newline lands.
 */
export function highlightSource(code: string, isIncomplete: boolean): string {
  const trimmed = code.replace(/\n+$/, "");
  if (!isIncomplete) return trimmed;
  const lastBreak = code.lastIndexOf("\n");
  return lastBreak <= 0 ? "" : code.slice(0, lastBreak);
}

export type CodeLine = { text: string; tokens: HighlightToken[] | null };

/**
 * Pairs each line of `code` with its highlighted tokens when a highlight of a
 * prefix of `code` is available; lines past that prefix stay plain.
 */
export function buildCodeLines(
  code: string,
  highlighted: { source: string; result: HighlightResult } | null,
): CodeLine[] {
  const lines = code.replace(/\n+$/, "").split("\n");
  const usable =
    highlighted !== null &&
    highlighted.source.length > 0 &&
    (code === highlighted.source || code.startsWith(`${highlighted.source}\n`));
  return lines.map((text, index) => ({
    text,
    tokens: usable ? (highlighted.result.tokens[index] ?? null) : null,
  }));
}

/**
 * Highlighted lines for a code block. While a new highlight is in flight the
 * previous one is kept on screen (it still covers every line it was made
 * for), so streaming never flashes back to plain text.
 */
export function useHighlightedLines(
  code: string,
  language: string,
  isIncomplete: boolean,
): CodeLine[] {
  const bundled = LANGUAGES.get(language.toLowerCase()) ?? null;
  const source = bundled === null ? "" : highlightSource(code, isIncomplete);
  const key = bundled === null ? "" : cacheKey(bundled, source);

  const result = useSyncExternalStore(
    (notify) => (key === "" ? () => {} : subscribe(key, notify)),
    () => (bundled === null || source === "" ? null : request(bundled, source)),
  );

  const [shown, setShown] = useState<{
    source: string;
    result: HighlightResult;
  } | null>(null);
  if (result !== null && shown?.result !== result) {
    setShown({ source, result });
  }

  return buildCodeLines(code, result !== null ? { source, result } : shown);
}
