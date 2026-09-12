"use client";

import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { ListRow } from "@eva/ui";
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
    <div className="flex flex-col">
      {docs.map((doc) => {
        const segment = entityPathSegment(doc);
        if (!segment) return null;
        const href = toInternalRepoHref(
          `${basePath}/docs/${segment}/${DOC_VIEWER_DEFAULT_TAB}`,
        );
        const source = showSource ? doc.source : null;
        return (
          <ListRow
            key={doc._id}
            className="bg-transparent hover:bg-muted"
            aria-label={doc.title}
            link={<Link to={href} search={(prev) => prev} />}
            contentClassName="flex items-start gap-3 py-2.5"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <IconFile size={16} className="text-muted-foreground" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {doc.title}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {compactRelativeTime(doc.updatedAt)}
                </span>
              </span>
              {doc.contentPreview ? (
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {doc.contentPreview}
                </p>
              ) : null}
              {source ? (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {docSourceLabel(source)}
                </p>
              ) : null}
            </span>
          </ListRow>
        );
      })}
    </div>
  );
}
