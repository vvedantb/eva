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
import { TaskRepoBadges } from "./_components/TaskRepoBadges";
import { TaskDescription } from "./_components/TaskDescription";
import { TaskAttachments } from "./_components/TaskAttachments";
import { ActivityTimeline } from "./_components/ActivityTimeline";
import { TaskSubscribers } from "./_components/TaskSubscribers";
import { TaskReactionsProvider } from "./_components/TaskReactionsProvider";
import {
  StatusFieldsSection,
  TaskModelRow,
} from "./_components/StatusFieldsSection";
import { ProjectTaskFacts } from "./_components/ProjectTaskFacts";
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
 * A task's overview: title, prompt, attachments and activity with comments.
 * A quick task has its status and properties beside it; below `@2xl` one
 * column shows at a time (Overview / Properties). A project task is one
 * column: its read-only facts and its model sit under the prompt. An
 * archived task is read-only.
 */
export function TaskDetailsPane({
  taskId,
  task,
  detail,
  allTags,
  showHeader = true,
}: {
  taskId: Id<"agentTasks">;
  task: Doc<"agentTasks">;
  detail: TaskDetailsData;
  /** Tag suggestions (the quick task page's); none elsewhere. */
  allTags?: string[];
  /**
   * The number and editable title. Off in the project side panel, whose own
   * header already names the task; Expand opens the full page to rename it.
   */
  showHeader?: boolean;
}) {
  /** Which detail pane is on screen below `@2xl`; both show at `@2xl` and up. */
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

  /** Title, prompt and activity; a project task adds its facts and model. */
  const overview = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-4 px-4 pt-4 @2xl:px-6 @2xl:pr-6 @2xl:pt-5">
        <div>
          {showHeader ? (
            <TaskHeader
              taskNumber={task.taskNumber}
              title={task.title}
              canEditTaskText={canEditText}
              hasActiveRun={hasActiveRun}
              taskId={taskId}
            />
          ) : null}
          {/* A project task names its repos and PRs in its facts line. */}
          {isProjectTask ? null : <TaskRepoBadges task={task} />}
          {scheduledAt ? (
            <div className="mt-2 flex items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1 text-xs font-normal text-muted-foreground"
              >
                <IconClock size={11} />
                {status === "todo" ? "Scheduled for" : "Was scheduled for"}{" "}
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

        {isProjectTask ? (
          <>
            <ProjectTaskFacts task={task} />
            {/* `-mx-2` lines the field row's own inset up with the prompt. */}
            <div className="-mx-2">
              <TaskModelRow
                taskId={taskId}
                task={task}
                status={status}
                hasRuns={hasRuns}
                isOwner={isOwner}
                readOnly={isArchived}
                title="Model"
              />
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <div className="text-sm font-medium text-foreground">Activity</div>
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
  );

  // A project task's status, phase, repos and PRs are read-only facts: one
  // column, no Properties.
  if (isProjectTask) {
    return (
      <TaskReactionsProvider taskId={taskId}>
        <div className="@container flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar">
          {overview}
        </div>
      </TaskReactionsProvider>
    );
  }

  return (
    <TaskReactionsProvider taskId={taskId}>
      <div className="@container flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Below `@2xl` (the pane, not the window) the two columns stack,
            which buried Status / Priority / Labels / Project under the whole
            (unbounded) activity timeline — on a phone the only way to change
            a task's status was to scroll past every run and comment. One pane
            at a time instead, same model the split primitives use, following
            ProjectTabs' CSS-gated shape so desktop keeps rendering both
            columns with no JS involved.
            Local state, not a URL tab: on desktop both panes are on screen at
            once, so there is nothing here worth linking to. */}
        <div className="shrink-0 @2xl:hidden">
          <MobilePaneSwitcher
            labels={{ left: "Overview", right: "Properties" }}
            showingRight={showMobileProperties}
            onSelect={(pane) => setShowMobileProperties(pane === "right")}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar @2xl:overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col @2xl:grid @2xl:grid-cols-[14fr_6fr] @2xl:grid-rows-1 @2xl:overflow-hidden">
            {/* Only one column is hidden at a time below `@2xl`, and the scroller
                above stays the single scroll owner for whichever is showing. */}
            <div
              className={cn(
                "min-h-0 min-w-0 @2xl:flex @2xl:flex-1 @2xl:flex-col @2xl:overflow-hidden",
                showMobileProperties && "@max-2xl:hidden",
              )}
            >
              <div className="flex min-h-0 min-w-0 flex-col overflow-x-hidden @2xl:flex-1 @2xl:overflow-y-auto @2xl:scrollbar">
                {overview}
              </div>
            </div>
            {/* `mt-6` is gone: it separated this from the overview when the two
                stacked, and as its own pane it starts at the top instead. */}
            <div
              className={cn(
                "flex min-w-0 shrink-0 flex-col overflow-x-hidden px-4 pb-4 @max-2xl:pt-4 @2xl:overflow-hidden @2xl:px-0 @2xl:pb-0 @2xl:pl-8 @2xl:pr-6 @2xl:pt-5",
                !showMobileProperties && "@max-2xl:hidden",
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
