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

type SystemSkillContentDialogProps = {
  repoId: Id<"githubRepos">;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SystemSkillContentDialog({
  repoId,
  name,
  open,
  onOpenChange,
}: SystemSkillContentDialogProps) {
  const skillContent = useQuery(
    api.repoSystemSkills.getContentByName,
    open ? { repoId, name } : "skip",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            Served by the Eva MCP server when the agent invokes this skill,
            filled in for this repo.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {skillContent === undefined ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : skillContent === null ? (
            <p className="text-xs text-muted-foreground">
              Contents unavailable for this repo.
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
