"use client";

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconChevronDown, IconChevronUp, IconSearch, IconX } from "@tabler/icons-react";
import {
  FIND_QUERY_MAX_LENGTH,
  findThreadMatches,
  normalizeFindQuery,
  resolveThreadFindJump,
  shouldCaptureChatFindShortcutFromTarget,
  stepThreadFindIndex,
  threadFindCountLabel,
  type ThreadFindDocument,
} from "@/lib/components/chat/threadFind";
import { applyThreadFindMarks, clearThreadFindMarks } from "@/lib/components/chat/threadFindDom";

function findScope(host: HTMLElement | null): ParentNode | null {
  return (
    host?.closest("[data-thread-find-scope], [data-chat-pane]") ??
    document.querySelector("[data-thread-find-scope], [data-chat-pane]")
  );
}

export function ThreadFindBar({
  documents,
  defaultOpen = false,
  defaultQuery = "",
}: {
  documents: ReadonlyArray<ThreadFindDocument>;
  defaultOpen?: boolean;
  defaultQuery?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState(defaultQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const [focusNonce, setFocusNonce] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const matches = useMemo(
    () => findThreadMatches(documents, deferredQuery),
    [deferredQuery, documents],
  );
  const matchCount = matches.length;
  const safeIndex =
    matchCount === 0 ? -1 : Math.min(Math.max(activeIndex, 0), matchCount - 1);
  const countLabel = threadFindCountLabel(deferredQuery, matchCount, safeIndex);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        if (event.shiftKey || event.altKey) return;
        if (!shouldCaptureChatFindShortcutFromTarget(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        if (!open) {
          const selected = window.getSelection()?.toString().trim() ?? "";
          if (selected.length > 0) {
            setQuery(selected.slice(0, FIND_QUERY_MAX_LENGTH));
            setActiveIndex(0);
          }
          setOpen(true);
        }
        setFocusNonce((value) => value + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [focusNonce, open]);

  useLayoutEffect(() => {
    const scope = findScope(hostRef.current);
    if (!scope) return;
    if (!open || normalizeFindQuery(deferredQuery).length === 0) {
      clearThreadFindMarks(scope);
      return;
    }
    const active = applyThreadFindMarks(scope, deferredQuery, safeIndex);
    if (active) {
      active.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return () => {
      clearThreadFindMarks(scope);
    };
  }, [deferredQuery, open, safeIndex]);

  function handleStep(direction: "next" | "previous") {
    if (matchCount === 0) return;
    setActiveIndex(stepThreadFindIndex(matchCount, safeIndex, direction));
  }

  if (!open) return <div ref={hostRef} className="contents" />;

  const match = resolveThreadFindJump(matches, safeIndex);

  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute right-3 top-3 z-40"
    >
      <div
        role="search"
        data-testid="thread-find-bar"
        data-thread-find-bar=""
        className="pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-xl border border-border bg-card shadow-lg"
      >
        <div className="flex items-center gap-2 px-3">
          <IconSearch
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value.slice(0, FIND_QUERY_MAX_LENGTH));
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                return;
              }
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
