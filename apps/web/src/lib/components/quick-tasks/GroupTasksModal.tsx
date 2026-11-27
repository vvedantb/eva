"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation, useConvex } from "convex/react";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useNavigate } from "@tanstack/react-router";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Spinner,
  useDragSensors,
  MarqueeOnHover,
} from "@vvedantb/ui";
import { ProjectStageBadge } from "@/lib/components/projects/ProjectPhaseBadge";
import { useProjectListStatuses } from "@/lib/components/projects/useProjectStatus";
import { entityPathSegment } from "@/lib/numId";
import { IconGripVertical } from "@tabler/icons-react";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { withMutationToast } from "@/lib/utils/mutationToast";

type Task = FunctionReturnType<typeof api.agentTasks.getAllTasks>[number];

interface GroupTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTasks: Task[];
  onSuccess: () => void;
}

function SortableTaskItem({ task, index }: { task: Task; index: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 rounded-lg px-3 py-2 bg-muted/40 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <button
        type="button"
        aria-label={`Reorder ${task.title}`}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground max-sm:flex max-sm:size-10 max-sm:shrink-0 max-sm:items-center max-sm:justify-center max-sm:rounded-md"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical size={16} />
      </button>
      <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0">
        {index + 1}
      </span>
      <MarqueeOnHover className="min-w-0 text-sm">{task.title}</MarqueeOnHover>
    </div>
  );
}

export function GroupTasksModal({
  isOpen,
  onClose,
  selectedTasks,
  onSuccess,
}: GroupTasksModalProps) {
  const { repo, basePath } = useRepo();
  const navigate = useNavigate();
  const convex = useConvex();
  const [title, setTitle] = useState("");
  const [selectedProjectId, setSelectedProjectId] =
    useState<Id<"projects"> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("new");
  const [orderedTasks, setOrderedTasks] = useState(selectedTasks);
  const [syncKey, setSyncKey] = useState<{ open: boolean; ids: string }>({
    open: false,
    ids: "",
  });
  const selectedIds = selectedTasks.map((task) => task._id).join(",");  if (isOpen && (!syncKey.open || syncKey.ids !== selectedIds)) {
    setSyncKey({ open: true, ids: selectedIds });
    setOrderedTasks(selectedTasks);
  } else if (!isOpen && syncKey.open) {
    setSyncKey({ open: false, ids: "" });
  }

  const projects = useQuery(api.projects.list, { repoId: repo._id });  const statuses = useProjectListStatuses(repo._id);
  const createFromTasks = useMutation(api.projects.createFromTasks);
  const assignToProject = useMutation(api.agentTasks.assignToProject);
  const sensors = useDragSensors({ sortable: true });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedTasks((prev) => {
      const oldIndex = prev.findIndex((t) => t._id === active.id);
      const newIndex = prev.findIndex((t) => t._id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const taskIds = orderedTasks.map((t) => t._id);

  const handleCreate = async () => {
    if (!title.trim() || taskIds.length === 0) return;
    setIsLoading(true);
    try {
      const projectId = await withMutationToast(
        createFromTasks({
          repoId: repo._id,
          title: title.trim(),
          taskIds,
        }),
        "Project created",
        "Couldn't create project",
        "project-create-from-tasks",
      );
      const created = await convex.query(api.projects.get, { id: projectId });
      setTitle("");
      onSuccess();
      onClose();      if (created) {
        const segment = entityPathSegment(created);
        if (segment) {
          navigate({
            to: toInternalRepoHref(`${basePath}/projects/${segment}`),
          });
        }
      }
    } catch {
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
  };

  const handleAddToProject = async () => {
    if (!selectedProjectId || taskIds.length === 0) return;
    setIsLoading(true);    const successMessage = `Added ${taskIds.length} task${taskIds.length === 1 ? "" : "s"} to project`;
    try {
      await withMutationToast(
        assignToProject({
          taskIds,
          projectId: selectedProjectId,
        }),
        successMessage,
        "Couldn't add tasks to project",
        "tasks-add-to-project",
      );
      setSelectedProjectId(null);
      onSuccess();
      onClose();
    } catch {
      setIsLoading(false);
      return;
    }
    setIsLoading(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Group {orderedTasks.length} task
            {orderedTasks.length !== 1 ? "s" : ""} into project
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">
            Task order (drag to reorder)
          </label>
          <div className="max-h-48 overflow-y-auto space-y-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={orderedTasks.map((t) => t._id)}
                strategy={verticalListSortingStrategy}
              >
                {orderedTasks.map((task, i) => (
                  <SortableTaskItem key={task._id} task={task} index={i} />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="new" className="flex-1">
              New Project
            </TabsTrigger>
            <TabsTrigger value="existing" className="flex-1">
              Existing Project
            </TabsTrigger>
          </TabsList>
          <TabsContent value="new">
            <div className="pt-2 space-y-1.5">
              <label className="text-sm font-medium">Project title</label>
              <Input
                placeholder="e.g. Bug fixes, UI improvements..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
          </TabsContent>
          <TabsContent value="existing">
            <div className="pt-2 space-y-2 max-h-80 overflow-y-auto">
              {projects?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No projects
                </p>
              )}
              {projects?.map((project) => {
                const stage = statuses?.get(project._id)?.stage;
                return (
                  <button
                    key={project._id}
                    type="button"
                    onClick={() => setSelectedProjectId(project._id)}
                    className={`w-full rounded-lg p-3 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/35 ${
                      selectedProjectId === project._id
                        ? "ring-2 ring-primary bg-accent-soft"
                        : "bg-muted hover:bg-muted/70"
                    }`}
                  >
                    <div className="flex items-center gap-2 justify-between">
                      <span className="text-sm font-medium truncate">
                        {project.title}
                      </span>
                      {stage ? <ProjectStageBadge stage={stage} /> : null}
                    </div>
                    {project.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {project.description}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {activeTab === "new" ? (
            <Button
              onClick={handleCreate}
              disabled={isLoading || !title.trim() || taskIds.length === 0}
            >
              {isLoading && <Spinner size="sm" />}
              Create Project
            </Button>
          ) : (
            <Button
              onClick={handleAddToProject}
              disabled={isLoading || !selectedProjectId || taskIds.length === 0}
            >
              {isLoading && <Spinner size="sm" />}
              Add to Project
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
