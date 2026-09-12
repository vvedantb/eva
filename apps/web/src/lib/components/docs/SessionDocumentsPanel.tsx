"use client";

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";
import { IconArrowUpRight } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import {
  SessionSourcePane,
  sessionSourceViewAllClass,
} from "@/lib/components/sandbox/SessionSourcePane";
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
    <SessionSourcePane
      countLabel={
        count === undefined
          ? "Documents"
          : count === 1
            ? "1 document"
            : `${count} documents`
      }
      viewAll={
        <Link
          to={toInternalRepoHref(`${basePath}/docs`)}
          search={(prev) => prev}
          className={sessionSourceViewAllClass}
        >
          View all
          <IconArrowUpRight size={14} />
        </Link>
      }
      loading={docs === undefined}
    >
      <DocumentList
        docs={docs ?? []}
        basePath={basePath}
        showSource={false}
        emptyDescription="Documents created in this chat appear here and in the Documents sidebar."
      />
    </SessionSourcePane>
  );
}
