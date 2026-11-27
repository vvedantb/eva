"use client";

import { AnimatePresence, m } from "motion/react";
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  tokenTransition,
} from "@vvedantb/ui";
import { IconChecklist, IconChecks } from "@tabler/icons-react";
import { PageHeader } from "@/lib/components/PageHeader";
import { InboxFilterMenu } from "@/lib/components/inbox/InboxFilterMenu";
import {
  isInboxView,
  type InboxFilter,
  type InboxGroup,
  type InboxView,
} from "@/lib/search-params";

interface InboxHeaderProps {
  view: InboxView;
  onViewChange: (view: InboxView) => void;
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
 * The inbox header: the Needs you / Updates switch by the title, and (on
 * Updates only) the cluster: mark-all-read (only while something is unread),
 * the selection-mode toggle, and the filter/group dropdown. Split out of
 * `InboxClient` so the orchestrator stays queries, state and layout.
 */
export function InboxHeader({
  view,
  onViewChange,
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
      title={
        // The switch sits right after the title, so it keeps its place when
        // Updates narrows the header to its list pane.
        <span className="flex items-center gap-3">
          Inbox
          {/* Segmented, as the other header switchers (projects, quick tasks). */}
          <Tabs
            value={view}
            onValueChange={(value) => {
              if (isInboxView(value)) onViewChange(value);
            }}
          >
            <TabsList
              size="sm"
              className="tabs-segmented"
              aria-label="Inbox view"
            >
              <TabsTrigger value="needs">Needs you</TabsTrigger>
              <TabsTrigger value="updates">Updates</TabsTrigger>
            </TabsList>
          </Tabs>
        </span>
      }
      headerRight={
        // Needs you has no actions; the spacer keeps the row as tall as Updates'.
        view === "needs" ? (
          <div className="h-7" aria-hidden />
        ) : (
          <>
            <AnimatePresence>
              {unreadCount > 0 ? (
                <m.div
                  key="mark-all-read"
                  className="inline-flex"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={tokenTransition.fast}
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
        )
      }
    />
  );
}
