import type { Id } from "@eva/backend";
import { archiveCopy } from "@eva/shared";
import { ConfirmDialog } from "@vvedantb/ui";

/**
 * What is about to be archived. One project names itself; a bulk selection
 * can only count, since the titles would not fit and add nothing to the
 * decision.
 */
export type ProjectArchiveTarget =
  | { kind: "single"; id: Id<"projects">; title: string }
  | { kind: "bulk"; count: number };

interface ProjectArchiveDialogProps {
  target: ProjectArchiveTarget | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isArchiving: boolean;
}

export function ProjectArchiveDialog({
  target,
  onClose,
  onConfirm,
  isArchiving,
}: ProjectArchiveDialogProps) {
  const count = target?.kind === "bulk" ? target.count : 1;

  return (
    <ConfirmDialog
      size="md"
      open={target !== null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={archiveCopy("project", count).confirmTitle}
      description={
        target?.kind === "single" ? <strong>{target.title}</strong> : undefined
      }
      confirmLabel="Archive"
      onConfirm={() => {
        void onConfirm();
      }}
      pending={isArchiving}
    />
  );
}
