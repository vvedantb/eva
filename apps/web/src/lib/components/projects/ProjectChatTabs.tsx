"use client";

import { useState } from "react";
import type { Id } from "@eva/backend";
import { formatEntityNumLabel } from "@eva/shared";
import {
  ChatTab,
  ChatTabAddButton,
  ChatTabStrip,
} from "@/routes/_repo/$owner/$repo/sessions/_components/ChatTabsBar";
import { ProjectNewTaskModal } from "./ProjectNewTaskModal";
import type { ProjectTaskTabRow } from "./useProjectTaskTabs";

/**
 * The project's chat tabs, as a session's: Eva (the coordinator) first and
 * never closed, then the open task tabs, each with ✕ and the running mark
 * while its task works, then `+` (New task). An archived project has no `+`.
 */
export function ProjectChatTabs({
  projectId,
  repoId,
  rows,
  selected,
  evaRunning,
  isArchived,
  onSelect,
  onClose,
}: {
  projectId: Id<"projects">;
  repoId: Id<"githubRepos">;
  rows: ReadonlyArray<ProjectTaskTabRow>;
  /** The selected task tab's numId; null for Eva. */
  selected: number | null;
  evaRunning: boolean;
  isArchived: boolean;
  onSelect: (numId: number | null) => void;
  onClose: (numId: number) => void;
}) {
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  return (
    <>
      {/* Eva stays pinned on the left; only the task tabs scroll. */}
      <div className="flex min-w-0 shrink-0 items-center pt-2">
        <div className="shrink-0 pb-1.5 pl-2">
          <ChatTab
            selected={selected === null}
            running={evaRunning}
            label="Eva"
            onSelect={() => onSelect(null)}
          />
        </div>
        <ChatTabStrip label="Task chats" className="min-w-0 flex-1 pl-1">
          {rows.map(({ numId, row, running }) => {
            const numLabel = formatEntityNumLabel({ numId });
            return (
              <ChatTab
                key={row._id}
                selected={numId === selected}
                running={running}
                hint={row.title}
                label={
                  <>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {numLabel}
                    </span>{" "}
                    {row.title}
                  </>
                }
                onSelect={() => onSelect(numId)}
                onClose={() => onClose(numId)}
                closeLabel={`Close ${numLabel ?? "task"}`}
                narrow
              />
            );
          })}
          {isArchived ? null : (
            <ChatTabAddButton
              label="New task"
              tooltip="New task"
              onClick={() => setCreateTaskOpen(true)}
            />
          )}
        </ChatTabStrip>
      </div>
      <ProjectNewTaskModal
        projectId={projectId}
        repoId={repoId}
        isOpen={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
      />
    </>
  );
}
