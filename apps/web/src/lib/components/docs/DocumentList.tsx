"use client";

import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { IconFile } from "@tabler/icons-react";
import { EmptyState } from "@/lib/components/ui/EmptyState";
import { DOC_VIEWER_DEFAULT_TAB } from "@/lib/search-params";
import { entityPathSegment } from "@/lib/numId";
import { compactRelativeTime } from "@eva/shared/dates";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { docSourceLabel } from "./_source";

type DocRow = FunctionReturnType<typeof api.docs.listForSource>[number];

/** Compact list of Eva docs, or an empty state. */
export function DocumentList({
  docs,
  basePath,
  emptyDescription,
  showSource = true,
}: {
  docs: DocRow[];
  basePath: string;
  emptyDescription: string;
  showSource?: boolean;
}) {
  if (docs.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center py-16">
        <EmptyState
          icon={<IconFile size={24} className="text-muted-foreground" />}
          title="No documents yet"
          description={emptyDescription}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {docs.map((doc) => {
        const segment = entityPathSegment(doc);
        if (!segment) return null;
        const href = toInternalRepoHref(
          `${basePath}/docs/${segment}/${DOC_VIEWER_DEFAULT_TAB}`,
        );
        const source = showSource ? doc.source : null;
        return (
          <Link
            key={doc._id}
            to={href}
            search={(prev) => prev}
            className="flex flex-col gap-1 rounded-surface bg-card p-3 transition-colors hover:bg-muted"
          >
            <span className="truncate font-medium text-foreground">
              {doc.title}
            </span>
            {doc.contentPreview ? (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {doc.contentPreview}
              </p>
            ) : null}
            {source ? (
              <p className="truncate text-xs text-muted-foreground">
                {docSourceLabel(source)}
              </p>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {compactRelativeTime(doc.updatedAt)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
