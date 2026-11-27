"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { m } from "motion/react";
import {
  composerSlashOptionId as optionId,
  tokenTransition,
} from "@vvedantb/ui";
import type { MentionPopupPlacement } from "./mentionPopupPosition";

/**
 * `caret` is the compact list next to the caret (comment boxes, modals, task
 * descriptions). `panel` is the full-width sheet anchored above the composer
 * card.
 */
export type MentionPopupLayout = "caret" | "panel";

interface MentionPickerPopupProps<TItem extends { id: string }> {
  title: string;
  listboxId: string;
  placement: MentionPopupPlacement;
  items: TItem[];
  selectedIndex: number;
  renderItem: (item: TItem, isSelected: boolean) => ReactNode;
  onSelectItem: (item: TItem) => void;
  emptyContent?: ReactNode;
}

export function MentionPickerPopup<TItem extends { id: string }>({
  title,
  listboxId,
  placement,
  items,
  selectedIndex,
  renderItem,
  onSelectItem,
  emptyContent,
}: MentionPickerPopupProps<TItem>) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector<HTMLElement>(
      '[data-mention-picker-item][data-selected="true"]',
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, items.length]);

  const isAbove = placement.placement === "above";

  return (
    <div
      className="fixed z-50"
      style={{
        left: placement.left,
        top: placement.top,
        width: placement.width,
        transform: isAbove ? "translateY(-100%)" : undefined,
      }}
    >
      <m.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={tokenTransition.fast}
        style={{ maxHeight: placement.maxHeight }}
        className={
          "flex flex-col overflow-hidden rounded-surface " +
          "bg-popover/95 text-popover-foreground backdrop-blur-md smooth-shadow-ring-lg " +
          (isAbove ? "origin-bottom" : "origin-top")
        }
      >
        {items.length > 0 ? (
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={title}
            className="scrollbar scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
          >
            {items.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  id={optionId(listboxId, item.id)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-mention-picker-item
                  data-selected={isSelected ? "true" : "false"}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectItem(item);
                  }}
                  className={
                    "mx-1 flex w-[calc(100%-0.5rem)] min-w-0 items-center rounded-lg px-2 py-1.5 text-left text-sm max-sm:py-2.5 " +
                    "transition-[background-color] " +
                    (isSelected
                      ? "bg-primary/15 font-medium text-foreground dark:bg-primary/25"
                      : "text-foreground/90 hover:bg-muted")
                  }
                >
                  {renderItem(item, isSelected)}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            {emptyContent ?? "No matches."}
          </div>
        )}
      </m.div>
    </div>
  );
}
