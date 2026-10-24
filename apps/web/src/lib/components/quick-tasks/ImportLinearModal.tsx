"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Textarea,
  Spinner,
} from "@vvedantb/ui";
import { useMutation, useAction } from "convex/react";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { IconAlertCircle } from "@tabler/icons-react";
import { mutationError, withMutationToast } from "@/lib/utils/mutationToast";

interface ImportLinearModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function parseLinearIdentifiers(text: string): string[] {
  const lines = text.split("\n");
  const identifiers = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const urlMatch = trimmed.match(/linear\.app\/[^/]+\/issue\/([A-Z]+-\d+)/i);
    if (urlMatch) {
      identifiers.add(urlMatch[1].toUpperCase());
      continue;
    }

    const idMatch = trimmed.match(/^([A-Z]+-\d+)$/i);
    if (idMatch) {
      identifiers.add(idMatch[1].toUpperCase());
    }
  }

  return Array.from(identifiers);
}

/**
 * The count is only known inside the `try`, and a ternary there bails the React
 * Compiler out of the whole file — a plain call does not. See CLAUDE.md.
 */
function importedMessage(count: number): string {
  return `Imported ${count} task${count === 1 ? "" : "s"}`;
}

export function ImportLinearModal({ isOpen, onClose }: ImportLinearModalProps) {
  const { repo } = useRepo();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIssues = useAction(api.linearActions.fetchIssues);
  const createQuickTasksBatch = useMutation(
    api.agentTasks.createQuickTasksBatch,
  );

  const identifiers = parseLinearIdentifiers(input);

  const handleSubmit = async () => {
    if (identifiers.length === 0 || !repo) return;

    setIsLoading(true);
    setError(null);
    try {
      const issues = await fetchIssues({
        repoId: repo._id,
        identifiers,
      });

      if (issues.length === 0) {
        setError(
          "No issues found. Check that the identifiers are correct and you have access to them.",
        );
        setIsLoading(false);
        return;
      }

      const tasks = issues.map((issue) => ({
        title: `${issue.identifier}: ${issue.title}`,
        description: issue.description || undefined,
      }));

      await withMutationToast(
        createQuickTasksBatch({
          repoId: repo._id,
          tasks,
        }),
        importedMessage(issues.length),
        "Couldn't import from Linear",
        "linear-import",
      );

      setInput("");
      setError(null);
      onClose();
    } catch (err) {
      mutationError("Couldn't import from Linear", "linear-import");
      setError(err instanceof Error ? err.message : String(err));
    }
    setIsLoading(false);
  };

  const handleClose = () => {
    if (!isLoading) {
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from Linear</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Textarea
              placeholder="Paste Linear URLs or identifiers (one per line)&#10;Example:&#10;https://linear.app/team/issue/TEAM-123/...&#10;TEAM-456"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={6}
              autoFocus
            />
            {identifiers.length > 0 && (
              <p className="text-sm text-muted-foreground wrap-break-word">
                {identifiers.length} issue{identifiers.length === 1 ? "" : "s"}{" "}
                detected: {identifiers.join(", ")}
              </p>
            )}
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-surface border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              <IconAlertCircle size={16} className="mt-0.5 shrink-0" />
              <div>{error}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || identifiers.length === 0}
          >
            {isLoading && <Spinner size="sm" />}
            Import {identifiers.length} Issue
            {identifiers.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
