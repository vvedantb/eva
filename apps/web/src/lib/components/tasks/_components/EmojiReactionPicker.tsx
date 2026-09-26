"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { EmojiPicker } from "frimousse";
import { api } from "@eva/backend";
import { Popover, PopoverContent, PopoverTrigger, cn } from "@eva/ui";
import { IconMoodSmile } from "@tabler/icons-react";
import { useIdleCallback } from "@/lib/hooks/useIdleCallback";

// Fast-path reactions shown above the full searchable grid.
const QUICK_REACTIONS = ["👍", "❤️", "🎉", "😄", "🚀", "👀"];

/** How long the search box must sit still before Eva asks Jev about it. */
const SUGGEST_IDLE_MS = 400;
/** One letter matches everything; Jev needs a word to read intent from. */
const SUGGEST_MIN_CHARS = 2;

/**
 * Jev's picks for the search box. frimousse only matches emoji keywords, so
 * "ship it" or "nice work" find nothing; Jev reads what the user meant. Picks
 * are keyed by the query they answer, so they vanish as soon as it changes
 * rather than lingering against text the user has since rewritten.
 */
function useEmojiSuggestions(): {
  search: string;
  setSearch: (value: string) => void;
  suggestions: string[];
} {
  const suggest = useAction(api.emojiSuggestions.suggest);
  const [search, setSearchValue] = useState("");
  const [answered, setAnswered] = useState<{
    query: string;
    emoji: string[];
  } | null>(null);
  const schedule = useIdleCallback(SUGGEST_IDLE_MS, (query: string) => {
    void suggest({ query })
      .then((emoji) => setAnswered({ query, emoji }))
      // Background hint: a failed evaluation just leaves the quick row.
      .catch(() => {});
  });
  const setSearch = (value: string) => {
    setSearchValue(value);
    const query = value.trim();
    if (query.length >= SUGGEST_MIN_CHARS) schedule(query);
  };
  const query = search.trim();
  const suggestions = answered?.query === query ? answered.emoji : [];
  return { search, setSearch, suggestions };
}

interface EmojiReactionPickerProps {
  onSelect: (emoji: string) => void;
  // When the comment already has reactions the trigger stays visible; otherwise
  // it only appears on hover/focus of the comment to keep the row uncluttered.
  alwaysVisible?: boolean;
  // "pill" = bordered chip beside the reaction chips; "ghost" = icon button
  // matching the comment-header actions (e.g. next to the options menu).
  variant?: "pill" | "ghost";
}

/**
 * "Add reaction" trigger + popover. A quick-react row sits above a full
 * frimousse emoji picker (unstyled, virtualized; styled here against our
 * surface tokens). Selecting from either path fires `onSelect` and closes.
 */
export function EmojiReactionPicker({
  onSelect,
  alwaysVisible,
  variant = "pill",
}: EmojiReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const { search, setSearch, suggestions } = useEmojiSuggestions();
  // Jev's picks take the quick row's place while they answer the search.
  const rowEmoji = suggestions.length > 0 ? suggestions : QUICK_REACTIONS;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // The picker unmounts on close; a reopened one starts with an empty box.
    if (!next) setSearch("");
  };

  const choose = (emoji: string) => {
    onSelect(emoji);
    handleOpenChange(false);
  };

  // Sizes grow to the 40px tap floor below `sm` instead of taking `hit-target`:
  // the trigger sits flush against the comment's overflow menu (and, in the
  // reaction bar, against the chips), where an 8px bleed would overlap them.
  const triggerClassName = cn(
    "flex items-center justify-center text-muted-foreground transition-[opacity,background-color,color] hover:text-foreground focus-visible:opacity-100 data-[state=open]:text-foreground data-[state=open]:opacity-100",
    variant === "ghost"
      ? "size-10 rounded-md hover:bg-muted/60 data-[state=open]:bg-muted sm:size-7"
      : "h-10 rounded-full bg-muted/40 px-2 hover:bg-muted data-[state=open]:bg-muted sm:h-6",
    // Hover-only reveal is unreachable on touch; `reveal-on-hover` keeps the
    // quiet pointer behaviour and ships the trigger visible below `sm`.
    !alwaysVisible && "reveal-on-hover",
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Add reaction"
          className={triggerClassName}
        >
          <IconMoodSmile className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-fit overflow-hidden p-0">
        <div
          role="group"
          aria-label={
            suggestions.length > 0 ? "Suggested by Jev" : "Quick reactions"
          }
          className="flex items-center gap-0.5 border-b border-border p-1.5"
        >
          {rowEmoji.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => choose(emoji)}
              aria-label={`React with ${emoji}`}
              className="flex size-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-muted"
            >
              {emoji}
            </button>
          ))}
        </div>
        <EmojiPicker.Root
          onEmojiSelect={({ emoji }) => choose(emoji)}
          className="isolate flex h-75 w-72 flex-col bg-popover/95 text-popover-foreground backdrop-blur-md"
        >
          <EmojiPicker.Search
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="z-10 mx-2 mt-2 appearance-none rounded-control border border-input bg-popover px-2.5 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring/45"
          />
          <EmojiPicker.Viewport className="relative flex-1 outline-hidden">
            <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Loading…
            </EmojiPicker.Loading>
            <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              No emoji found.
            </EmojiPicker.Empty>
            <EmojiPicker.List
              className="select-none pb-1.5"
              components={{
                CategoryHeader: ({ category, ...props }) => (
                  <div
                    className="bg-popover px-3 pb-1.5 pt-3 text-xs font-medium text-muted-foreground"
                    {...props}
                  >
                    {category.label}
                  </div>
                ),
                Row: ({ children, ...props }) => (
                  <div className="scroll-my-1.5 px-1.5" {...props}>
                    {children}
                  </div>
                ),
                Emoji: ({ emoji, ...props }) => (
                  <button
                    className="flex size-8 items-center justify-center rounded-md text-lg transition-colors data-active:bg-muted"
                    {...props}
                  >
                    {emoji.emoji}
                  </button>
                ),
              }}
            />
          </EmojiPicker.Viewport>
        </EmojiPicker.Root>
      </PopoverContent>
    </Popover>
  );
}
