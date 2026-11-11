"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from "@vvedantb/ui";
import { useUpdateProject } from "@/lib/components/projects/useUpdateProject";
import type { ProjectPhase } from "@/lib/components/projects/ProjectPhaseBadge";
import type { ProjectCardMenuItemsProps } from "./ProjectCardMenuItems";

type ProjectMenuArgs = Omit<
  ProjectCardMenuItemsProps,
  | "variant"
  | "users"
  | "currentUserId"
  | "onPhaseChange"
  | "onLeadChange"
  | "onEdit"
> & {
  description?: string;
};

/**
 * Props for `ProjectCardMenuItems` plus the Edit details dialog, which renders
 * beside the menu, not in it: Radix unmounts menu content on close. Shared by
 * the project card and the project header.
 */
export function useProjectMenu({ description, ...args }: ProjectMenuArgs) {
  const { projectId, title } = args;
  const updateProject = useUpdateProject(projectId);
  const currentUserId = useQuery(api.auth.me);
  const users = useQuery(api.users.listAll);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [editDescription, setEditDescription] = useState(description ?? "");

  const menuProps = {
    ...args,
    users: users ?? undefined,
    currentUserId: currentUserId ?? undefined,
    onPhaseChange: (nextPhase: ProjectPhase) => {
      void updateProject({ id: projectId, phase: nextPhase });
    },
    onLeadChange: (value: string) => {
      if (value === "none") {
        void updateProject({ id: projectId, projectLead: null });
        return;
      }
      const matchedUser = (users ?? []).find((u) => u._id === value);
      const leadId: Id<"users"> | undefined =
        currentUserId === value ? currentUserId : matchedUser?._id;
      if (!leadId) return;
      void updateProject({ id: projectId, projectLead: leadId });
    },
    onEdit: () => {
      setEditTitle(title);
      setEditDescription(description ?? "");
      setEditOpen(true);
    },
  };

  const dialogs = (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await updateProject({
              id: projectId,
              title: editTitle,
              description: editDescription || undefined,
            });
            setEditOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <Input
            placeholder="Title"
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            autoFocus
          />
          <Textarea
            placeholder="Description"
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
            rows={6}
            className="min-h-[160px] resize-y"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!editTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return { menuProps, dialogs, isEditOpen: editOpen };
}
