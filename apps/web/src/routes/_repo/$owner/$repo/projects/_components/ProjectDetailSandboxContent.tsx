import { Activity, type ReactNode } from "react";
import type { Id, SandboxOwner } from "@eva/backend";
import { ProjectSandboxPanel } from "@/lib/components/projects/ProjectSandboxPanel";
import { ProjectSandboxChatPanel } from "@/lib/components/projects/ProjectSandboxChatPanel";
import { ResizablePanelLayout } from "@/lib/components/ResizablePanelLayout";
import { SandboxSurfaceProviders } from "@/lib/components/sandbox/SandboxSurfaceProviders";
import { ProjectTasksPanel } from "@/lib/components/projects/ProjectTasksPanel";
import { ProjectChatTabs } from "@/lib/components/projects/ProjectChatTabs";
import { ProjectTaskChat } from "@/lib/components/projects/ProjectTaskChat";
import type { ProjectSandboxTab } from "@/lib/components/projects/projectSandboxTabs";
import {
  useProjectTaskTabRows,
  type ProjectTaskTabs,
} from "@/lib/components/projects/useProjectTaskTabs";
import { entityPathSegment } from "@/lib/numId";
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
  onThreadOpen: (messageId: string) => void;
  onCloseThread: () => void;
  taskTabs: ProjectTaskTabs;
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
  onThreadOpen,
  onCloseThread,
  taskTabs,
  openFile,
  openDiffs,
  openAgentsTab,
}: ProjectDetailSandboxContentProps) {
  const {
    isSandboxActive,
    isSandboxStarting,
    isSandboxStopping,
    sandboxStartupActivity,
    sandboxId: projectSandboxId,
    handleStartSandbox,
    handleStopSandbox,
  } = sandbox;
  const isArchived = project.archivedAt !== undefined;
  const projectPathSegment = entityPathSegment({ numId: projectNumId });
  const { rows, selectedRow, selectedLoading } = useProjectTaskTabRows(
    projectId,
    repoId,
    taskTabs,
  );
  const onEva = selectedRow === undefined && !selectedLoading;

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
      onStartSandbox={
        isSandboxStopping || isArchived ? undefined : handleStartSandbox
      }
      isSandboxStarting={isSandboxStarting}
      autoWakeEligible={
        sandbox.sandbox.status === "closed" &&
        projectSandboxId !== undefined &&
        !isArchived &&
        chatTurnOpen === false
      }
      collapsed={collapsed}
      onToggle={onToggle}
      onCloseThread={onCloseThread}
      selectedTask={selectedRow}
      selectedTaskLoading={selectedLoading}
      openTaskIds={new Set(rows.map(({ row }) => row._id))}
      onOpenTask={taskTabs.open}
    />
  );

  const evaChat = (
    <ProjectSandboxChatPanel
      projectId={projectId}
      projectSession={sandbox.projectSession}
      isSandboxActive={isSandboxActive}
      isSandboxToggling={isSandboxStarting || isSandboxStopping}
      sandboxStartupActivity={sandboxStartupActivity}
      onOpenFile={openFile}
      onViewDiff={openDiffs}
      onOpenAgentsTab={openAgentsTab}
      onThreadOpen={onThreadOpen}
      isArchived={isArchived}
      onSandboxToggle={(action) => {
        if (action === "start") void handleStartSandbox();
        else void handleStopSandbox();
      }}
    />
  );

  const chatColumn = () =>
    sandbox.sandbox.owner ? (
      <div className="flex h-full min-h-0 flex-col">
        <ProjectChatTabs
          projectId={projectId}
          repoId={repoId}
          rows={rows}
          selected={onEva ? null : taskTabs.selected}
          evaRunning={chatTurnOpen === true}
          isArchived={isArchived}
          onSelect={taskTabs.select}
          onClose={taskTabs.close}
        />
        <Activity mode={onEva ? "visible" : "hidden"}>
          <div className="flex min-h-0 flex-1 flex-col">{evaChat}</div>
        </Activity>
        {selectedRow && projectPathSegment ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <ProjectTaskChat
              key={selectedRow._id}
              taskId={selectedRow._id}
              prUrl={selectedRow.prUrl}
              fullPageHref={`${basePath}/projects/${projectPathSegment}/${selectedRow.numId}`}
              onShowReview={() => taskTabs.showTab("task-review")}
            />
          </div>
        ) : null}
      </div>
    ) : (
      evaChat
    );

  const layout = (rightPanel: (ctx: SandboxPanelContext) => ReactNode) => (
    <ResizablePanelLayout
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
      leftPanel={chatColumn}
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
        layout(() => (
          <div className="flex h-full min-h-0 flex-col">
            <ProjectTasksPanel
              projectId={projectId}
              projectNumId={projectNumId}
              repoId={repoId}
              basePath={basePath}
            />
          </div>
        ))
      )}
    </SandboxSurfaceProviders>
  );
}
