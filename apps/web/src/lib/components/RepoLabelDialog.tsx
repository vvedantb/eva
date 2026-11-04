"use client";

import { useId, useState } from "react";
import type { Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@vvedantb/ui";
import { useSetRepoLabel } from "@/lib/hooks/useSetRepoLabel";
import { withMutationToast } from "@/lib/utils/mutationToast";

interface RepoLabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoId: Id<"githubRepos">;
  /** Current custom label, if any. */
  label: string | undefined;
  /** Placeholder / default shown when label is empty (GitHub name or leaf). */
  fallbackName: string;
  /** When set, optimistically patches `listByTeam` for this team too. */
  teamId?: Id<"teams">;
}

/** Dialog to set or clear a repo/app display label. */
export function RepoLabelDialog({
  open,
  onOpenChange,
  repoId,
  label,
  fallbackName,
  teamId,
}: RepoLabelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/* Remount when opened so the draft resets from the latest label. */}
        {open ? (
          <RepoLabelForm
            key={`${repoId}:${label ?? ""}`}
            repoId={repoId}
            label={label}
            fallbackName={fallbackName}
            teamId={teamId}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RepoLabelForm({
  repoId,
  label,
  fallbackName,
  teamId,
  onOpenChange,
}: {
  repoId: Id<"githubRepos">;
  label: string | undefined;
  fallbackName: string;
  teamId?: Id<"teams">;
  onOpenChange: (open: boolean) => void;
}) {
  const setLabel = useSetRepoLabel(teamId);
  const [value, setValue] = useState(label ?? "");
  const [saving, setSaving] = useState(false);
  const fieldId = useId();

  const save = async () => {
    setSaving(true);
    try {
      await withMutationToast(
        setLabel({ repoId, label: value }),
        "Display name saved",
        "Couldn't save display name",
        "repo-label-save",
      );
      onOpenChange(false);
    } catch {
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Rename</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <label htmlFor={fieldId} className="text-sm font-medium">
          Display name
        </label>
        <Input
          id={fieldId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={fallbackName}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        />
        <p className="text-xs text-muted-foreground">
          Shown in the sidebar instead of{" "}
          <span className="font-medium text-foreground/80">{fallbackName}</span>
          . Leave empty to use the default.
        </p>
      </div>
      <DialogFooter>
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Spinner size="sm" /> : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}
