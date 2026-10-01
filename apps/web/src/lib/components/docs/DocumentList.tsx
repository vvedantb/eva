"use client";

import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { compactRelativeTime } from "@eva/shared/dates";
import { DOC_VIEWER_DEFAULT_TAB } from "@/lib/search-params";
import { entityPathSegment } from "@/lib/numId";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { IconFile } from "@tabler/icons-react";
import {
  SessionSourceEmpty,
  SessionSourceList,
  SessionSourceRow,
} from "@/lib/components/sandbox/SessionSourcePane";
import { docSourceLabel } from "./_source";

type DocRow = FunctionReturnType<typeof api.docs.listForSource>[number];

/**
 * Compact list of Eva docs, or an empty state. Rows link to the Documents
 * viewer unless `onOpen` is given (the sandbox tab opens them inline).
 */
export function DocumentList({
  docs,
  basePath,
  emptyDescription,
  showSource = true,
  onOpen,
}: {
  docs: DocRow[];
  basePath: string;
  emptyDescription: string;
  showSource?: boolean;
  onOpen?: (numId: number) => void;
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
      {docs.map((doc) => {
        const segment = entityPathSegment(doc);
        const numId = doc.numId;
        if (!segment || numId === undefined) return null;
        const href = toInternalRepoHref(
          `${basePath}/docs/${segment}/${DOC_VIEWER_DEFAULT_TAB}`,
        );
        const source = showSource ? doc.source : null;
        const preview = source
          ? docSourceLabel(source)
          : (doc.contentPreview ?? null);
        return (
          <SessionSourceRow
            key={doc._id}
            title={doc.title}
            preview={preview}
            timeLabel={compactRelativeTime(doc.updatedAt)}
            icon={<IconFile size={16} />}
            link={
              onOpen ? (
                <button type="button" onClick={() => onOpen(numId)} />
              ) : (
                <Link to={href} search={(prev) => prev} />
              )
            }
          />
        );
      })}
    </SessionSourceList>
  );
}
