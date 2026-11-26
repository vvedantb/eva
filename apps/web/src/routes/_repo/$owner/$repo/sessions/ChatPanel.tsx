import { api, type Doc } from "@eva/backend";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "@vvedantb/ui";
import { waitingForSlotLabel } from "@eva/shared";
import { proposedPlanForMessage } from "@eva/shared/proposedPlan";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { SandboxChatPanel } from "@/lib/components/chat/SandboxChatPanel";
import { newSessionSettings } from "@/lib/components/chat/sandboxChatBinding";
import { BackgroundProcessesChip } from "./_components/BackgroundProcessesChip";
import { PublishRecoveryBanner } from "./_components/PublishRecoveryBanner";
import { ProposedPlanCard } from "./_components/ProposedPlanCard";
import {
  SessionChatFrame,
  type ChatTurnStatus,
} from "./_components/SessionChatFrame";
import { useSessionPlanImplementation } from "./_components/useSessionPlanImplementation";
import { useSessionPlanDocument } from "./_components/useSessionPlanDocument";
import { useSessionChatBinding } from "./_components/useSessionChatBinding";

interface ChatPanelProps {
  /** The session row; the header "…" menu reads its fields. */
  session: Doc<"sessions">;
  /** The chat tab this panel shows; the transcript, turn and model are its own. */
  chat: Doc<"sessionChats">;
  /** Every live chat of the session, for the tab strip. */
  chats: Doc<"sessionChats">[];
  /** Open turns across the session's chats (tab dots + the slot-wait caption). */
  chatStatuses: ChatTurnStatus[];
  onSelectChat: (chat: Doc<"sessionChats">) => void;
  onCreateChat: () => void;
  isCreatingChat: boolean;
  sandboxStartupActivity?: string;
  isSandboxActive: boolean;
  isSandboxToggling: boolean;
  /** True while status is stopping / stop mutation in flight — not a start. */
  isSandboxStopping: boolean;
  onSandboxToggle: (action: "start" | "stop") => void;
  /** Archived: hides the composer and shows the read-only banner. */
  isArchived: boolean;
  /** Opens a file (by full sandbox path) in the File Viewer tab. */
  onOpenFile?: (path: string) => void;
  /** Opens the Diffs tab; optional repo-relative path scrolls to that file. */
  onViewDiff?: (repoRelativePath?: string) => void;
  /** Opens the Agents sandbox tab (used by the sub-agent CTA row in the chat). */
  onOpenAgentsTab?: () => void;
  /**
   * False while this session shell is cached-hidden. Skips chat-local
   * subscriptions that would otherwise keep a background turn warm.
   */
  isRouteActive: boolean;
}

/**
 * A session chat tab: the shared sandbox chat (`SandboxChatPanel`) on a
 * session binding, plus what only a session has — its header, chat tabs,
 * read-only banner, proposed plans, fork, checkpoints, publish recovery and
 * background processes.
 */
export function ChatPanel({
  session,
  chat,
  chats,
  chatStatuses,
  onSelectChat,
  onCreateChat,
  isCreatingChat,
  sandboxStartupActivity,
  isSandboxActive,
  isSandboxToggling,
  isSandboxStopping,
  onSandboxToggle,
  isArchived,
  onOpenFile,
  onViewDiff,
  onOpenAgentsTab,
  isRouteActive,
}: ChatPanelProps) {
  const { repo, basePath } = useRepo();
  const sessionId = session._id;
  const navigate = useNavigate();
  const createSession = useMutation(api.sessions.create);
  const simpleView = useSimpleView();
  const binding = useSessionChatBinding({ session, chat, isRouteActive });

  const handleForkTranscript = async (input: {
    throughMessageId: string;
    title: string;
    prompt: string;
  }) => {
    const settings = newSessionSettings(binding);
    try {
      const { numId } = await createSession({
        repoId: repo._id,
        title: input.title,
        message: input.prompt,
        ...settings,
      });
      await navigate({
        to: toInternalRepoHref(`${basePath}/sessions/${numId}`),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Couldn't fork this chat";
      toast.error(message);
      throw error;
    }
  };

  const proposedPlans = useHeldQuery(
    api.proposedPlans.listBySession,
    isRouteActive ? { sessionId } : "skip",
  );
  const { implementPlan, implementInNewSession } =
    useSessionPlanImplementation(binding);
  const {
    savePlan,
    saveAsDocument,
    saveAsDocumentLabel,
    isSaving,
    isSavingDoc,
  } = useSessionPlanDocument(sessionId);
  const capturedPlans = proposedPlans ?? [];
  const runningChatCount = new Set(chatStatuses.map((status) => status.chatId))
    .size;

  return (
    <SandboxChatPanel
      binding={binding}
      isSandboxActive={isSandboxActive}
      isSandboxToggling={isSandboxToggling}
      isSandboxStopping={isSandboxStopping}
      sandboxStartupActivity={sandboxStartupActivity}
      onSandboxToggle={onSandboxToggle}
      isArchived={isArchived}
      onOpenFile={onOpenFile}
      onViewDiff={onViewDiff}
      onOpenAgentsTab={onOpenAgentsTab}
      onForkTranscript={handleForkTranscript}
      turnCheckpoint={isArchived ? undefined : { sessionId, repoId: repo._id }}
      frame={(body, state) => (
        <SessionChatFrame
          binding={binding}
          session={session}
          chatId={chat._id}
          state={state}
          chats={chats}
          chatStatuses={chatStatuses}
          onSelectChat={onSelectChat}
          onCreateChat={onCreateChat}
          isCreatingChat={isCreatingChat}
          isSandboxActive={isSandboxActive}
          isSandboxToggling={isSandboxToggling}
          onSandboxToggle={onSandboxToggle}
          isArchived={isArchived}
        >
          {body}
        </SessionChatFrame>
      )}
      beforeBanner={(state) =>
        isArchived ? null : (
          <PublishRecoveryBanner
            sessionId={sessionId}
            messages={state.messages ?? []}
            isSandboxActive={isSandboxActive}
          />
        )
      }
      statusChips={
        simpleView ? null : (
          <BackgroundProcessesChip
            sessionId={sessionId}
            isRouteActive={isRouteActive}
          />
        )
      }
      // Queued on this chat while the session's run slots are all taken: the
      // server parked the send instead of starting it (see `startExecute`).
      transcriptTail={(state) =>
        waitingForSlotLabel({
          isExecuting: state.isExecuting,
          queuedCount: state.queuedCount,
          runningChatCount,
        })
      }
      afterMessage={(messageId, state) => {
        // Only plans captured on a message render in the transcript, so a
        // plan stays where it was proposed. Unanchored plan content (Edit,
        // update_plan, a seeded implementation session) lives in the Plan tab.
        const plan = proposedPlanForMessage(capturedPlans, messageId);
        if (!plan) return null;
        const canImplement = !isArchived && plan.implementedAt === undefined;
        return (
          <ProposedPlanCard
            planMarkdown={plan.planMarkdown}
            implemented={plan.implementedAt !== undefined}
            onImplement={
              canImplement
                ? () => implementPlan(plan, state.handleSend)
                : undefined
            }
            onImplementInNewSession={
              canImplement
                ? () => void implementInNewSession(plan.planMarkdown, plan)
                : undefined
            }
            onSave={isArchived ? undefined : savePlan}
            onSaveAsDocument={isArchived ? undefined : saveAsDocument}
            saveAsDocumentLabel={saveAsDocumentLabel}
            isSaving={isSaving}
            isSavingDoc={isSavingDoc}
            isArchived={isArchived}
          />
        );
      }}
    />
  );
}
