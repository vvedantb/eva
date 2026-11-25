"use client";

import { useQueryState } from "nuqs";
import type { Id } from "@eva/backend";
import { ReplyThreadView } from "@/lib/components/chat/replies/ReplyThreadView";
import { sandboxChatKeys } from "@/lib/components/chat/sandboxChatTurn";
import type { OwnedSession } from "@/lib/components/sandbox/useOwnedSession";
import { useRepo } from "@/lib/contexts/RepoContext";
import { replyThreadParser } from "@/lib/search-params";
import { useProjectChatBinding } from "./ProjectSandboxChatPanel";

/** The open reply thread (`?thread=`) of a project's coordinator chat, if any. */
export function useOpenReplyThread(): string | null {
  const [threadId] = useQueryState("thread", replyThreadParser);
  return threadId;
}

/**
 * The project Sandbox view's right panel while a reply thread is open, Slack
 * style: the thread beside the coordinator chat, on the same card surface the
 * Tasks panel sits on. ✕ (or Escape) clears `?thread=`, which brings the
 * Tasks panel back.
 */
export function ProjectReplyThreadPanel({
  projectId,
  projectSession,
  threadId,
}: {
  projectId: Id<"projects">;
  projectSession: OwnedSession;
  threadId: string;
}) {
  const [, setThreadId] = useQueryState("thread", replyThreadParser);
  const { repo, basePath } = useRepo();
  const binding = useProjectChatBinding(projectId, projectSession);
  const { parentId } = sandboxChatKeys(binding.entity);

  return (
    <div className="h-full min-h-0 md:py-2 md:pr-1.5">
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card md:rounded-surface">
        {parentId ? (
          <ReplyThreadView
            rootId={threadId}
            chatParentId={parentId}
            repo={{ id: repo._id, basePath }}
            model={binding.model}
            onOpen={(rootId) => void setThreadId(rootId)}
            // Replace, so Back does not reopen the thread.
            onClose={() => void setThreadId(null, { history: "replace" })}
          />
        ) : null}
      </div>
    </div>
  );
}
