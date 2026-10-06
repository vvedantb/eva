"use client";

import { useMutation, useConvex } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Badge,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  LIST_ROW_CONTROL_CLASS,
  cn,
} from "@eva/ui";
import { IconDots } from "@tabler/icons-react";
import { DraftCardMenuItems } from "./DraftCardMenuItems";
import { tokenizedToDisplayText } from "@/lib/components/mentions";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { entityPathSegment } from "@/lib/numId";
import type { DraftCardModel } from "../_utils";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { CARD_KEBAB_CLASS } from "@/lib/components/ui/cardKebab";

interface DraftCardProps {
  model: DraftCardModel;
  basePath: string;
}

function kindLabel(model: DraftCardModel): string {
  if (model.source === "task") return "Task";
  const { kind, parentCommentId } = model.row;
  if (kind === "taskComment") {
    return parentCommentId ? "Reply" : "Comment";
  }
  if (kind === "taskChat") return "Task chat";
  if (kind === "projectChat") return "Project chat";
  if (kind === "sessionChat") return "Session";
  return "Draft";
}

function contextTitle(model: DraftCardModel): string {
  if (model.source === "task") {
    return model.row.title || "Untitled";
  }
  return model.row.contextTitle;
}

function snippetText(model: DraftCardModel): string {
  if (model.source === "task") {
    return tokenizedToDisplayText(model.row.description ?? "");
  }
  return tokenizedToDisplayText(model.row.content);
}

async function resolveTaskActivityPath(
  convex: ConvexReactClient,
  basePath: string,
  taskId: Id<"agentTasks">,
  taskProjectId: Id<"projects"> | undefined,
): Promise<string | null> {
  const task = await convex.query(api.agentTasks.get, { id: taskId });
  const taskSegment = task ? entityPathSegment(task) : null;
  if (!taskSegment) {
    return null;
  }
  if (taskProjectId) {
    const project = await convex.query(api.projects.get, { id: taskProjectId });
    const projectSegment = project ? entityPathSegment(project) : null;
    if (!projectSegment) {
      return null;
    }
    return `${basePath}/projects/${projectSegment}/${taskSegment}/activity`;
  }
  return `${basePath}/quick-tasks/${taskSegment}`;
}

/** Opens the surface where the task sandbox chat draft was written. */
async function resolveTaskChatPath(
  convex: ConvexReactClient,
  basePath: string,
  taskId: Id<"agentTasks">,
  taskProjectId: Id<"projects"> | undefined,
): Promise<string | null> {
  const root = await resolveTaskActivityPath(
    convex,
    basePath,
    taskId,
    taskProjectId,
  );
  if (!root) return null;
  // Quick tasks have a dedicated sandbox route; project tasks embed sandbox
  // in the detail layout, so land on activity.
  if (taskProjectId) return root;
  return `${root}/sandbox/preview`;
}

export function DraftCard({ model, basePath }: DraftCardProps) {
  const navigate = useNavigate();
  const convex = useConvex();
  const removeCommentDraft = useMutation(api.drafts.remove);
  const removeTaskDraft = useMutation(api.agentTasks.remove);

  const handleDelete = () => {
    const promise =
      model.source === "comment"
        ? removeCommentDraft({ id: model.row._id })
        : removeTaskDraft({ id: model.row._id });
    void withMutationToast(
      promise,
      "Draft deleted",
      "Couldn't delete draft",
      "draft-delete",
    );
  };

  const handleClick = () => {
    if (model.source === "task") {
      void navigate({
        to: toInternalRepoHref(`${basePath}/quick-tasks`),
        search: { draft: model.row._id },
      });
      return;
    }

    const { kind, taskId, taskProjectId, projectId, sessionId } = model.row;

    if (kind === "taskComment" && taskId) {
      void (async () => {
        const path = await resolveTaskActivityPath(
          convex,
          basePath,
          taskId,
          taskProjectId,
        );
        if (path) {
          await navigate({ to: toInternalRepoHref(path) });
        }
      })();
      return;
    }

    if (kind === "taskChat" && taskId) {
      void (async () => {
        const path = await resolveTaskChatPath(
          convex,
          basePath,
          taskId,
          taskProjectId,
        );
        if (path) {
          await navigate({ to: toInternalRepoHref(path) });
        }
      })();
      return;
    }

    if (kind === "projectChat" && projectId) {
      void (async () => {
        const project = await convex.query(api.projects.get, { id: projectId });
        const segment = project ? entityPathSegment(project) : null;
        if (!segment) {
          return;
        }
        await navigate({
          to: toInternalRepoHref(
            `${basePath}/projects/${segment}/sandbox/preview`,
          ),
        });
      })();
      return;
    }

    if (kind === "sessionChat" && sessionId) {
      void (async () => {
        const session = await convex.query(api.sessions.get, { id: sessionId });
        const segment = session ? entityPathSegment(session) : null;
        if (!segment) {
          return;
        }
        await navigate({
          to: toInternalRepoHref(`${basePath}/sessions/${segment}/preview`),
        });
      })();
      return;
    }
  };

  const snippet = snippetText(model);
  const label = kindLabel(model);
  const title = contextTitle(model);
  const ts = model.row.updatedAt;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "relative flex h-full flex-col gap-2 rounded-surface bg-card p-4",
            "hover:bg-muted/40 transition-colors duration-[var(--motion-fast)]",
          )}
        >
          {/* A real `<button>` stretched across the card rather than
              `role="button" tabIndex={0}` plus a hand-written Enter/Space
              handler on a div — see `list-row.tsx` for why the native element
              owns the role and the keyboard behaviour. */}
          <button
            type="button"
            aria-label={title}
            onClick={handleClick}
            className="absolute inset-0 z-1 cursor-pointer rounded-surface focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="border-none bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
            >
              {label}
            </Badge>
            <RelativeDateTime
              at={ts}
              className="min-w-0 flex-1 truncate text-xs"
            />
            {/* Touch has no right-click, so below `sm` the same item gets a
                visible kebab. `LIST_ROW_CONTROL_CLASS` lifts it above the
                stretched activation button above, which is at z-1. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Draft actions"
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "max-sm:shrink-0",
                    CARD_KEBAB_CLASS,
                    LIST_ROW_CONTROL_CLASS,
                  )}
                >
                  <IconDots className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <DraftCardMenuItems
                  variant="dropdown"
                  onDelete={handleDelete}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p className="line-clamp-2 text-sm font-medium text-foreground">
            {title}
          </p>

          {snippet ? (
            <p className="line-clamp-3 text-sm text-muted-foreground">
              {snippet}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground/50 italic">
              No content
            </p>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <DraftCardMenuItems variant="context" onDelete={handleDelete} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
