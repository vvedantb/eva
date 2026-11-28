import { api, type Doc } from "@eva/backend";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { toast } from "@vvedantb/ui";
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
import { SessionChatFrame } from "./_components/SessionChatFrame";
import { useSessionPlanImplementation } from "./_components/useSessionPlanImplementation";
import { useSessionPlanDocument } from "./_components/useSessionPlanDocument";
import { useSessionChatBinding } from "./_components/useSessionChatBinding";

interface ChatPanelProps {
  session: Doc<"sessions">;
  chat: Doc<"sessionChats">;
  sandboxStartupActivity?: string;
  isSandboxActive: boolean;
  isSandboxToggling: boolean;
  isSandboxStopping: boolean;
  onSandboxToggle: (action: "start" | "stop") => void;
  isArchived: boolean;
  onOpenFile?: (path: string) => void;
  onViewDiff?: (repoRelativePath?: string) => void;
  onOpenAgentsTab?: () => void;
  isRouteActive: boolean;
}

/**
 * A session's chat: the shared sandbox chat (`SandboxChatPanel`) on a
 * session binding, plus what only a session has — its header,
 * read-only banner, proposed plans, fork, checkpoints, publish recovery and
 * background processes.
 */
export function ChatPanel({
  session,
  chat,
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
  const createSession = useMutation(api.chats.start);
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
        prompt: input.prompt,
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
      afterMessage={(messageId, state) => {
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
