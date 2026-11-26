"use client";

import type { Id } from "@eva/backend";
import { cn } from "@eva/ui";
import { compactRelativeTime } from "@eva/shared/dates";
import type { ProjectTaskView } from "@eva/shared/projectView";
import { IconLock } from "@tabler/icons-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  ListRow,
} from "@vvedantb/ui";
import type { ReactNode } from "react";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { TaskCardMenuItems } from "@/lib/components/quick-tasks/_components/TaskCardMenuItems";
import { useTaskMenu } from "@/lib/components/quick-tasks/_components/useTaskMenu";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import type { ProjectTaskListRow } from "../useProjectStatus";
import { projectTaskDisplayStatusConfig } from "../ProjectPhaseBadge";

/** A flat row: no fill at rest, the list row hover tint, no stripe. */
export const FLAT_ROW_CLASS = "bg-transparent";
export const FLAT_ROW_CONTENT_CLASS = "px-2 py-1.5";

/**
 * The project task list's flat row body: a status icon, the title on one
 * line, one muted sentence under it, and `trailing` (the age) at the end.
 */
export function ProjectFlatRowBody({
  icon,
  title,
  line,
  trailing,
}: {
  icon: ReactNode;
  title: string;
  line: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-5 shrink-0 items-center">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-2sm font-medium leading-5 tracking-[-0.01em] text-foreground">
          {title}
        </p>
        <p className="truncate text-xs leading-4 text-muted-foreground">
          {line}
        </p>
      </div>
      {trailing}
    </div>
  );
}

/** The muted age at a row's end. */
export function RowAge({
  at,
  className,
}: {
  at: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-5 shrink-0 items-center text-2xs tabular-nums text-muted-foreground/70",
        className,
      )}
    >
      {compactRelativeTime(at)}
    </span>
  );
}

/**
 * One flat row of a project's task list: the display status icon, the
 * title, and `line` (`projectTaskSummaryLine`). Right-click opens the task menu
 * (Unarchive on a task archived on its own). A read-only (archived) project's
 * row has neither. A task in a repo the reader cannot open is a locked row
 * with no link. A task open as a chat tab is marked: a tint and
 * an accent stripe.
 */
export function ProjectTaskRow({
  task,
  view,
  open = false,
  line,
  onSelectTask,
  basePath,
  readOnly,
}: {
  task: ProjectTaskListRow;
  view: ProjectTaskView;
  /** Open as a chat tab beside Eva. */
  open?: boolean;
  line: string;
  onSelectTask: (id: Id<"agentTasks">) => void;
  basePath: string;
  readOnly: boolean;
}) {
  const config = projectTaskDisplayStatusConfig[view.displayStatus];
  const StatusIcon = config.icon;
  const icon = <StatusIcon size={14} className={config.text} aria-hidden />;
  const segment = entityPathSegment(task);
  const href = segment
    ? `${basePath}/quick-tasks/${segment}`
    : `${basePath}/quick-tasks`;
  const { menuProps, dialogs, hasDialogOpen } = useTaskMenu({
    id: task._id,
    title: task.title,
    status: task.status,
    href,
    showOpenInNewTab: true,
    assignedTo: task.assignedTo,
    projectId: task.projectId,
    repoId: task.repoId,
    archived: task.archivedAt !== undefined,
  });
  if (task.locked === true) {
    return (
      <ListRow
        title="You do not have access to this repo"
        className={FLAT_ROW_CLASS}
        contentClassName={FLAT_ROW_CONTENT_CLASS}
      >
        <ProjectFlatRowBody
          icon={icon}
          title="Locked task"
          line={line}
          trailing={
            <IconLock
              size={14}
              className="mt-0.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          }
        />
      </ListRow>
    );
  }
  const row = (
    <ListRow
      link={<DynamicLink to={toInternalRepoHref(href)} search={true} />}
      onClick={(event) => {
        event.preventDefault();
        if (!hasDialogOpen) onSelectTask(task._id);
      }}
      aria-label={task.title}
      selected={open}
      accentClassName={open ? "bg-primary" : undefined}
      // The tint and stripe mark it; no ring.
      className={open ? "ring-0" : FLAT_ROW_CLASS}
      contentClassName={FLAT_ROW_CONTENT_CLASS}
    >
      <ProjectFlatRowBody
        icon={icon}
        title={task.title}
        line={line}
        trailing={<RowAge at={task.updatedAt} />}
      />
    </ListRow>
  );
  if (readOnly) return row;
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent onClick={(event) => event.stopPropagation()}>
          <TaskCardMenuItems variant="context" {...menuProps} />
        </ContextMenuContent>
      </ContextMenu>
      {dialogs}
    </>
  );
}
