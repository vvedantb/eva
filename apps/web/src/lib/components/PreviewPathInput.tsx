"use client";

import { useState, useId, type KeyboardEvent } from "react";
import { useLocalStorage } from "usehooks-ts";
import { Input, Popover, PopoverAnchor, PopoverContent } from "@vvedantb/ui";
import { useRepo } from "@/lib/contexts/RepoContext";
import { PreviewPathHistoryList } from "./PreviewPathHistoryList";
import {
  EMPTY_PREVIEW_PATH_HISTORY,
  filterPreviewPathHistory,
  normalizePreviewPath,
  parsePreviewPathHistoryJson,
  previewPathHistoryStorageKey,
  recordPreviewPath,
} from "./previewPathHistory";

export function PreviewPathInput({
  value,
  onValueChange,
  onCommit,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onCommit: (path: string) => void;
}) {
  const { repoId } = useRepo();
  const listId = useId();
  const [history, setHistory] = useLocalStorage(
    previewPathHistoryStorageKey(repoId),
    EMPTY_PREVIEW_PATH_HISTORY,
    { deserializer: parsePreviewPathHistoryJson },
  );
  const [focused, setFocused] = useState(false);
  const [listDismissed, setListDismissed] = useState(false);
  // Like a browser address bar: focus lists the full history; typing filters it.
  const [typedSinceFocus, setTypedSinceFocus] = useState(false);
  const matches = filterPreviewPathHistory(
    history,
    typedSinceFocus ? value : "",
  );
  const matchesKey = matches.join("\0");
  const [prevMatchesKey, setPrevMatchesKey] = useState(matchesKey);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  if (matchesKey !== prevMatchesKey) {
    setPrevMatchesKey(matchesKey);
    setSelectedIndex(-1);
  }
  const open = focused && !listDismissed && matches.length > 0;
  const optionIdPrefix = `${listId}-option-`;
  const activeOptionId =
    open && selectedIndex >= 0
      ? `${optionIdPrefix}${selectedIndex}`
      : undefined;

  function commitDraft() {
    const nextPath = normalizePreviewPath(value);
    onValueChange(nextPath);
    setHistory((prev) => recordPreviewPath(prev, nextPath));
    setListDismissed(true);
    onCommit(nextPath);
  }

  function commitSuggestion(path: string) {
    onValueChange(path);
    setHistory((prev) => recordPreviewPath(prev, path));
    setListDismissed(true);
    onCommit(path);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      setListDismissed(true);
      return;
    }
    if (event.key === "ArrowDown") {
      if (matches.length === 0) return;
      event.preventDefault();
      setListDismissed(false);
      setSelectedIndex((current) => {
        if (current < 0) return 0;
        return (current + 1) % matches.length;
      });
      return;
    }
    if (event.key === "ArrowUp") {
      if (matches.length === 0) return;
      event.preventDefault();
      setListDismissed(false);
      setSelectedIndex((current) => {
        if (current < 0) return matches.length - 1;
        return (current - 1 + matches.length) % matches.length;
      });
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (open && selectedIndex >= 0) {
      const selected = matches[selectedIndex];
      if (selected !== undefined) {
        commitSuggestion(selected);
        return;
      }
    }
    commitDraft();
  }

  return (
    <Popover
      open={open}
      modal={false}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setListDismissed(true);
      }}
    >
      <PopoverAnchor asChild>
        <Input
          className="h-8 max-sm:min-w-0 flex-1 text-base sm:text-xs"
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            setTypedSinceFocus(true);
            setListDismissed(false);
          }}
          onFocus={() => {
            setFocused(true);
            setTypedSinceFocus(false);
            setListDismissed(false);
          }}
          onClick={() => setListDismissed(false)}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (
              next instanceof Element &&
              next.closest("[data-preview-path-history]") !== null
            ) {
              return;
            }
            setFocused(false);
            commitDraft();
          }}
          onKeyDown={handleKeyDown}
          placeholder="/"
          role="combobox"
          aria-label="Preview path"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={activeOptionId}
        />
      </PopoverAnchor>
      {matches.length > 0 ? (
        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="w-[var(--radix-popover-trigger-width)] p-0"
        >
          <PreviewPathHistoryList
            paths={matches}
            selectedIndex={selectedIndex}
            listId={listId}
            onSelect={commitSuggestion}
          />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
