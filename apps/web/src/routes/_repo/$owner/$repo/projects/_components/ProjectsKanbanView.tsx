import type { FunctionReturnType } from "convex/server";
import type { Id, api } from "@eva/backend";
import { m, AnimatePresence } from "motion/react";
import { Virtuoso } from "react-virtuoso";
import { entityPathSegment } from "@/lib/numId";
import {
  KanbanColumn,
  KANBAN_COLUMN_WIDTH_CLASS,
} from "@/lib/components/kanban/KanbanColumn";
import {
  phaseConfig,
  PROJECT_PHASES,
  type ProjectPhase,
} from "@/lib/components/projects/ProjectPhaseBadge";
import { ProjectCard } from "@/lib/components/projects/ProjectCard";
import type { SelectionToggleOptions } from "@/lib/components/quick-tasks/selectionRange";
import { usePersistedScrollParent } from "@/lib/hooks/usePersistedScrollParent";
import { motionBase } from "@eva/ui";

type Project = FunctionReturnType<typeof api.projects.list>[number];

interface ProjectsSelectionProps {
  isSelecting?: boolean;
  selectedIds?: Set<Id<"projects">>;
  onToggleSelect?: (
    id: Id<"projects">,
    options?: SelectionToggleOptions<Id<"projects">>,
  ) => void;
}

interface ProjectsKanbanViewProps extends ProjectsSelectionProps {
  projectsByPhase: Record<ProjectPhase, Project[]>;
  visiblePhases: Set<ProjectPhase>;
  owner: string;
  name: string;
  basePath: string;
  onDelete: (id: Id<"projects">, title: string) => void;
}

export function ProjectsKanbanView({
  projectsByPhase,
  visiblePhases,
  owner,
  name,
  basePath,
  onDelete,
  isSelecting,
  selectedIds,
  onToggleSelect,
}: ProjectsKanbanViewProps) {
  return (
    <AnimatePresence initial={false}>
      {PROJECT_PHASES.flatMap((phase) =>
        visiblePhases.has(phase)
          ? [
              <m.div
                key={phase}
                layout
                className={`flex min-h-0 snap-center self-stretch ${KANBAN_COLUMN_WIDTH_CLASS}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={motionBase}
              >
                <VirtualProjectColumn
                  phase={phase}
                  projects={projectsByPhase[phase]}
                  owner={owner}
                  name={name}
                  basePath={basePath}
                  onDelete={onDelete}
                  isSelecting={isSelecting}
                  selectedIds={selectedIds}
                  onToggleSelect={onToggleSelect}
                />
              </m.div>,
            ]
          : [],
      )}
    </AnimatePresence>
  );
}

function VirtualProjectColumn({
  phase,
  projects,
  owner,
  name,
  basePath,
  onDelete,
  isSelecting = false,
  selectedIds,
  onToggleSelect,
}: ProjectsSelectionProps & {
  phase: ProjectPhase;
  projects: Project[];
  owner: string;
  name: string;
  basePath: string;
  onDelete: (id: Id<"projects">, title: string) => void;
}) {
  const { scrollParent, scrollRef } = usePersistedScrollParent(
    `${owner}/${name}/projects/kanban/${phase}`,
  );
  // Shift-click spans this column only.
  const columnIds = projects.map((p) => p._id);

  return (
    <KanbanColumn
      id={phase}
      config={phaseConfig[phase]}
      count={projects.length}
      droppable={false}
      emptyLabel="No projects"
      scrollRef={scrollRef}
    >
      {scrollParent && projects.length > 0 && (
        <Virtuoso
          customScrollParent={scrollParent}
          totalCount={projects.length}
          overscan={200}
          itemContent={(index) => {
            const project = projects[index];
            return (
              <div className="pb-1.5">
                <ProjectCard
                  projectId={project._id}
                  userId={project.userId}
                  title={project.title}
                  description={project.description}
                  rawInput={project.rawInput}
                  branchName={project.branchName}
                  numId={project.numId}
                  repoFullName={`${owner}/${name}`}
                  createdAt={project._creationTime}
                  accentColor={phaseConfig[phase].bar}
                  members={project.members}
                  projectLead={project.projectLead}
                  phase={phase}
                  planningMode={project.planningMode}
                  isBuilding={project.activeBuildWorkflowId !== undefined}
                  sandboxStatus={project.reviewProjectSandboxStatus}
                  href={
                    entityPathSegment(project)
                      ? `${basePath}/projects/${entityPathSegment(project)}`
                      : `${basePath}/projects`
                  }
                  onDelete={() => onDelete(project._id, project.title)}
                  isSelecting={isSelecting}
                  isSelected={selectedIds?.has(project._id)}
                  onToggleSelect={(event) =>
                    onToggleSelect?.(project._id, {
                      range: event.shiftKey,
                      orderedIds: columnIds,
                    })
                  }
                />
              </div>
            );
          }}
        />
      )}
    </KanbanColumn>
  );
}
