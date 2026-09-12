"use client";

import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import {
  cn,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Button,
  ListRow,
  LIST_ROW_CONTROL_CLASS,
} from "@eva/ui";
import { IconDots, IconLayoutDashboard } from "@tabler/icons-react";
import { relativeTime } from "./_format";
import { withMutationToast } from "@/lib/utils/mutationToast";
import { ArtifactCardMenuItems } from "./ArtifactCardMenuItems";
import { artifactSourceLabel, artifactSourceRoute } from "./_source";
import { CARD_KEBAB_CLASS } from "@/lib/components/ui/cardKebab";
import { requestConfirm, useAltHeld } from "@/lib/confirm";

type ArtifactRow = FunctionReturnType<typeof api.artifacts.listAll>[number];

/** A single artifact tile: left-click opens the viewer; right-click for actions. */
export function ArtifactCard({
  artifact,
  showSource = true,
  compact = false,
}: {
  artifact: ArtifactRow;
  showSource?: boolean;
  /** Sandbox pane: a list row. The global Artifacts page keeps the tile. */
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const remove = useMutation(api.artifacts.remove);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const altHeld = useAltHeld();
  const source = showSource ? artifact.source : null;
  const sourceRoute = source ? artifactSourceRoute(source) : null;

  const openInNewTab = () =>
    window.open(`/artifacts/${artifact._id}`, "_blank", "noopener");

  const onDelete = async () => {
    await withMutationToast(
      remove({ id: artifact._id }),
      "Artifact deleted",
      "Couldn't delete artifact",
      "artifact-delete",
    );
    setConfirmDeleteOpen(false);
  };

  const menuProps = {
    onOpen: () =>
      void navigate({
        to: "/artifacts/$artifactId",
        params: { artifactId: artifact._id },
      }),
    onOpenInNewTab: openInNewTab,
    ...(source && sourceRoute
      ? {
          onOpenSource: () =>
            void navigate({
              to: sourceRoute.to,
              params: sourceRoute.params,
            }),
          sourceLabel:
            source.kind === "session"
              ? "session"
              : source.kind === "task"
                ? "task"
                : "project",
        }
      : {}),
    onDelete: () =>
      requestConfirm(altHeld, () => setConfirmDeleteOpen(true), () => {
        void onDelete();
      }),
  };

  const kebab = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Artifact actions"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            compact
              ? cn("max-sm:shrink-0", CARD_KEBAB_CLASS, LIST_ROW_CONTROL_CLASS)
              : cn("absolute bottom-3 right-2 z-2", CARD_KEBAB_CLASS),
          )}
        >
          <IconDots className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <ArtifactCardMenuItems variant="dropdown" {...menuProps} />
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const meta = (
    <>
      {compact && artifact.description ? (
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {artifact.description}
        </p>
      ) : null}
      {!compact && artifact.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {artifact.description}
        </p>
      ) : null}
      {source ? (
        <p
          className={cn(
            "truncate text-muted-foreground",
            compact ? "mt-0.5 text-[11px]" : "text-xs",
          )}
        >
          {artifactSourceLabel(source)}
        </p>
      ) : null}
    </>
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {compact ? (
            <ListRow
              className="bg-transparent hover:bg-muted"
              aria-label={artifact.name}
              link={
                <Link
                  to="/artifacts/$artifactId"
                  params={{ artifactId: artifact._id }}
                />
              }
              contentClassName="flex items-start gap-3 py-2.5"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <IconLayoutDashboard
                  size={16}
                  className="text-muted-foreground"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {artifact.name}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {relativeTime(artifact.createdAt)}
                  </span>
                  {kebab}
                </span>
                {meta}
              </span>
            </ListRow>
          ) : (
          <div className="relative h-full">
            <Link
              to="/artifacts/$artifactId"
              params={{ artifactId: artifact._id }}
              className="flex h-full flex-col gap-2 rounded-surface bg-card p-4 transition-colors hover:bg-muted"
            >
              <div className="flex items-center gap-2">
                <IconLayoutDashboard
                  size={18}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="truncate font-medium text-foreground">
                  {artifact.name}
                </span>
              </div>
              {meta}
              <span className="mt-auto text-xs text-muted-foreground max-sm:pr-8">
                {relativeTime(artifact.createdAt)}
              </span>
            </Link>
            {kebab}
          </div>
          )}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ArtifactCardMenuItems variant="context" {...menuProps} />
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete &quot;{artifact.name}&quot;?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
