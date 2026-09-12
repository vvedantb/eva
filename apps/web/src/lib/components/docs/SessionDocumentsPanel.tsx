"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Skeleton } from "@eva/ui";
import { IconArrowUpRight } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { DocumentList } from "./DocumentList";

export type DocSourceArg =
  | { kind: "session"; sessionId: Id<"sessions"> }
  | { kind: "task"; taskId: Id<"agentTasks"> }
  | { kind: "project"; projectId: Id<"projects"> };

/** Documents created from this session / task / project chat. */
export function useSourceDocuments(source: DocSourceArg) {
  const docs = useQuery(api.docs.listForSource, { source });
  return {
    docs,
    hasDocuments: docs !== undefined && docs.length > 0,
  };
}

/**
 * Sandbox-pane list of documents generated in this chat. The same rows appear
 * in the repo Documents sidebar; cards open that viewer so both surfaces stay
 * one object.
 */
export function SessionDocumentsPanel({ source }: { source: DocSourceArg }) {
  const { docs } = useSourceDocuments(source);
  const { basePath } = useRepo();
  const count = docs?.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {count === undefined
            ? "Documents"
            : count === 1
              ? "1 document"
              : `${count} documents`}
        </p>
        <Link
          to={toInternalRepoHref(`${basePath}/docs`)}
          search={(prev) => prev}
          className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View all
          <IconArrowUpRight size={14} />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {docs === undefined ? (
          <div
            className="flex flex-col gap-1"
            aria-busy="true"
            aria-label="Loading documents"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-surface" />
            ))}
          </div>
        ) : (
          <DocumentList
            docs={docs}
            basePath={basePath}
            showSource={false}
            emptyDescription="Documents created in this chat with create_eva_doc appear here and in the Documents sidebar."
          />
        )}
      </div>
    </div>
  );
}
