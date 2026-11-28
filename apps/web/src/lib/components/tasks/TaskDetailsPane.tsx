"use client";

import { useState } from "react";
import { IconClock } from "@tabler/icons-react";
import { taskScheduledAt, type Doc, type Id } from "@eva/backend";
import { cn } from "@eva/ui";
import { Badge } from "@vvedantb/ui";
import dayjs from "@eva/shared/dates";
import { MobilePaneSwitcher } from "@/lib/components/MobilePaneSwitcher";
import { TaskHeader } from "./_components/TaskHeader";
import { TaskRepoBadges } from "./_components/TaskRepoBadges";
import { TaskDescription } from "./_components/TaskDescription";
import { TaskAttachments } from "./_components/TaskAttachments";
import { ActivityTimeline } from "./_components/ActivityTimeline";
import { TaskSubscribers } from "./_components/TaskSubscribers";
import { TaskReactionsProvider } from "./_components/TaskReactionsProvider";
import { StatusFieldsSection } from "./_components/StatusFieldsSection";
import type { useTaskDetail } from "./useTaskDetail";

type TaskDetailsData = Pick<
  ReturnType<typeof useTaskDetail>,
  | "status"
  | "comments"
  | "taskActivity"
  | "users"
  | "creatorUser"
  | "projects"
  | "hasActiveRun"
  | "isArchived"
  | "canEditTaskText"
  | "baseBranch"
  | "deploymentStatus"
>;

/**
 * A quick task's overview: title, prompt, attachments and activity with
 * comments, and its status and properties beside it; below `@2xl` one column
 * shows at a time (Overview / Properties). An archived task is read-only. A
 * project task has none of this: it is its chat.
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
  allTags?: string[];
}) {
  const [showMobileProperties, setShowMobileProperties] = useState(false);
  const {
    status,
    comments,
    taskActivity,
    users,
    creatorUser,
    projects,
    hasActiveRun,
    isArchived,
    canEditTaskText: canEditText,
    baseBranch,
    deploymentStatus,
  } = detail;
  const scheduledAt = taskScheduledAt(task);

  const overview = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-4 px-4 pt-4 @2xl:px-6 @2xl:pr-6 @2xl:pt-5">
        <div>
          <TaskHeader
            taskNumber={task.taskNumber}
            title={task.title}
            canEditTaskText={canEditText}
            hasActiveRun={hasActiveRun}
            taskId={taskId}
          />
          <TaskRepoBadges task={task} />
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
          readOnly={isArchived}
        />
      </div>
    </div>
  );

  return (
    <TaskReactionsProvider taskId={taskId}>
      <div className="@container flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 @2xl:hidden">
          <MobilePaneSwitcher
            labels={{ left: "Overview", right: "Properties" }}
            showingRight={showMobileProperties}
            onSelect={(pane) => setShowMobileProperties(pane === "right")}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden scrollbar @2xl:overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col @2xl:grid @2xl:grid-cols-[14fr_6fr] @2xl:grid-rows-1 @2xl:overflow-hidden">
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
                deploymentStatus={deploymentStatus}
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
