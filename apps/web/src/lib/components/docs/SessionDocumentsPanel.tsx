"use client";

import { useState } from "react";
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
import type { ChatSourceArg } from "@/lib/components/sandbox/chatSource";
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

/**
 * Sandbox-pane list of documents linked to this chat. The same rows appear in
 * the repo Documents sidebar (with a source badge). Here, rows and "New" open
 * an inline editor so notes are written without leaving the chat.
 */
export function SessionDocumentsPanel({ source }: { source: ChatSourceArg }) {
  const { docs, documentCount } = useSourceDocuments(source);
  const { repoId, basePath } = useRepo();
  const { openId, openRow, open, close } = useSourcePanelItem(docs);
  const logEntries = useChatLog(source);
  const createDoc = useCreateDoc();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  if (openId === CHAT_LOG_PANEL_ITEM) {
    return (
      <ChatLogView source={source} entries={logEntries ?? []} onBack={close} />
    );
  }

  if (openRow) {
    return <SourceDocumentEditor doc={openRow} onBack={close} />;
  }

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
      <ChatLogRow
        entries={logEntries ?? []}
        onOpen={() => open(CHAT_LOG_PANEL_ITEM)}
      />
      <DocumentList
        docs={docs ?? []}
        onOpen={open}
        emptyDescription="Create a note for this chat, or ask the agent to write one. Documents also appear in the Documents sidebar."
      />
      <NewDocumentDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreate={handleCreate}
        placeholder="e.g., Notes"
      />
    </SessionSourcePane>
  );
}
