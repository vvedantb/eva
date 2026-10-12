"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@eva/ui";

type SkillContentDialogProps = {
  skillId: Id<"repoSkills">;
  title: string;
  sourcePath: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SkillContentDialog({
  skillId,
  title,
  sourcePath,
  open,
  onOpenChange,
}: SkillContentDialogProps) {
  const skillContent = useQuery(
    api.repoSkills.getContentById,
    open ? { skillId } : "skip",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {sourcePath ? (
            <DialogDescription className="max-sm:break-all">
              {sourcePath}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <DialogBody>
          {skillContent === undefined ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : skillContent === null ? (
            <p className="text-xs text-muted-foreground">
              No stored contents yet. Run Sync from GitHub to fetch SKILL.md.
            </p>
          ) : (
            <pre className="whitespace-pre-wrap wrap-break-word rounded-surface border border-border bg-muted/40 p-3 font-mono text-2xs leading-relaxed text-foreground">
              {skillContent.content}
            </pre>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
