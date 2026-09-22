"use client";

import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { motionFast, useDragSensors } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { TAB_PREFERRED_WIDTH_REM } from "@/lib/components/sidebar/session-tabs/SessionChromeTab";
import { SortableSessionTab } from "@/lib/components/sidebar/session-tabs/SortableSessionTab";
import type { TabGroupColor } from "@/lib/components/sidebar/session-tabs/tabGroupColors";
import { catchMutationError } from "@/lib/utils/mutationToast";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";

type SessionListItem = FunctionReturnType<typeof api.sessions.list>[number];

export interface ChromeTabEntry {
  session: SessionListItem;
  href: string;
  isSelected: boolean;
}

interface SessionChromeTabStripProps {
  repo: RepoWithLogo;
  baseUrl: string;
  groupColor: TabGroupColor;
  /** Every tab in the group, including the closed ones, in strip order. */
  tabs: ChromeTabEntry[];
  /** The subset actually drawn: open tabs, or just the selected one. */
  visibleTabs: ChromeTabEntry[];
  onReorder: (orderedSessionIds: string[]) => void;
  onRenameRequest: (session: SessionListItem) => void;
  onArchiveRequest: (session: SessionListItem) => void;
  onClose: (entry: ChromeTabEntry) => void;
}

/**
 * The tabs themselves: one row of equal-width, reorderable Chrome tabs.
 *
 * Width is stated rather than measured — the row asks for one preferred tab
 * width per tab and shrinks from there, so tabs stay equal width whatever their
 * titles say. A tab is its own container query, which means it cannot also be
 * sized by its own contents.
 */
export function SessionChromeTabStrip({
  repo,
  baseUrl,
  groupColor,
  tabs,
  visibleTabs,
  onReorder,
  onRenameRequest,
  onArchiveRequest,
  onClose,
}: SessionChromeTabStripProps) {
  const navigate = useNavigate();
  const createSession = useMutation(api.sessions.create);
  const sensors = useDragSensors({ sortable: true });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Ordered over every tab in the group rather than the visible ones, so a
    // reopened tab returns to the position the user left it in.
    const ids: string[] = tabs.map((tab) => tab.session._id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  };

  return (
    <div
      className="flex min-w-0 items-end"
      style={{ width: `${visibleTabs.length * TAB_PREFERRED_WIDTH_REM}rem` }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visibleTabs.map((tab) => tab.session._id)}
          strategy={horizontalListSortingStrategy}
        >
          {/* Enter/exit only. Movement belongs to dnd-kit, which runs its own
              transition on drop — a `layout` animation here would play the same
              reorder a second time. */}
          <AnimatePresence initial={false}>
            {visibleTabs.map((entry, index) => (
              <m.div
                key={entry.session._id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={motionFast}
                className="flex min-w-8"
                style={{
                  flexBasis: `${TAB_PREFERRED_WIDTH_REM}rem`,
                  flexGrow: 1,
                  flexShrink: 1,
                }}
              >
                <SortableSessionTab
                  session={entry.session}
                  href={entry.href}
                  isSelected={entry.isSelected}
                  showSeparator={
                    index > 0 &&
                    !entry.isSelected &&
                    !visibleTabs[index - 1]?.isSelected
                  }
                  groupColor={groupColor}
                  onRenameRequest={() => onRenameRequest(entry.session)}
                  onArchiveRequest={() => onArchiveRequest(entry.session)}
                  onClose={() => onClose(entry)}
                  onDuplicate={async () => {
                    const { numId } = await catchMutationError(
                      createSession({
                        repoId: repo._id,
                        title: `${entry.session.title} (copy)`,
                      }),
                      "Couldn't duplicate session",
                      "session-duplicate",
                    );
                    return String(numId);
                  }}
                  onDuplicateNavigate={(segment) => {
                    navigate({ to: `${baseUrl}/${segment}` });
                  }}
                />
              </m.div>
            ))}
          </AnimatePresence>
        </SortableContext>
      </DndContext>
    </div>
  );
}
