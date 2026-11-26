import { api } from "@eva/backend";
import { toast } from "@vvedantb/ui";
import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { useRepo } from "@/lib/contexts/RepoContext";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import {
  buildPlanImplementationPrompt,
  buildPlanImplementationThreadTitle,
} from "@eva/shared/proposedPlan";
import type { ProposedPlanRow } from "@eva/shared/proposedPlan";
import {
  newSessionSettings,
  type SandboxChatBinding,
} from "@/lib/components/chat/sandboxChatBinding";
import type { ChatTurnSendOptions } from "@/lib/components/chat/useChatSend";

/** Puts the implementation prompt in the chat: a send, or a seeded draft. */
type PlanSend = (
  content: string,
  attachmentStorageIds?: undefined,
  options?: ChatTurnSendOptions,
) => void | Promise<void>;

/**
 * Implements a proposed plan in this chat, or in a new session that inherits
 * the chat's model, traits and account (`binding`).
 */
export function useSessionPlanImplementation(binding: SandboxChatBinding) {
  const { repo, basePath } = useRepo();
  const navigate = useNavigate();
  const createSession = useMutation(api.sessions.create);
  const markPlanImplemented = useMutation(api.proposedPlans.markImplemented);
  const updatePlanContent = useMutation(api.sessions.updatePlanContent);

  const implementPlan = (plan: ProposedPlanRow, send: PlanSend) => {
    void send(buildPlanImplementationPrompt(plan.planMarkdown), undefined, {
      sourceProposedPlanId: plan._id,
    });
  };

  const implementPlanContent = (markdown: string, send: PlanSend) => {
    void send(buildPlanImplementationPrompt(markdown));
  };

  const implementInNewSession = async (
    planMarkdown: string,
    plan?: ProposedPlanRow,
  ) => {
    // Built above the `try` so the block holds no expression-level control
    // flow — React Compiler bails on the whole file otherwise.
    const settings = newSessionSettings(binding);
    try {
      const { sessionId: nextSessionId, numId } = await createSession({
        repoId: repo._id,
        title: buildPlanImplementationThreadTitle(planMarkdown),
        message: buildPlanImplementationPrompt(planMarkdown),
        ...settings,
      });
      await updatePlanContent({
        id: nextSessionId,
        planContent: planMarkdown,
      });
      if (plan) {
        await markPlanImplemented({
          planId: plan._id,
          implementationSessionId: nextSessionId,
        });
      }
      await navigate({
        to: toInternalRepoHref(`${basePath}/sessions/${numId}`),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't start new session",
      );
    }
  };

  return {
    implementPlan,
    implementPlanContent,
    implementInNewSession,
  };
}
