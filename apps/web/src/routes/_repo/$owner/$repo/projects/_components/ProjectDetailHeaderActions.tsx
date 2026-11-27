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
import { ProjectArchiveDialog } from "./ProjectArchiveDialog";
import { useProjectArchive } from "./useProjectArchive";
import type {
  ProjectDetailProject,
  ProjectSandboxState,
} from "./projectDetailHelpers";

interface ProjectDetailHeaderActionsProps {
  projectId: Id<"projects">;
  project: ProjectDetailProject;
  repoId: Id<"githubRepos">;
  sandbox: ProjectSandboxState;
  /** The project's main chat, once it exists: Recap chat recaps it. */
  chatId: Id<"sessionChats"> | undefined;
  chatTurnOpen: boolean | undefined;
}

export function ProjectDetailHeaderActions({
  projectId,
  project,
  repoId,
  sandbox,
  chatId,
  chatTurnOpen,
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
  // Archived: back to the list, as a session archive does.
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
        {/* The controls share the chat header track. Tasks start through
            Eva and the project scheduler, so there is no build button. */}
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
          {/* Siblings of the menu: Radix unmounts menu content on close. */}
          {projectMenu.dialogs}
          <ProjectArchiveDialog
            target={projectArchive.target}
            onClose={projectArchive.close}
            onConfirm={projectArchive.confirm}
            isArchiving={projectArchive.isArchiving}
          />
          {/* One control for both directions — see `SandboxStartStopButton`.
            Inert while a chat turn is in flight. This is the
            only wake/sleep control. The coordinator is read-only: no
            Commit & push. */}
          {isArchived ? null : (
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
