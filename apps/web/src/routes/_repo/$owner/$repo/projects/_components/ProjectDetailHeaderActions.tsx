import { useRef, type ReactNode } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Spinner,
  ConfirmSkipHint,
  skipConfirmTitle,
  useRequestConfirm,
} from "@vvedantb/ui";
import type { Id } from "@eva/backend";
import {
  IconHammer,
  IconPlayerStop,
  IconChevronDown,
  IconCalendarClock,
  IconDots,
  IconFileText,
  IconMessage,
} from "@tabler/icons-react";
import dayjs from "@eva/shared/dates";
import { ProjectContextUsage } from "@/lib/components/context-usage";
import {
  BusyMenuIcon,
  SandboxCommandMenuItems,
} from "@/lib/components/sandbox/SandboxCommandMenuItems";
import { SandboxCommitPushButton } from "@/lib/components/sandbox/SandboxCommitPushButton";
import { SandboxStartStopButton } from "@/lib/components/sandbox/SandboxStartStopButton";
import { ScheduleBuildPopover } from "@/lib/components/projects/ScheduleBuildPopover";
import { PrMergeConfetti } from "@/lib/components/celebration/PrMergeConfetti";
import { useNavigate } from "@tanstack/react-router";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { ProjectCardMenuItems } from "@/lib/components/projects/_components/ProjectCardMenuItems";
import { useProjectMenu } from "@/lib/components/projects/_components/useProjectMenu";
import { ProjectDeleteDialog } from "./ProjectDeleteDialog";
import { useProjectDelete } from "./useProjectDelete";
import {
  getProjectMenuFlags,
  type ProjectDetailProject,
  type ProjectSandboxState,
} from "./projectDetailHelpers";

type ProjectMenuFlags = ReturnType<typeof getProjectMenuFlags>;
/** `useRequestConfirm().request`: opens the dialog, or runs directly with Alt held. */
type RequestConfirm = (openDialog: () => void, run: () => void) => void;

interface ProjectDetailHeaderActionsProps {
  projectId: Id<"projects">;
  project: ProjectDetailProject;
  repoId: Id<"githubRepos">;
  sandbox: ProjectSandboxState;
  chatTurnOpen: boolean | undefined;
  prError: string | null;
  prLinks: { hasItems: boolean; items: ReactNode };
  hasPlanContext: boolean;
  isResolvingConflicts: boolean;
  isStoppingBuild: boolean;
  onResolveConflicts: () => Promise<void>;
  onStopBuild: () => Promise<void>;
  setShowResolveConfirm: (open: boolean) => void;
  setShowStopBuildConfirm: (open: boolean) => void;
  setShowPlanModal: (open: boolean) => void;
  setShowChatModal: (open: boolean) => void;
  setIsBuildModalOpen: (open: boolean) => void;
}

export function ProjectDetailHeaderActions({
  projectId,
  project,
  repoId,
  sandbox,
  chatTurnOpen,
  prError,
  prLinks,
  hasPlanContext,
  isResolvingConflicts,
  isStoppingBuild,
  onResolveConflicts,
  onStopBuild,
  setShowResolveConfirm,
  setShowStopBuildConfirm,
  setShowPlanModal,
  setShowChatModal,
  setIsBuildModalOpen,
}: ProjectDetailHeaderActionsProps) {
  const {
    canStartSandbox,
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    handleStartSandbox,
    handleStopSandbox,
  } = sandbox;
  const { request: requestConfirm } = useRequestConfirm();
  const flags = getProjectMenuFlags(project, sandbox);
  const hasCommands = flags.showResolveConflicts || flags.hasSandboxCommandItems;
  const { basePath } = useRepo();
  const navigate = useNavigate();
  const projectsPath = `${basePath}/projects`;
  const segment = entityPathSegment(project);
  // Deleted: this page has nothing left to show.
  const projectDelete = useProjectDelete(repoId, () => {
    void navigate({ to: toInternalRepoHref(projectsPath) });
  });
  const projectMenu = useProjectMenu({
    projectId,
    title: project.title,
    description: project.description,
    phase: project.phase,
    projectLead: project.projectLead,
    href: segment ? `${projectsPath}/${segment}` : undefined,
    branchName: project.branchName,
    onDelete: () => projectDelete.requestSingle(projectId, project.title),
  });

  return (
    <div className="flex max-sm:min-w-0 flex-col items-end gap-1">
      {prError && <p className="text-xs text-destructive">{prError}</p>}
      <div className="flex max-sm:flex-wrap items-center max-sm:justify-end gap-1.5 sm:gap-2">
        <PrMergeConfetti owner={{ kind: "project", projectId }} />
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
                hasCommands || prLinks.hasItems ? (
                  <>
                    <ProjectMoreMenuActionItems
                      flags={flags}
                      sandbox={sandbox}
                      requestConfirm={requestConfirm}
                      isResolvingConflicts={isResolvingConflicts}
                      onResolveConflicts={onResolveConflicts}
                      setShowResolveConfirm={setShowResolveConfirm}
                    />
                    {hasCommands && prLinks.hasItems ? (
                      <DropdownMenuSeparator />
                    ) : null}
                    {prLinks.items}
                  </>
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
            Inert while a chat turn is in flight; a running build keeps its
            own confirmed "Stop Build", so it is not gated here. This is the
            only wake/sleep control now, the sandbox chat header carries
            usage alone. */}
        <SandboxCommitPushButton
          gitSync={project.sandboxGitSync}
          isSandboxActive={isSandboxActive}
          target={{ kind: "project", projectId }}
        />
        {isSandboxActive || canStartSandbox ? (
          <SandboxStartStopButton
            isActive={isSandboxActive}
            isToggling={isSandboxStarting || isSandboxStopping}
            onToggle={(action) => {
              if (action === "start") void handleStartSandbox();
              else void handleStopSandbox();
            }}
            isAssistantResponding={chatTurnOpen === true}
          />
        ) : null}
        {flags.canBuildProject ? (
          project.activeBuildWorkflowId ? (
            <Button
              size="sm"
              variant="destructive"
              aria-label="Stop build"
              title={skipConfirmTitle("Stop Build")}
              onClick={() =>
                requestConfirm(
                  () => setShowStopBuildConfirm(true),
                  () => {
                    void onStopBuild();
                  },
                )
              }
              disabled={isStoppingBuild}
            >
              {isStoppingBuild ? (
                <Spinner variant="circle" size="sm" aria-hidden />
              ) : (
                <IconPlayerStop size={16} aria-hidden />
              )}
              <span className="hidden sm:inline">Stop Build</span>
              <ConfirmSkipHint />
            </Button>
          ) : (
            <SplitBuildButton
              projectId={projectId}
              scheduledBuildAt={project.scheduledBuildAt}
              hasActiveBuild={!!project.activeBuildWorkflowId}
              onBuild={() => setIsBuildModalOpen(true)}
            />
          )
        ) : null}
      </div>
    </div>
  );
}

function ProjectMoreMenuActionItems({
  flags,
  sandbox,
  requestConfirm,
  isResolvingConflicts,
  onResolveConflicts,
  setShowResolveConfirm,
}: {
  flags: ProjectMenuFlags;
  sandbox: ProjectSandboxState;
  requestConfirm: RequestConfirm;
  isResolvingConflicts: boolean;
  onResolveConflicts: () => Promise<void>;
  setShowResolveConfirm: (open: boolean) => void;
}) {
  const {
    showResolveConflicts,
    hasSandboxCommandItems,
    showRunBackgroundCommands,
  } = flags;
  const {
    handleRunBackgroundCommands,
    isRunningBackgroundCommands,
  } = sandbox;

  return (
    <>
      {showResolveConflicts && (
        <DropdownMenuItem
          title={skipConfirmTitle("Resolve Conflicts")}
          onClick={() =>
            requestConfirm(
              () => setShowResolveConfirm(true),
              () => {
                void onResolveConflicts();
              },
            )
          }
          disabled={isResolvingConflicts}
        >
          <BusyMenuIcon busy={isResolvingConflicts}>
            <IconHammer size={14} />
          </BusyMenuIcon>
          Resolve Conflicts
          <ConfirmSkipHint />
        </DropdownMenuItem>
      )}
      {showResolveConflicts && hasSandboxCommandItems ? (
        <DropdownMenuSeparator />
      ) : null}
      <SandboxCommandMenuItems
        backgroundCommands={{
          show: showRunBackgroundCommands,
          busy: isRunningBackgroundCommands,
          onRun: handleRunBackgroundCommands,
        }}
      />
    </>
  );
}

// `max-sm:h-10`: the two halves abut, so the `hit-target` bleed each `size="sm"`
// carries would be spent on the other half rather than on the tap target.
const SPLIT_BUTTON_HALF =
  "hover:translate-y-0 active:scale-100 group-hover/split:bg-primary/92 max-sm:h-10";

function SplitBuildButton({
  projectId,
  scheduledBuildAt,
  hasActiveBuild,
  onBuild,
}: {
  projectId: Id<"projects">;
  scheduledBuildAt: number | undefined;
  hasActiveBuild: boolean;
  onBuild: () => void;
}) {
  const chevronRef = useRef<HTMLButtonElement>(null);
  const isScheduled = scheduledBuildAt !== undefined;
  // Hidden below `sm`, so it doubles as the button's accessible name there.
  const buildLabel = isScheduled
    ? dayjs(scheduledBuildAt).format("MMM D, h:mm A")
    : "Run Eva";

  // Halves cancel their own press so the wrapper scales as one unit — see the
  // twin in `TaskFooter`. `motion-press` replaces a hand-listed
  // `transition-[transform,background-color]` that named `transform` and so
  // never matched the `scale` property `scale-[0.96]` compiles to.
  return (
    <div className="group/split motion-press flex items-center active:scale-[0.96]">
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Button
              shape="rounded"
              size="sm"
              aria-label={buildLabel}
              onClick={
                isScheduled ? () => chevronRef.current?.click() : onBuild
              }
              className={`rounded-r-none ${SPLIT_BUTTON_HALF}`}
            >
              {isScheduled ? (
                <IconCalendarClock size={16} aria-hidden />
              ) : (
                <IconHammer size={16} aria-hidden />
              )}
              <span className="hidden sm:inline">{buildLabel}</span>
            </Button>
          </div>
        </TooltipTrigger>
        {isScheduled ? (
          <TooltipContent>Click to change or remove schedule</TooltipContent>
        ) : null}
      </Tooltip>
      <ScheduleBuildPopover
        projectId={projectId}
        scheduledBuildAt={scheduledBuildAt}
        disabled={hasActiveBuild}
        trigger={
          <Button
            shape="rounded"
            ref={chevronRef}
            size="sm"
            aria-label="Schedule build"
            disabled={hasActiveBuild}
            className={`rounded-l-none border-l border-l-primary-foreground/20 px-2 max-sm:px-3 ${SPLIT_BUTTON_HALF}`}
          >
            <IconChevronDown size={14} aria-hidden />
          </Button>
        }
      />
    </div>
  );
}
