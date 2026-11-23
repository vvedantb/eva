import type { ReactNode } from "react";
import { isProjectBuilding, type Id, type SandboxOwner } from "@eva/backend";
import { ProjectSandboxPanel } from "@/lib/components/projects/ProjectSandboxPanel";
import { ProjectSandboxChatPanel } from "@/lib/components/projects/ProjectSandboxChatPanel";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { SandboxSurfaceProviders } from "@/lib/components/sandbox/SandboxSurfaceProviders";
import { SandboxEmptyRailFrame } from "@/lib/components/sandbox/SandboxPanelFrame";
import { ProjectTasksPanel } from "@/lib/components/projects/ProjectTasksPanel";
import type { ProjectSandboxTab } from "@/lib/components/projects/projectSandboxTabs";
import {
  SandboxWorkspace,
  type TerminalPanelApi,
} from "@/lib/components/sandbox/SandboxWorkspace";
import type { SandboxPanesApi } from "@/lib/components/sandbox/useSandboxPanes";
import type {
  ProjectDetailProject,
  ProjectSandboxState,
} from "./projectDetailHelpers";

interface SandboxPanelContext {
  rightPanelCollapsed: boolean;
  onToggleRightPanel: () => void;
}

interface ProjectDetailSandboxContentProps {
  projectId: Id<"projects">;
  projectNumId?: number;
  project: ProjectDetailProject;
  repoId: Id<"githubRepos">;
  basePath: string;
  sandboxTab: ProjectSandboxTab;
  sandbox: ProjectSandboxState;
  chatTurnOpen: boolean | undefined;
  sandboxRailWidthPx: number;
  expandRightSignal: number;
  openFile: (path: string) => void;
  openDiffs: (repoRelativePath?: string) => void;
  openAgentsTab: () => void;
}

export function ProjectDetailSandboxContent({
  projectId,
  projectNumId,
  project,
  repoId,
  basePath,
  sandboxTab,
  sandbox,
  chatTurnOpen,
  sandboxRailWidthPx,
  expandRightSignal,
  openFile,
  openDiffs,
  openAgentsTab,
}: ProjectDetailSandboxContentProps) {
  // A viewer reads the coordinator chat but never writes to it or wakes it.
  // A contributor can always wake it: a project has no closed state.
  const isViewer = project.callerRole === "viewer";
  const canStartSandbox = !isViewer;
  const {
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    sandboxStartupActivity,
    sandboxId: projectSandboxId,
    handleStartSandbox,
    handleStopSandbox,
  } = sandbox;

  // Always mount the sandbox panel so tabs stay reachable while stopped —
  // same as sessions. Panes self-gate.
  const projectSandboxPanel = (
    panes: SandboxPanesApi,
    owner: SandboxOwner,
    terminalPanel: TerminalPanelApi,
    collapsed: boolean,
    onToggle: () => void,
  ) => (
    <ProjectSandboxPanel
      projectId={projectId}
      projectSession={sandbox.projectSession}
      projectNumId={projectNumId}
      title={project.title}
      sandboxId={projectSandboxId}
      isActive={isSandboxActive}
      repoId={repoId}
      prUrl={project.prUrl}
      devPort={sandbox.sandbox.devPort}
      devCommand={sandbox.sandbox.devCommand}
      owner={owner}
      panes={panes}
      terminalPanel={terminalPanel}
      sandboxTab={sandboxTab}
      canContribute={!isViewer}
      onStartSandbox={
        canStartSandbox && !isSandboxStopping ? handleStartSandbox : undefined
      }
      isSandboxStarting={isSandboxStarting}
      autoWakeEligible={
        sandbox.sandbox.status === "closed" &&
        projectSandboxId !== undefined &&
        canStartSandbox &&
        !isProjectBuilding(project) &&
        // Still loading counts as busy: never wake under a live turn.
        chatTurnOpen === false
      }
      collapsed={collapsed}
      onToggle={onToggle}
    />
  );

  const layout = (rightPanel: (ctx: SandboxPanelContext) => ReactNode) => (
    <ResizablePanelLayout
      // Remount per project: the open flag is read once at mount.
      key={projectId}
      storageKey="project-sandbox-panel"
      collapsedStorageKey={`project-sandbox-panel:${projectId}`}
      leftDefaultSize="40%"
      leftMinWidthPx={350}
      rightMinWidthPx={300}
      rightCollapsedSizePx={sandboxRailWidthPx}
      seamlessSeparator
      defaultRightCollapsed={false}
      expandRightSignal={expandRightSignal}
      mobilePaneLabels={{ left: "Chat", right: "Sandbox" }}
      leftPanel={() => (
        <ProjectSandboxChatPanel
          projectId={projectId}
          projectSession={sandbox.projectSession}
          isSandboxActive={isSandboxActive}
          isSandboxToggling={isSandboxStarting || isSandboxStopping}
          sandboxStartupActivity={sandboxStartupActivity}
          onOpenFile={openFile}
          onViewDiff={openDiffs}
          onOpenAgentsTab={openAgentsTab}
          isReadOnly={isViewer}
          onSandboxToggle={
            canStartSandbox
              ? (action) => {
                  if (action === "start") void handleStartSandbox();
                  else void handleStopSandbox();
                }
              : undefined
          }
        />
      )}
      rightPanel={rightPanel}
    />
  );

  const { owner } = sandbox.sandbox;
  return (
    <SandboxSurfaceProviders
      onOpenFile={openFile}
      onOpenDiffsTab={() => openDiffs()}
    >
      {owner ? (
        <SandboxWorkspace
          owner={owner}
          storageScope={`project:${projectId}`}
          sandboxId={projectSandboxId}
          isActive={isSandboxActive}
          terminalPanes={sandbox.sandbox.terminalPanes}
        >
          {(panes, workspaceOwner, terminalPanel) =>
            layout(({ rightPanelCollapsed, onToggleRightPanel }) =>
              projectSandboxPanel(
                panes,
                workspaceOwner,
                terminalPanel,
                rightPanelCollapsed,
                onToggleRightPanel,
              ),
            )
          }
        </SandboxWorkspace>
      ) : (
        // No session yet, so no sandbox tabs: the card holds the Tasks tab
        // (feedback can wait in Triage before the coordinator ever ran).
        layout(({ rightPanelCollapsed, onToggleRightPanel }) => (
          <SandboxEmptyRailFrame
            collapsed={rightPanelCollapsed}
            onToggle={onToggleRightPanel}
            fill
          >
            <ProjectTasksPanel
              projectId={projectId}
              projectNumId={projectNumId}
              repoId={repoId}
              basePath={basePath}
              canContribute={!isViewer}
            />
          </SandboxEmptyRailFrame>
        ))
      )}
    </SandboxSurfaceProviders>
  );
}
