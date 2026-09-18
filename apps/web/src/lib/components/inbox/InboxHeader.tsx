"use client";

import { AnimatePresence, m } from "motion/react";
import { Button, motionFast } from "@eva/ui";
import { IconChecklist, IconChecks } from "@tabler/icons-react";
import { PageHeader } from "@/lib/components/PageHeader";
import { InboxFilterMenu } from "@/lib/components/inbox/InboxFilterMenu";
import type { InboxFilter, InboxGroup } from "@/lib/search-params";

interface InboxHeaderProps {
  filter: InboxFilter;
  group: InboxGroup;
  unreadCount: number;
  isSelecting: boolean;
  onFilterChange: (filter: InboxFilter) => void;
  onGroupChange: (group: InboxGroup) => void;
  onToggleSelecting: () => void;
  onMarkAllRead: () => void;
}

/**
 * The inbox header cluster: mark-all-read (only while something is unread),
 * the selection-mode toggle, and the filter/group dropdown. Split out of
 * `InboxClient` so the orchestrator stays queries, state and layout.
 */
export function InboxHeader({
  filter,
  group,
  unreadCount,
  isSelecting,
  onFilterChange,
  onGroupChange,
  onToggleSelecting,
  onMarkAllRead,
}: InboxHeaderProps) {
  return (
    <PageHeader
      title="Inbox"
      headerRight={
        <>
          <AnimatePresence>
            {unreadCount > 0 ? (
              <m.div
                key="mark-all-read"
                className="inline-flex"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={motionFast}
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onMarkAllRead}
                  title="Mark all as read"
                  aria-label="Mark all as read"
                  className="h-7 text-xs text-muted-foreground"
                >
                  <IconChecks size={14} />
                  {/* The label is noise on narrow screens; the icon carries it. */}
                  <span className="hidden sm:inline">Mark all read</span>
                </Button>
              </m.div>
            ) : null}
          </AnimatePresence>
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleSelecting}
            title={isSelecting ? "Cancel selection" : "Select notifications"}
            aria-label={
              isSelecting ? "Cancel selection" : "Select notifications"
            }
            aria-pressed={isSelecting}
            className="h-7 text-xs text-muted-foreground"
          >
            <IconChecklist size={14} />
            <span className="hidden sm:inline">Select</span>
          </Button>
          <InboxFilterMenu
            filter={filter}
            group={group}
            unreadCount={unreadCount}
            onChange={onFilterChange}
            onGroupChange={onGroupChange}
          />
        </>
      }
    />
  );
}
