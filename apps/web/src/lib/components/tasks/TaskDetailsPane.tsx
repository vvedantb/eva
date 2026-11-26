"use client";

import { useState } from "react";
import {
  IconClock,
  IconInfoCircle,
  IconInfoCircleFilled,
} from "@tabler/icons-react";
import { taskScheduledAt, type Doc, type Id } from "@eva/backend";
import { cn } from "@eva/ui";
import { Badge } from "@vvedantb/ui";
import dayjs from "@eva/shared/dates";
import { MobilePaneSwitcher } from "@/lib/components/MobilePaneSwitcher";
import type { SandboxTabDescriptor } from "@/routes/_repo/$owner/$repo/sessions/_components/SandboxTabTrigger";
import { TaskHeader } from "./_components/TaskHeader";
import { TaskDescription } from "./_components/TaskDescription";
import { TaskAttachments } from "./_components/TaskAttachments";
import { ActivityTimeline } from "./_components/ActivityTimeline";
import { TaskSubscribers } from "./_components/TaskSubscribers";
import { TaskReactionsProvider } from "./_components/TaskReactionsProvider";
import { StatusFieldsSection } from "./_components/StatusFieldsSection";
import type { useTaskDetail } from "./useTaskDetail";

/**
 * A project task's Details tab, on its full page rail and in the project
 * panel: the same id on both, so the panel's `ProjectTaskTab` is this value.
 */
export const TASK_DETAILS_TAB = {
  value: "task-details",
  label: "Details",
  icon: {
    kind: "component",
    Icon: IconInfoCircle,
    ActiveIcon: IconInfoCircleFilled,
  },
} as const satisfies SandboxTabDescriptor;

export type TaskDetailsTab = (typeof TASK_DETAILS_TAB)["value"];

/** What the pane reads from `useTaskDetail`; the caller owns the queries. */
type TaskDetailsData = Pick<
  ReturnType<typeof useTaskDetail>,
  | "status"
  | "comments"
  | "taskActivity"
  | "users"
  | "creatorUser"
  | "projects"
  | "isOwner"
  | "hasActiveRun"
  | "isProjectTask"
  | "isArchived"
  | "hasRuns"
  | "canEditTaskText"
  | "baseBranch"
  | "latestDeployment"
>;

/**
 * A task's overview: title, prompt, attachments and activity with comments,
 * beside its status and properties. An archived task is read-only. Below `md`
 * one column shows at a time (Overview / Properties).
 */
export function TaskDetailsPane({
  taskId,
  task,
  detail,
  allTags,
}: {
  taskId: Id<"agentTasks">;
  task: Doc<"agentTasks">;
  detail: TaskDetailsData;
  /** Tag suggestions (the quick task page's); none elsewhere. */
  allTags?: string[];
}) {
  /** Which detail pane is on screen below `md`; both show at `md` and up. */
  const [showMobileProperties, setShowMobileProperties] = useState(false);
  const {
    status,
    comments,
    taskActivity,
    users,
    creatorUser,
    projects,
    isOwner,
    hasActiveRun,
    isProjectTask,
    isArchived,
    hasRuns,
    canEditTaskText: canEditText,
    baseBranch,
    latestDeployment,
  } = detail;
  const scheduledAt = taskScheduledAt(task);

  return (
    <TaskReactionsProvider taskId={taskId}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Below `md` the two columns stack, which buried Status / Priority /
            Labels / Project under the whole (unbounded) activity timeline — on a
            phone the only way to change a task's status was to scroll past every
            run and comment. One pane at a time instead, same model the split
            primitives use, following ProjectTabs' CSS-gated shape so desktop
            keeps rendering both columns with no JS involved.
            Local state, not a URL tab: on desktop both panes are on screen at
            once, so there is nothing here worth linking to. */}
        <div className="shrink-0 md:hidden">
          <MobilePaneSwitcher
            labels={{ left: "Overview", right: "Properties" }}
            showingRight={showMobileProperties}
            onSelect={(pane) => setShowMobileProperties(pane === "right")}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar md:overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[14fr_6fr] md:grid-rows-1 md:overflow-hidden">
            {/* Only one column is hidden at a time below `md`, and the scroller
                above stays the single scroll owner for whichever is showing. */}
            <div
              className={cn(
                "min-h-0 min-w-0 md:flex md:flex-1 md:flex-col md:overflow-hidden",
                showMobileProperties && "max-md:hidden",
              )}
            >
              <div className="flex min-h-0 min-w-0 flex-col overflow-x-hidden md:flex-1 md:overflow-y-auto md:scrollbar">
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="shrink-0 space-y-4 px-4 pt-4 md:px-6 md:pr-6 md:pt-5">
                    <div>
                      <TaskHeader
                        taskNumber={task.taskNumber}
                        title={task.title}
                        canEditTaskText={canEditText}
                        hasActiveRun={hasActiveRun}
                        taskId={taskId}
                      />
                      {scheduledAt ? (
                        <div className="mt-2 flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="gap-1 text-xs font-normal text-muted-foreground"
                          >
                            <IconClock size={11} />
                            {status === "todo"
                              ? "Scheduled for"
                              : "Was scheduled for"}{" "}
                            {dayjs(scheduledAt).format("DD/MM/YYYY HH:mm")}
                          </Badge>
                        </div>
                      ) : null}
                    </div>
                    <TaskDescription
                      description={task.description}
                      canEditTaskText={canEditText}
                      hasActiveRun={hasActiveRun}
                      taskId={taskId}
                      inline={true}
                    />

                    <TaskAttachments taskId={taskId} readOnly={isArchived} />

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                      <div className="text-sm font-medium text-foreground">
                        Activity
                      </div>
                      <TaskSubscribers taskId={taskId} users={users} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col sm:mt-4">
                    <ActivityTimeline
                      taskId={taskId}
                      createdAt={task.createdAt}
                      creatorUser={creatorUser}
                      comments={comments}
                      taskActivity={taskActivity}
                      users={users}
                      isProjectTask={isProjectTask}
                      readOnly={isArchived}
                    />
                  </div>
                </div>
              </div>
            </div>
            {/* `mt-6` is gone: it separated this from the overview when the two
                stacked, and as its own pane it starts at the top instead. */}
            <div
              className={cn(
                "flex min-w-0 shrink-0 flex-col overflow-x-hidden px-4 pb-4 max-md:pt-4 md:overflow-hidden md:px-0 md:pb-0 md:pl-8 md:pr-6 md:pt-5",
                !showMobileProperties && "max-md:hidden",
              )}
            >
              <StatusFieldsSection
                taskId={taskId}
                task={task}
                status={status}
                users={users}
                projects={projects}
                baseBranch={baseBranch}
                latestDeployment={latestDeployment}
                hasRuns={hasRuns}
                isOwner={isOwner}
                allTags={allTags ?? []}
                readOnly={isArchived}
              />
            </div>
          </div>
        </div>
      </div>
    </TaskReactionsProvider>
  );
}
