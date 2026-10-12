import type { Id, SandboxOwner } from "@eva/backend";
import { IconTerminal2 } from "@tabler/icons-react";
import { ProjectSandboxPanel } from "@/lib/components/projects/ProjectSandboxPanel";
import { ProjectSandboxChatPanel } from "@/lib/components/projects/ProjectSandboxChatPanel";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { PendingPreviewSnapshotsProvider } from "@/lib/contexts/PendingPreviewSnapshotsContext";
import { PendingWebMcpProvider } from "@/lib/contexts/PendingWebMcpContext";
import { OpenSandboxFileProvider } from "@/lib/contexts/OpenSandboxFileContext";
import { SandboxEmptyRailFrame } from "@/lib/components/sandbox/SandboxPanelFrame";
import {
  SandboxWorkspace,
  type TerminalPanelApi,
} from "@/lib/components/sandbox/SandboxWorkspace";
import type { SandboxPanesApi } from "@/lib/components/sandbox/useSandboxPanes";
import type { TaskRouteSandboxTab } from "@/lib/search-params";
import type {
  ProjectDetailProject,
  ProjectSandboxState,
} from "./projectDetailHelpers";

interface ProjectDetailSandboxContentProps {
  projectId: Id<"projects">;
  projectNumId?: number;
  project: ProjectDetailProject;
  repoId: Id<"repos">;
  sandboxTab?: TaskRouteSandboxTab;
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
  sandboxTab,
  sandbox,
  chatTurnOpen,
  sandboxRailWidthPx,
  expandRightSignal,
  openFile,
  openDiffs,
  openAgentsTab,
}: ProjectDetailSandboxContentProps) {
  const {
    canStartSandbox,
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    sandboxStartupActivity,
    sandboxId: projectSandboxId,
    handleStartSandbox,
    handleStopSandbox,
  } = sandbox;

  const tab = sandboxTab ?? "preview";
  // Always mount the sandbox panel when the project can have one so tabs
  // stay reachable while stopped — same as sessions. Panes self-gate.
  const projectSandboxPanel = (
    panes: SandboxPanesApi,
    owner: SandboxOwner,
    terminalPanel: TerminalPanelApi,
    collapsed: boolean,
    onToggle: () => void,
  ) =>
    canStartSandbox ||
    projectSandboxId ||
    isSandboxActive ||
    isSandboxStarting ||
    isSandboxStopping ? (
      <ProjectSandboxPanel
        projectId={projectId}
        projectNumId={projectNumId}
        sandboxId={projectSandboxId}
        isActive={isSandboxActive}
        repoId={repoId}
        prUrl={project.prUrl}
        devPort={project.devPort}
        devCommand={project.devCommand}
        owner={owner}
        panes={panes}
        terminalPanel={terminalPanel}
        backgroundAgents={project.backgroundAgents}
        sandboxTab={tab}
        onStartSandbox={
          canStartSandbox && !isSandboxStopping ? handleStartSandbox : undefined
        }
        isSandboxStarting={isSandboxStarting}
        autoWakeEligible={
          project.reviewProjectSandboxStatus === "closed" &&
          projectSandboxId !== undefined &&
          canStartSandbox &&
          project.activeBuildWorkflowId === undefined &&
          // Still loading counts as busy: never wake under a live turn.
          chatTurnOpen === false
        }
        collapsed={collapsed}
        onToggle={onToggle}
      />
    ) : (
      <SandboxEmptyRailFrame collapsed={collapsed} onToggle={onToggle}>
        <div className="flex flex-col items-center gap-3 text-center">
          <IconTerminal2 size={32} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Sandbox is not available for this project yet
          </p>
        </div>
      </SandboxEmptyRailFrame>
    );

  return (
    <PendingPreviewSnapshotsProvider>
      <PendingWebMcpProvider>
        <OpenSandboxFileProvider onOpenFile={openFile}>
          <SandboxWorkspace
            ownerKind="project"
            ownerId={projectId}
            storageScope={`project:${projectId}`}
            sandboxId={projectSandboxId}
            isActive={isSandboxActive}
            terminalPanes={project.terminalPanes}
          >
            {(panes, owner, terminalPanel) => (
              <ResizablePanelLayout
                storageKey="project-sandbox-panel"
                leftDefaultSize="40%"
                leftMinWidthPx={350}
                rightMinWidthPx={300}
                rightCollapsedSizePx={sandboxRailWidthPx}
                defaultRightCollapsed={false}
                expandRightSignal={expandRightSignal}
                mobilePaneLabels={{ left: "Chat", right: "Sandbox" }}
                leftPanel={() => (
                  <ProjectSandboxChatPanel
                    projectId={projectId}
                    isSandboxActive={isSandboxActive}
                    isSandboxToggling={isSandboxStarting || isSandboxStopping}
                    sandboxStartupActivity={sandboxStartupActivity}
                    onOpenFile={openFile}
                    onViewDiff={openDiffs}
                    onOpenAgentsTab={openAgentsTab}
                    onSandboxToggle={
                      canStartSandbox || isSandboxActive
                        ? (action) => {
                            if (action === "start") void handleStartSandbox();
                            else void handleStopSandbox();
                          }
                        : undefined
                    }
                  />
                )}
                rightPanel={({ rightPanelCollapsed, onToggleRightPanel }) =>
                  projectSandboxPanel(
                    panes,
                    owner,
                    terminalPanel,
                    rightPanelCollapsed,
                    onToggleRightPanel,
                  )
                }
              />
            )}
          </SandboxWorkspace>
        </OpenSandboxFileProvider>
      </PendingWebMcpProvider>
    </PendingPreviewSnapshotsProvider>
  );
}
