"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { compactRelativeTime } from "@eva/shared/dates";
import { IconFile } from "@tabler/icons-react";
import {
  SessionSourceEmpty,
  SessionSourceList,
  SessionSourceRow,
} from "@/lib/components/sandbox/SessionSourcePane";

type DocRow = FunctionReturnType<typeof api.docs.listForSource>[number];

/** Sandbox Documents tab rows (or empty state); a row opens inline. */
export function DocumentList({
  docs,
  emptyDescription,
  onOpen,
}: {
  docs: DocRow[];
  emptyDescription: string;
  onOpen: (docId: string) => void;
}) {
  if (docs.length === 0) {
    return (
      <SessionSourceEmpty
        icon={<IconFile size={20} />}
        title="No documents yet"
        description={emptyDescription}
      />
    );
  }
  return (
    <SessionSourceList>
      {docs.map((doc) => (
        <SessionSourceRow
          key={doc._id}
          title={doc.title}
          preview={doc.contentPreview ?? null}
          timeLabel={compactRelativeTime(doc.updatedAt)}
          icon={<IconFile size={16} />}
          link={<button type="button" onClick={() => onOpen(doc._id)} />}
        />
      ))}
    </SessionSourceList>
  );
}
