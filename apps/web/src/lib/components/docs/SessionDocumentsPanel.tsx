"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { IconPlus } from "@tabler/icons-react";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import {
  SessionSourcePane,
  sessionSourceViewAllClass,
  useSourcePanelItem,
} from "@/lib/components/sandbox/SessionSourcePane";
import type {
  ChatSource,
  ChatSourceArg,
} from "@/lib/components/sandbox/chatSource";
import { ChatSourceLink } from "@/lib/components/sandbox/ChatSourceBadge";
import { DocumentList } from "./DocumentList";
import { NewDocumentDialog } from "./NewDocumentDialog";
import { SourceDocumentEditor } from "./SourceDocumentEditor";
import { useCreateDoc } from "./useCreateDoc";
import { CHAT_LOG_PANEL_ITEM } from "@/lib/search-params";
import { ChatLogRow } from "./chatLog/ChatLogRow";
import { ChatLogView } from "./chatLog/ChatLogView";
import { useChatLog } from "./chatLog/useChatLog";

/** Documents created from this session / task / project chat. */
export function useSourceDocuments(source: ChatSourceArg) {
  const docs = useQuery(api.docs.listForSource, { source });
  return { docs, documentCount: docs?.length };
}

/** A project's Documents tab: its summary and the child tasks it rolls up. */
export interface ProjectDocumentsContext {
  summaryDocId: string | undefined;
  counts: ReactNode;
  taskSource: (taskId: string) => ChatSource | undefined;
}

export function SessionDocumentsPanel({
  source,
  project,
}: {
  source: ChatSourceArg;
  project?: ProjectDocumentsContext;
}) {
  const { docs, documentCount } = useSourceDocuments(source);
  const { repoId, basePath } = useRepo();
  const { openId, openRow, open, close } = useSourcePanelItem(docs);
  const logEntries = useChatLog(source);
  const createDoc = useCreateDoc();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  if (openId === CHAT_LOG_PANEL_ITEM) {
    const taskSourceOf = project?.taskSource;
    return (
      <ChatLogView
        source={source}
        entries={logEntries ?? []}
        onBack={close}
        entrySource={
          taskSourceOf
            ? (entry) => {
                const task = entry.sourceTaskId
                  ? taskSourceOf(entry.sourceTaskId)
                  : undefined;
                return task ? (
                  <ChatSourceLink source={task} sandboxTab="documents" />
                ) : null;
              }
            : undefined
        }
      />
    );
  }

  if (openRow) {
    return (
      <SourceDocumentEditor
        doc={openRow}
        onBack={close}
        header={
          openRow._id === project?.summaryDocId ? project.counts : undefined
        }
      />
    );
  }

  const summaryDoc = project?.summaryDocId
    ? docs?.find((doc) => doc._id === project.summaryDocId)
    : undefined;
  const otherDocs = (docs ?? []).filter((doc) => doc !== summaryDoc);

  const handleCreate = async (title: string) => {
    const created = await createDoc({ repoId, title, content: "", source });
    if (!created) return false;
    setIsCreateOpen(false);
    open(created._id);
    return true;
  };

  return (
    <SessionSourcePane
      title="Documents"
      count={documentCount}
      viewAllHref={toInternalRepoHref(`${basePath}/docs`)}
      actions={
        <button
          type="button"
          aria-label="New document"
          title="New document"
          className={sessionSourceViewAllClass}
          onClick={() => setIsCreateOpen(true)}
        >
          <IconPlus size={14} />
          New
        </button>
      }
      loading={docs === undefined || logEntries === undefined}
    >
      {summaryDoc ? (
        <>
          <div className="px-3 pt-3">{project?.counts}</div>
          <DocumentList docs={[summaryDoc]} onOpen={open} emptyDescription="" />
        </>
      ) : null}
      <ChatLogRow
        entries={logEntries ?? []}
        onOpen={() => open(CHAT_LOG_PANEL_ITEM)}
      />
      {summaryDoc && otherDocs.length === 0 ? null : (
        <DocumentList
          docs={otherDocs}
          onOpen={open}
          showTaskSource={project !== undefined}
          emptyDescription="Create a note for this chat, or ask the agent to write one. Documents also appear in the Documents sidebar."
        />
      )}
      <NewDocumentDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreate={handleCreate}
        placeholder="e.g., Notes"
      />
    </SessionSourcePane>
  );
}
