"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { Skeleton } from "@eva/ui";
import { IconArrowUpRight, IconFile } from "@tabler/icons-react";
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <IconFile size={16} className="shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-medium">Documents</p>
        </div>
        <Link
          to={toInternalRepoHref(`${basePath}/docs`)}
          search={(prev) => prev}
          className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          All documents
          <IconArrowUpRight size={14} />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 sm:px-4">
        {docs === undefined ? (
          <div
            className="flex flex-col gap-2"
            aria-busy="true"
            aria-label="Loading documents"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-surface" />
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
