import { CHAT_HEADER_ACTIONS_CLASS } from "@/lib/components/ChatPageWrapper";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@vvedantb/ui";
import type { Id } from "@eva/backend";
import { IconDots } from "@tabler/icons-react";
import { ProjectContextUsage } from "@/lib/components/context-usage";
import { ProjectChatUsageLimits } from "@/lib/components/projects/ProjectSandboxChatPanel";
import { SandboxStartStopButton } from "@/lib/components/sandbox/SandboxStartStopButton";
import { PrMergeConfetti } from "@/lib/components/celebration/PrMergeConfetti";
import { useNavigate } from "@tanstack/react-router";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { ProjectCardMenuItems } from "@/lib/components/projects/_components/ProjectCardMenuItems";
import { useProjectMenu } from "@/lib/components/projects/_components/useProjectMenu";
import { useRecapChat } from "@/lib/components/chat/useRecapChat";
import { RecapChatMenuItem } from "@/lib/components/chat/RecapChatMenuItem";
import { ArchivedLabel } from "@/lib/components/ArchivedLabel";
import { useChatTurnOpen } from "@/lib/components/chat/useChatTurnOpen";
import { useTaskDetail } from "@/lib/components/tasks/useTaskDetail";
import { PROJECT_TASK_ROUTING } from "@/lib/components/tasks/useTaskDetailControls";
import { ProjectArchiveDialog } from "./ProjectArchiveDialog";
import { useProjectArchive } from "./useProjectArchive";
import type {
  ProjectDetailProject,
  ProjectSandboxState,
} from "./projectDetailHelpers";

/** The chat the coordinator view shows: Eva's, an open task tab's, or a task tab still loading. */
export type ProjectShownChat =
  | { kind: "eva" }
  | { kind: "task"; taskId: Id<"agentTasks"> }
  | { kind: "loading" };

interface ProjectDetailHeaderActionsProps {
  projectId: Id<"projects">;
  project: ProjectDetailProject;
  repoId: Id<"githubRepos">;
  sandbox: ProjectSandboxState;
  chatId: Id<"sessionChats"> | undefined;
  chatTurnOpen: boolean | undefined;
  shownChat: ProjectShownChat;
}

export function ProjectDetailHeaderActions({
  projectId,
  project,
  repoId,
  sandbox,
  chatId,
  chatTurnOpen,
  shownChat,
}: ProjectDetailHeaderActionsProps) {
  const {
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    handleStartSandbox,
    handleStopSandbox,
  } = sandbox;
  const recapChat = useRecapChat(chatId);
  const { basePath } = useRepo();
  const navigate = useNavigate();
  const projectsPath = `${basePath}/projects`;
  const segment = entityPathSegment(project);
  const isArchived = project.archivedAt !== undefined;
  const projectArchive = useProjectArchive(repoId, () => {
    void navigate({ to: toInternalRepoHref(projectsPath) });
  });
  const projectMenu = useProjectMenu({
    projectId,
    title: project.title,
    description: project.description,
    projectLead: project.projectLead,
    href: segment ? `${projectsPath}/${segment}` : undefined,
    branchName: project.branchName,
    archived: isArchived,
    onArchive: () => projectArchive.requestSingle(projectId, project.title),
  });

  return (
    <div className="flex max-sm:min-w-0 flex-col items-end gap-1">
      <div className="flex max-sm:flex-wrap items-center max-sm:justify-end gap-1.5 sm:gap-2">
        {isArchived ? <ArchivedLabel /> : null}
        <PrMergeConfetti owner={{ kind: "project", projectId }} />
        <div className={CHAT_HEADER_ACTIONS_CLASS}>
          <ProjectContextUsage repoId={repoId} projectId={projectId} />
          <ProjectChatUsageLimits
            projectId={projectId}
            projectSession={sandbox.projectSession}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon-sm" aria-label="More">
                <IconDots size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <ProjectCardMenuItems
                variant="dropdown"
                {...projectMenu.menuProps}
                leading={
                  recapChat ? (
                    <RecapChatMenuItem onSelect={recapChat} />
                  ) : undefined
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
          {projectMenu.dialogs}
          <ProjectArchiveDialog
            target={projectArchive.target}
            onClose={projectArchive.close}
            onConfirm={projectArchive.confirm}
            isArchiving={projectArchive.isArchiving}
          />
          {isArchived || shownChat.kind === "loading" ? null : shownChat.kind === "task" ? (
            <ProjectTaskSandboxButton
              key={shownChat.taskId}
              taskId={shownChat.taskId}
            />
          ) : (
            <SandboxStartStopButton
              isActive={isSandboxActive}
              isToggling={isSandboxStarting || isSandboxStopping}
              onToggle={(action) => {
                if (action === "start") void handleStartSandbox();
                else void handleStopSandbox();
              }}
              isAssistantResponding={chatTurnOpen === true}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectTaskSandboxButton({ taskId }: { taskId: Id<"agentTasks"> }) {
  const {
    isLoading,
    canStartSandbox,
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    taskSession,
    handleStartSandbox,
    handleStopSandbox,
  } = useTaskDetail(taskId, PROJECT_TASK_ROUTING);
  const turnOpen = useChatTurnOpen(taskSession.owned?.chatId);
  if (isLoading || !(canStartSandbox || isSandboxActive)) return null;
  return (
    <SandboxStartStopButton
      isActive={isSandboxActive}
      isToggling={isSandboxStarting || isSandboxStopping}
      onToggle={(action) => {
        if (action === "start") void handleStartSandbox();
        else void handleStopSandbox();
      }}
      isAssistantResponding={turnOpen === true}
    />
  );
}
