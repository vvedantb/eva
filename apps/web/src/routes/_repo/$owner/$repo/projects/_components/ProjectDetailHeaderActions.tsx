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
  CircleSpinner,
} from "@eva/ui";
import type { Id } from "@eva/backend";
import {
  IconHammer,
  IconPlayerStop,
  IconChevronDown,
  IconCalendarClock,
  IconDots,
  IconRefresh,
  IconFileText,
  IconMessage,
  IconServerBolt,
} from "@tabler/icons-react";
import dayjs from "@eva/shared/dates";
import { ProjectContextUsage } from "@/lib/components/context-usage";
import { CopyLinkMenuItem } from "@/lib/components/CopyLinkButton";
import { SandboxStartStopButton } from "@/lib/components/sandbox/SandboxStartStopButton";
import { ScheduleBuildPopover } from "@/lib/components/projects/ScheduleBuildPopover";
import { ConfirmSkipHint, requestConfirm, skipConfirmTitle } from "@/lib/confirm";
import {
  getProjectMenuFlags,
  type ProjectDetailProject,
  type ProjectSandboxState,
} from "./projectDetailHelpers";

type ProjectMenuFlags = ReturnType<typeof getProjectMenuFlags>;

interface ProjectDetailHeaderActionsProps {
  projectId: Id<"projects">;
  project: ProjectDetailProject;
  repoId: Id<"repos">;
  sandbox: ProjectSandboxState;
  chatTurnOpen: boolean | undefined;
  altHeld: boolean;
  prError: string | null;
  prLinks: { hasItems: boolean; items: ReactNode };
  hasPlanContext: boolean;
  isResolvingConflicts: boolean;
  isStoppingBuild: boolean;
  onResolveConflicts: () => Promise<void>;
  onStopBuild: () => Promise<void>;
  setShowResolveConfirm: (open: boolean) => void;
  setShowStartupCommandsConfirm: (open: boolean) => void;
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
  altHeld,
  prError,
  prLinks,
  hasPlanContext,
  isResolvingConflicts,
  isStoppingBuild,
  onResolveConflicts,
  onStopBuild,
  setShowResolveConfirm,
  setShowStartupCommandsConfirm,
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
  const flags = getProjectMenuFlags(project, sandbox);

  return (
    <div className="flex max-sm:min-w-0 flex-col items-end gap-1">
      {prError && <p className="text-xs text-destructive">{prError}</p>}
      <div className="flex max-sm:flex-wrap items-center max-sm:justify-end gap-1.5 sm:gap-2">
        <ProjectContextUsage repoId={repoId} projectId={projectId} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon-sm" aria-label="More">
              <IconDots size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <ProjectMoreMenuActionItems
              flags={flags}
              sandbox={sandbox}
              altHeld={altHeld}
              isResolvingConflicts={isResolvingConflicts}
              onResolveConflicts={onResolveConflicts}
              setShowResolveConfirm={setShowResolveConfirm}
              setShowStartupCommandsConfirm={setShowStartupCommandsConfirm}
            />
            {(flags.showResolveConflicts || flags.hasSandboxCommandItems) &&
            prLinks.hasItems ? (
              <DropdownMenuSeparator />
            ) : null}
            {prLinks.items}
            {hasPlanContext && (
              <>
                {(flags.showResolveConflicts ||
                  flags.hasSandboxCommandItems ||
                  prLinks.hasItems) && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={() => setShowPlanModal(true)}>
                  <IconFileText size={14} />
                  View Plan
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowChatModal(true)}>
                  <IconMessage size={14} />
                  View Interview History
                </DropdownMenuItem>
              </>
            )}
            {(flags.showResolveConflicts ||
              flags.hasSandboxCommandItems ||
              prLinks.hasItems ||
              hasPlanContext) && <DropdownMenuSeparator />}
            <CopyLinkMenuItem />
          </DropdownMenuContent>
        </DropdownMenu>
        {/* One control for both directions — see `SandboxStartStopButton`.
            Inert while a chat turn is in flight; a running build keeps its
            own confirmed "Stop Build", so it is not gated here. This is the
            only wake/sleep control now, the sandbox chat header carries
            usage alone. */}
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
                  altHeld,
                  () => setShowStopBuildConfirm(true),
                  () => {
                    void onStopBuild();
                  },
                )
              }
              disabled={isStoppingBuild}
            >
              {isStoppingBuild ? (
                <CircleSpinner size="sm" aria-hidden />
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
  altHeld,
  isResolvingConflicts,
  onResolveConflicts,
  setShowResolveConfirm,
  setShowStartupCommandsConfirm,
}: {
  flags: ProjectMenuFlags;
  sandbox: ProjectSandboxState;
  altHeld: boolean;
  isResolvingConflicts: boolean;
  onResolveConflicts: () => Promise<void>;
  setShowResolveConfirm: (open: boolean) => void;
  setShowStartupCommandsConfirm: (open: boolean) => void;
}) {
  const {
    showResolveConflicts,
    hasSandboxCommandItems,
    showRetryStartupCommands,
    showRunBackgroundCommands,
  } = flags;
  const {
    handleRetryStartupCommands,
    isRetryingStartupCommands,
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
              altHeld,
              () => setShowResolveConfirm(true),
              () => {
                void onResolveConflicts();
              },
            )
          }
          disabled={isResolvingConflicts}
        >
          {isResolvingConflicts ? (
            <CircleSpinner size="sm" className="size-3.5" />
          ) : (
            <IconHammer size={14} />
          )}
          Resolve Conflicts
          <ConfirmSkipHint />
        </DropdownMenuItem>
      )}
      {showResolveConflicts && hasSandboxCommandItems ? (
        <DropdownMenuSeparator />
      ) : null}
      {showRetryStartupCommands && (
        <DropdownMenuItem
          title={skipConfirmTitle("Run Startup Commands")}
          onClick={() =>
            requestConfirm(
              altHeld,
              () => setShowStartupCommandsConfirm(true),
              handleRetryStartupCommands,
            )
          }
          disabled={isRetryingStartupCommands}
        >
          {isRetryingStartupCommands ? (
            <CircleSpinner size="sm" className="size-3.5" />
          ) : (
            <IconRefresh size={14} />
          )}
          Run Startup Commands
          <ConfirmSkipHint />
        </DropdownMenuItem>
      )}
      {showRunBackgroundCommands && (
        <DropdownMenuItem
          onClick={handleRunBackgroundCommands}
          disabled={isRunningBackgroundCommands}
        >
          {isRunningBackgroundCommands ? (
            <CircleSpinner size="sm" className="size-3.5" />
          ) : (
            <IconServerBolt size={14} />
          )}
          Run Background Commands
        </DropdownMenuItem>
      )}
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
