import { PROJECTS_PATH, projectHref } from "@eva/shared";
import { CHAT_HEADER_ACTIONS_CLASS } from "@/lib/components/ChatPageWrapper";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@vvedantb/ui";
import type { Id } from "@eva/backend";
import { IconDots, IconFileText, IconMessage } from "@tabler/icons-react";
import { ProjectContextUsage } from "@/lib/components/context-usage";
import { SandboxStartStopButton } from "@/lib/components/sandbox/SandboxStartStopButton";
import { PrMergeConfetti } from "@/lib/components/celebration/PrMergeConfetti";
import { useNavigate } from "@tanstack/react-router";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { ProjectCardMenuItems } from "@/lib/components/projects/_components/ProjectCardMenuItems";
import { useProjectMenu } from "@/lib/components/projects/_components/useProjectMenu";
import { useRecapChat } from "@/lib/components/chat/useRecapChat";
import { RecapChatMenuItem } from "@/lib/components/chat/RecapChatMenuItem";
import { ProjectDeleteDialog } from "./ProjectDeleteDialog";
import { useProjectDelete } from "./useProjectDelete";
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
  hasPlanContext: boolean;
  setShowPlanModal: (open: boolean) => void;
  setShowChatModal: (open: boolean) => void;
}

export function ProjectDetailHeaderActions({
  projectId,
  project,
  repoId,
  sandbox,
  chatId,
  chatTurnOpen,
  hasPlanContext,
  setShowPlanModal,
  setShowChatModal,
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
  const segment = entityPathSegment(project);
  // Deleted: this page has nothing left to show.
  const projectDelete = useProjectDelete(() => {
    void navigate({ to: PROJECTS_PATH });
  }, repoId);
  const projectMenu = useProjectMenu({
    projectId,
    title: project.title,
    description: project.description,
    projectLead: project.projectLead,
    href: segment ? projectHref(basePath, segment) : undefined,
    branchName: project.branchName,
    onDelete: () => projectDelete.requestSingle(projectId, project.title),
  });

  return (
    <div className="flex max-sm:min-w-0 flex-col items-end gap-1">
      <div className="flex max-sm:flex-wrap items-center max-sm:justify-end gap-1.5 sm:gap-2">
        <PrMergeConfetti owner={{ kind: "project", projectId }} />
        {/* The controls share the chat header track. Tasks start through
            Approve and the project scheduler, so there is no build button. */}
        <div className={CHAT_HEADER_ACTIONS_CLASS}>
          <ProjectContextUsage repoId={repoId} projectId={projectId} />
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
                planItems={
                  hasPlanContext ? (
                    <>
                      <DropdownMenuItem onSelect={() => setShowPlanModal(true)}>
                        <IconFileText size={14} />
                        View Plan
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setShowChatModal(true)}>
                        <IconMessage size={14} />
                        View Interview History
                      </DropdownMenuItem>
                    </>
                  ) : undefined
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Siblings of the menu: Radix unmounts menu content on close. */}
          {projectMenu.dialogs}
          <ProjectDeleteDialog
            target={projectDelete.target}
            onClose={projectDelete.close}
            onConfirm={projectDelete.confirm}
            isDeleting={projectDelete.isDeleting}
          />
          {/* One control for both directions — see `SandboxStartStopButton`.
            Inert while a chat turn is in flight. This is the
            only wake/sleep control now, the sandbox chat header carries
            usage alone. The coordinator is read-only: no Commit & push. */}
          <SandboxStartStopButton
            isActive={isSandboxActive}
            isToggling={isSandboxStarting || isSandboxStopping}
            onToggle={(action) => {
              if (action === "start") void handleStartSandbox();
              else void handleStopSandbox();
            }}
            isAssistantResponding={chatTurnOpen === true}
          />
        </div>
      </div>
    </div>
  );
}
