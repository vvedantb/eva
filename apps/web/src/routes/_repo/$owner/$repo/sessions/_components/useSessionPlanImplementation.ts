import { api, normalizeAIModel, type Id } from "@eva/backend";
import { toast } from "@eva/ui";
import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useSessionModel } from "@/lib/hooks/useSessionModel";
import { useSessionSettings } from "@/lib/hooks/useSessionSettings";
import { useSessionOwnerProviderAccounts } from "@/lib/hooks/useAvailableAiModels";
import {
  buildPlanImplementationPrompt,
  buildPlanImplementationThreadTitle,
} from "./planExport";
import type { ProposedPlanRow } from "./proposedPlanLogic";
import type { SessionSendOptions } from "./useSessionSend";

export function useSessionPlanImplementation({
  sessionId,
  handleSend,
}: {
  sessionId: Id<"sessions">;
  handleSend: (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
    options?: SessionSendOptions,
  ) => void | Promise<void>;
}) {
  const { repo, basePath } = useRepo();
  const navigate = useNavigate();
  const defaultModel = normalizeAIModel(repo.defaultModel);
  const { resolveId: resolveAccountId } =
    useSessionOwnerProviderAccounts(sessionId);
  const { model, traits, providerAccountId: stickyProviderAccountId } =
    useSessionModel(sessionId, defaultModel);
  const { displayTraits, executionTraits, providerAccountId } =
    useSessionSettings({
      defaultModel,
      model,
      traits,
      providerAccountId: stickyProviderAccountId,
    });
  const createSession = useMutation(api.sessions.create);
  const markPlanImplemented = useMutation(api.proposedPlans.markImplemented);
  const updatePlanContent = useMutation(api.sessions.updatePlanContent);

  const implementPlan = (plan: ProposedPlanRow) => {
    void handleSend(buildPlanImplementationPrompt(plan.planMarkdown), undefined, {
      sourceProposedPlanId: plan._id,
    });
  };

  const implementPlanContent = (markdown: string) => {
    void handleSend(buildPlanImplementationPrompt(markdown));
  };

  const implementInNewSession = async (
    planMarkdown: string,
    plan?: ProposedPlanRow,
  ) => {
    // Resolved above the `try` so the block holds no expression-level control
    // flow — React Compiler bails on the whole file otherwise.
    const resolvedProviderAccountId =
      resolveAccountId(providerAccountId) ?? null;
    try {
      const { sessionId: nextSessionId, numId } = await createSession({
        repoId: repo._id,
        title: buildPlanImplementationThreadTitle(planMarkdown),
        message: buildPlanImplementationPrompt(planMarkdown),
        model,
        ...executionTraits,
        reasoningLevel: displayTraits.effortLevel,
        thinkingEnabled: displayTraits.thinkingEnabled,
        use1mContext: displayTraits.use1mContext,
        fastMode: displayTraits.fastMode,
        providerAccountId: resolvedProviderAccountId,
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
      await navigate({ to: `${basePath}/sessions/${numId}` });
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
