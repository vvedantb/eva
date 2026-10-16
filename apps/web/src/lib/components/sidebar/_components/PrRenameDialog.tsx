"use client";

import { useState } from "react";
import type { Id } from "@eva/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@eva/ui";
import { usePrEdit } from "@/lib/components/reviews/usePrEdit";

/** The pull request being renamed, or null when the dialog is closed. */
export interface PrToRename {
  readonly number: number;
  readonly title: string;
}

/**
 * Renames a pull request from the reviews sidebar. One dialog serves the whole
 * list, so the row itself stays presentational.
 */
export function PrRenameDialog({
  repoId,
  pr,
  onClose,
}: {
  repoId: Id<"githubRepos">;
  pr: PrToRename | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={pr !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename pull request</DialogTitle>
          <DialogDescription>
            The new title is pushed to GitHub as the eva app.
          </DialogDescription>
        </DialogHeader>
        {/* Keyed on the pull request, so opening a different row starts its form
            from that row's title instead of the last one's. */}
        {pr === null ? null : (
          <RenameForm
            key={pr.number}
            repoId={repoId}
            pr={pr}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  repoId,
  pr,
  onClose,
}: {
  repoId: Id<"githubRepos">;
  pr: PrToRename;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(pr.title);
  const edit = usePrEdit(repoId, pr.number, onClose);

  const trimmed = title.trim();
  const submit = () => {
    if (trimmed.length > 0 && trimmed !== pr.title && !edit.saving) {
      edit.save({ title: trimmed });
    }
  };

  return (
    <>
      <Input
        value={title}
        aria-label="Pull request title"
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />

      {edit.error === null ? null : (
        <p className="text-xs text-destructive">{edit.error}</p>
      )}

      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={edit.saving}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={trimmed.length === 0 || trimmed === pr.title || edit.saving}
        >
          {edit.saving ? <Spinner size="sm" /> : null}
          Rename
        </Button>
      </DialogFooter>
    </>
  );
}
