"use client";

import { useDeferredValue, useState } from "react";
import {
  IconChevronDown,
  IconChevronUp,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import {
  FIND_QUERY_MAX_LENGTH,
  findThreadMatches,
  isWithinChatFindScope,
  normalizeFindQuery,
  resolveThreadFindJump,
  shouldCaptureChatFindShortcutFromTarget,
  stepThreadFindIndex,
  threadFindCountLabel,
  type ThreadFindDocument,
} from "@/lib/components/chat/threadFind";
import {
  clearThreadFindHighlights,
  findThreadFindMatchElement,
  paintThreadFindHighlights,
  THREAD_FIND_HIGHLIGHT_CSS,
} from "@/lib/components/chat/threadFindDom";

function findScope(node: Element | null): ParentNode | null {
  return (
    node?.closest("[data-thread-find-scope], [data-chat-pane]") ??
    document.querySelector("[data-thread-find-scope], [data-chat-pane]")
  );
}

function focusFindInput(node: HTMLInputElement | null): void {
  if (!node) return;
  node.focus();
  node.select();
}

export function ThreadFindBar({
  documents,
  defaultOpen = false,
  defaultQuery = "",
  onQueryChange,
  scopeKey = "",
  jumpKey = 0,
}: {
  documents: ReadonlyArray<ThreadFindDocument>;
  defaultOpen?: boolean;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  scopeKey?: string;
  jumpKey?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState(defaultQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const matches = findThreadMatches(documents, deferredQuery);
  const matchCount = matches.length;
  const safeIndex =
    matchCount === 0 ? -1 : Math.min(Math.max(activeIndex, 0), matchCount - 1);
  const countLabel = threadFindCountLabel(deferredQuery, matchCount, safeIndex);

  const registerShortcuts = (node: HTMLDivElement | null) => {
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (node.closest("[inert]")) return;
      if (event.key === "Escape") {
        if (!open) return;
        if (!isWithinChatFindScope(event.target)) return;
        setOpen(false);
        if (
          event.target instanceof Element &&
          event.target.closest("[data-thread-find-bar]")
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "f") return;
      if (event.shiftKey || event.altKey) return;
      if (!shouldCaptureChatFindShortcutFromTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (open) {
        setOpen(false);
        return;
      }
      const selected = window.getSelection()?.toString().trim() ?? "";
      if (selected.length > 0) {
        const nextQuery = selected.slice(0, FIND_QUERY_MAX_LENGTH);
        setQuery(nextQuery);
        setActiveIndex(0);
        onQueryChange?.(nextQuery);
      }
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  };

  function handleStep(direction: "next" | "previous") {
    if (matchCount === 0) return;
    setActiveIndex(stepThreadFindIndex(matchCount, safeIndex, direction));
  }

  if (!open) return <div ref={registerShortcuts} className="contents" />;

  const match = resolveThreadFindJump(matches, safeIndex);

  return (
    <div
      ref={registerShortcuts}
      className="pointer-events-none absolute right-3 top-3 z-40"
    >
      <style href="eva-thread-find" precedence="default">
        {THREAD_FIND_HIGHLIGHT_CSS}
      </style>
      <div
        role="search"
        data-testid="thread-find-bar"
        data-thread-find-bar=""
        className="pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border bg-card shadow-lg"
      >
        <span
          hidden
          key={`paint:${matchCount}:${safeIndex}:${deferredQuery}:${scopeKey}`}
          ref={(node) => {
            const scope = findScope(node);
            if (!scope) return;
            paintThreadFindHighlights(scope, deferredQuery, safeIndex);
            return clearThreadFindHighlights;
          }}
        />
        <span
          hidden
          key={`jump:${safeIndex}:${deferredQuery}:${jumpKey}`}
          ref={(node) => {
            const scope = findScope(node);
            if (!scope) return;
            findThreadFindMatchElement(
              scope,
              deferredQuery,
              safeIndex,
            )?.scrollIntoView({ block: "center", behavior: "smooth" });
          }}
        />
        <div className="flex items-center gap-2 px-3">
          <IconSearch
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={focusFindInput}
            type="text"
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value.slice(
                0,
                FIND_QUERY_MAX_LENGTH,
              );
              setQuery(nextQuery);
              setActiveIndex(0);
              onQueryChange?.(nextQuery);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                handleStep(event.shiftKey ? "previous" : "next");
              }
            }}
            placeholder="Find in thread"
            aria-label="Find in thread"
            autoComplete="off"
            spellCheck={false}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            className="hit-target inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close find"
            onClick={() => setOpen(false)}
          >
            <IconX className="size-4" />
          </button>
        </div>
        {normalizeFindQuery(query).length > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="hit-target inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                aria-label="Previous match"
                disabled={matchCount === 0}
                onClick={() => handleStep("previous")}
              >
                <IconChevronUp className="size-4" />
              </button>
              <button
                type="button"
                className="hit-target inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                aria-label="Next match"
                disabled={matchCount === 0}
                data-testid="thread-find-next"
                onClick={() => handleStep("next")}
              >
                <IconChevronDown className="size-4" />
              </button>
            </div>
            <span
              className="pr-1 text-xs tabular-nums text-muted-foreground"
              aria-live="polite"
              data-testid="thread-find-count"
            >
              {countLabel}
            </span>
          </div>
        ) : null}
        {match ? (
          <span className="sr-only" data-testid="thread-find-active">
            {match.messageId}
          </span>
        ) : null}
      </div>
    </div>
  );
}
