import type { FunctionReturnType } from "convex/server";
import type { Id, api } from "@eva/backend";
import { m, AnimatePresence } from "motion/react";
import { Virtuoso } from "react-virtuoso";
import { entityPathSegment } from "@/lib/numId";
import {
  KanbanColumn,
  KANBAN_COLUMN_WIDTH_CLASS,
} from "@/lib/components/kanban/KanbanColumn";
import type { ProjectStage } from "@eva/shared/projectStatus";
import type { ProjectListStatus } from "@eva/shared/projectView";
import { PROJECT_STAGES } from "@eva/shared/projectView";
import { projectStageConfig } from "@/lib/components/projects/ProjectPhaseBadge";
import { ProjectCard } from "@/lib/components/projects/ProjectCard";
import type { SelectionToggleOptions } from "@/lib/components/quick-tasks/selectionRange";
import { usePersistedScrollParent } from "@/lib/hooks/usePersistedScrollParent";
import { tokenTransition } from "@vvedantb/ui";
import { kanbanCardGlide } from "@/lib/components/kanban/kanbanCardGlide";

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
  projectsByPhase: Record<ProjectStage, Project[]>;
  visiblePhases: Set<ProjectStage>;
  statuses: ReadonlyMap<string, ProjectListStatus>;
  owner: string;
  name: string;
  basePath: string;
  onArchive: (id: Id<"projects">, title: string) => void;
}

export function ProjectsKanbanView({
  projectsByPhase,
  visiblePhases,
  statuses,
  owner,
  name,
  basePath,
  onArchive,
  isSelecting,
  selectedIds,
  onToggleSelect,
}: ProjectsKanbanViewProps) {
  return (
    <AnimatePresence initial={false}>
      {PROJECT_STAGES.flatMap((phase) =>
        visiblePhases.has(phase)
          ? [
              <m.div
                key={phase}
                layout
                className={`flex min-h-0 snap-center self-stretch ${KANBAN_COLUMN_WIDTH_CLASS}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={tokenTransition.base}
              >
                <VirtualProjectColumn
                  phase={phase}
                  projects={projectsByPhase[phase]}
                  statuses={statuses}
                  owner={owner}
                  name={name}
                  basePath={basePath}
                  onArchive={onArchive}
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
  statuses,
  owner,
  name,
  basePath,
  onArchive,
  isSelecting = false,
  selectedIds,
  onToggleSelect,
}: ProjectsSelectionProps & {
  phase: ProjectStage;
  projects: Project[];
  statuses: ReadonlyMap<string, ProjectListStatus>;
  owner: string;
  name: string;
  basePath: string;
  onArchive: (id: Id<"projects">, title: string) => void;
}) {
  const { scrollParent, scrollRef } = usePersistedScrollParent(
    `${owner}/${name}/projects/kanban/${phase}`,
  );
  const columnIds = projects.map((p) => p._id);

  return (
    <KanbanColumn
      id={phase}
      config={projectStageConfig[phase]}
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
              <m.div className="pb-1.5" {...kanbanCardGlide(project._id)}>
                <ProjectCard
                  projectId={project._id}
                  userId={project.userId}
                  title={project.title}
                  description={project.description}
                  rawInput={project.rawInput}
                  branchName={project.branchName}
                  numId={project.numId}
                  createdAt={project._creationTime}
                  accentColor={projectStageConfig[phase].bar}
                  members={project.members}
                  projectLead={project.projectLead}
                  status={statuses.get(project._id)}
                  sandboxStatus={project.sandboxStatus}
                  hasUnread={project.hasUnread}
                  isAwaitingAnswer={project.isAwaitingAnswer}
                  archived={project.archivedAt !== undefined}
                  href={
                    entityPathSegment(project)
                      ? `${basePath}/projects/${entityPathSegment(project)}`
                      : `${basePath}/projects`
                  }
                  onArchive={() => onArchive(project._id, project.title)}
                  isSelecting={isSelecting}
                  isSelected={selectedIds?.has(project._id)}
                  onToggleSelect={(event) =>
                    onToggleSelect?.(project._id, {
                      range: event.shiftKey,
                      orderedIds: columnIds,
                    })
                  }
                />
              </m.div>
            );
          }}
        />
      )}
    </KanbanColumn>
  );
}
