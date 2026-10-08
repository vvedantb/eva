"use client";

import { AnimatePresence, m } from "motion/react";
import {
  cn,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  motionFast,
} from "@eva/ui";
import { UserInitials } from "@eva/shared/user-initials";
import { EmojiReactionPicker } from "./EmojiReactionPicker";
import type { ReactionGroup } from "./TaskReactionsProvider";

interface ReactionBarProps {
  groups: ReactionGroup[];
  toggle: (emoji: string) => void;
}

/**
 * Grouped reaction chips for a comment. Renders nothing until the comment has
 * at least one reaction â€” the primary "add reaction" entry point lives in the
 * comment header. Once reactions exist, an inline picker trigger is kept
 * alongside the chips for convenience (so it's available in both places). Chips
 * the current user picked are highlighted; click any chip to toggle that emoji.
 */
export function ReactionBar({ groups, toggle }: ReactionBarProps) {
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <AnimatePresence initial={false} mode="popLayout">
        {groups.map((group) => (
          <m.div
            key={group.emoji}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionFast}
          >
            <HoverCard>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  onClick={() => toggle(group.emoji)}
                  aria-pressed={group.reactedByMe}
                  className={cn(
                    // 24px chips are not a tap target, and they sit 4px apart, so
                    // they grow to the 40px floor below `sm` rather than bleeding
                    // into each other with `hit-target`.
                    "flex h-10 items-center gap-1 rounded-full border px-2 text-xs leading-none transition-colors sm:h-6",
                    group.reactedByMe
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span className="text-sm leading-none">{group.emoji}</span>
                  <span className="tabular-nums">{group.count}</span>
                </button>
              </HoverCardTrigger>
              <HoverCardContent align="start" className="w-auto min-w-40 p-2">
                <div className="flex flex-col gap-1.5">
                  {group.reactors.map((reactor) => (
                    <div
                      key={reactor.userId}
                      className="flex items-center gap-2"
                    >
                      <UserInitials
                        userId={reactor.userId}
                        size="sm"
                        hideLastSeen
                        disableProfileCard
                      />
                      <span data-pii className="text-sm text-foreground">
                        {reactor.name}
                      </span>
                    </div>
                  ))}
                </div>
              </HoverCardContent>
            </HoverCard>
          </m.div>
        ))}
      </AnimatePresence>
      <EmojiReactionPicker onSelect={toggle} alwaysVisible />
    </div>
  );
}
