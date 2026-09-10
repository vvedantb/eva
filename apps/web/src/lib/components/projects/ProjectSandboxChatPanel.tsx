"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction, useMutation } from "convex/react";
import {
  api,
  buildTraitsExecutionPayload,
  DEFAULT_AI_MODEL,
  getAIModelProvider,
  normalizeAIModel,
  resolveTraitsForDisplay,
  type AIModel,
  type Id,
} from "@eva/backend";
import { ChatBody } from "@/lib/components/chat/ChatBody";
import { isAssistantTurnInProgress } from "@/lib/components/chat/chatBodyUtils";
import { useChatDraftSeed } from "@/lib/components/chat/useChatDraftSeed";
import { SandboxChatHeaderActions } from "@/lib/components/sandbox/SandboxStartStopButton";
import { SandboxChatPreInput } from "@/lib/components/chat/SandboxChatPreInput";
import type { SandboxChatSurface } from "@/lib/components/chat/sandboxChatSurface";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  useAvailableAiModels,
  useProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { useProviderAccountHandoff } from "@/lib/hooks/useProviderAccountHandoff";
import { projectStoredTraits, useSetProjectTraits } from "./useProjectTraits";
import { useUpdateProject } from "./useUpdateProject";

interface ProjectSandboxChatPanelProps {
  projectId: Id<"projects">;
  isSandboxActive: boolean;
  isSandboxToggling?: boolean;
  /** Opens the Files tab and loads this sandbox path in the file viewer. */
  onOpenFile?: (path: string) => void;
  /** Opens the Agents sandbox tab (used by the sub-agent CTA row in the chat). */
  onOpenAgentsTab?: () => void;
  onSandboxToggle?: (action: "start" | "stop") => void;
}

export function ProjectSandboxChatPanel({
  projectId,
  isSandboxActive,
  isSandboxToggling = false,
  onOpenFile,
  onOpenAgentsTab,
  onSandboxToggle,
}: ProjectSandboxChatPanelProps) {
  const { repo, basePath } = useRepo();
  const project = useQuery(api.projects.get, { id: projectId });
  const messages = useQuery(api.messages.listByParent, { parentId: projectId });
  const queuedMessages = useQuery(api.queuedMessages.listByParent, {
    parentId: projectId,
  });
  const streaming = useQuery(api.streaming.get, {
    entityId: `project-chat-${projectId}`,
  });

  const addMessage = useMutation(api.projectChatWorkflow.addMessage);
  const startExecute = useMutation(api.projectChatWorkflow.startExecute);
  const enqueueMessage = useMutation(api.projectChatWorkflow.enqueueMessage);
  const cancelExecution = useMutation(api.projectChatWorkflow.cancelExecution);
  const prewarmChatDaemonNow = useAction(
    api.projectChatWorkflow.prewarmChatDaemonNow,
  );
  const updateProject = useUpdateProject(projectId);
  const { isSwitchingAccount, switchProviderAccount } =
    useProviderAccountHandoff({
      persist: (providerAccountId) =>
        updateProject({ id: projectId, providerAccountId }),
      prewarm: () => prewarmChatDaemonNow({ projectId }),
    });
  const setChatModelMutation = useMutation(
    api.projects.setChatModel,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.projects.get, { id: args.id });
    if (!current) return;
    localStore.setQuery(
      api.projects.get,
      { id: args.id },
      { ...current, lastChatModel: args.model },
    );
  });
  const setTraits = useSetProjectTraits(projectId);

  const defaultModel = normalizeAIModel(repo.defaultModel ?? DEFAULT_AI_MODEL);
  // Sandbox chat model is `lastChatModel` (sticky); falls back to metadata
  // `model` then repo default. Distinct from projects.model build prefs.
  const model = normalizeAIModel(
    project?.lastChatModel ?? project?.model ?? defaultModel,
  );
  const storedTraits = projectStoredTraits(project);
  const displayTraits = resolveTraitsForDisplay(model, storedTraits);
  const executionTraits = buildTraitsExecutionPayload(model, storedTraits);
  const providerAccountId = project?.providerAccountId ?? null;
  const { options: modelOptions } = useAvailableAiModels(repo._id, model);
  const { options: accounts, resolveId: resolveAccountId } =
    useProviderAccounts();
  const currentUserId = useQuery(api.auth.me);
  const isOwner =
    currentUserId !== undefined &&
    project?.userId !== undefined &&
    currentUserId === project.userId;
  const ownerProfile = useQuery(
    api.users.get,
    project?.userId ? { id: project.userId } : "skip",
  );
  const ownerAccountLabel =
    ownerProfile?.firstName?.trim() ||
    ownerProfile?.fullName?.trim() ||
    "Personal";
  const displayAccounts =
    isOwner || !providerAccountId
      ? accounts
      : [
          {
            id: providerAccountId,
            provider: getAIModelProvider(model),
            label: ownerAccountLabel,
            // The project owner's account, shown to a collaborator: theirs, not
            // the viewer's, so it must never be defaulted to.
            isOwn: false,
          },
          ...accounts,
        ];
  const usageAccountLabel =
    providerAccountId === null
      ? "Team"
      : (displayAccounts.find((account) => account.id === providerAccountId)
          ?.label ?? "Selected account");

  const draftSeed = useChatDraftSeed({
    kind: "projectChat" as const,
    projectId,
  });
  const draftBundle = draftSeed.isReady
    ? {
        target: { kind: "projectChat" as const, projectId },
        initialDisplay: draftSeed.initialDisplay,
        mentionMap: draftSeed.mentionMap,
        skillMap: draftSeed.skillMap,
      }
    : undefined;

  // Same entityId the project-chat sandbox posts with (project id, not stream prefix).
  const activeQuestion = useQuery(api.pendingQuestions.getActive, {
    entityId: projectId,
  });
  const answerPendingQuestion = useMutation(api.pendingQuestions.answer);
  const handleAnswerBlockingQuestion = async (
    toolUseId: string,
    answers: Record<string, string>,
  ) => {
    await answerPendingQuestion({
      entityId: projectId,
      toolUseId,
      answer: JSON.stringify(answers),
    });
  };

  const setModel = (next: AIModel) => {
    void setChatModelMutation({
      id: projectId,
      model: normalizeAIModel(next),
    });
  };

  const setProviderAccountId = (next: string | null) => {
    if (!isOwner) return;
    switchProviderAccount(resolveAccountId(next) ?? null);
  };

  // Server flag first; the message-shape fallback is the shared helper so a
  // finished-but-empty bubble or a trailing system alert cannot pin the
  // composer in "working" mode (same rule as useSessionSend).
  const isExecuting =
    Boolean(project?.activeChatWorkflowId) ||
    isAssistantTurnInProgress(messages ?? []);

  const handleSend = async (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
  ) => {
    if (isExecuting) {
      await enqueueMessage({
        projectId,
        message: content,
        model,
        ...executionTraits,
        reasoningLevel:
          displayTraits.effortLevel ?? executionTraits.reasoningLevel,
        providerAccountId: resolveAccountId(providerAccountId),
        attachmentStorageIds,
      });
      return;
    }
    const accountId = resolveAccountId(providerAccountId);
    try {
      await addMessage({
        projectId,
        content,
        attachmentStorageIds,
        providerAccountId: accountId,
        model,
        reasoningLevel: displayTraits.effortLevel,
      });
      await startExecute({
        projectId,
        message: content,
        model,
        ...executionTraits,
        providerAccountId: accountId,
      });
    } catch (error) {
      // Surface the failure in chat — a thrown startExecute rolls back the
      // whole turn (no placeholder, no workflow), so without this the send
      // silently vanishes (same contract as useSessionSend).
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send message";
      await addMessage({
        projectId,
        role: "assistant",
        content: `Error: ${errorMessage}`,
      });
    }
  };

  const handleCancel = async () => {
    await cancelExecution({ projectId });
  };

  const chatSurface: SandboxChatSurface = {
    entity: { kind: "project", projectId },
    repoId: repo._id,
    model,
    isExecuting,
    isReadOnly: false,
    // A stopped sandbox cannot run `/compact`, so it counts as read-only here.
    compactionReadOnly: !isSandboxActive,
    backgroundAgents: project?.backgroundAgents,
    // Owner-only, like the account picker: project chat is owner-sticky. The
    // account list is `accounts`, not `displayAccounts` — the synthetic owner
    // row exists only for non-owners, who never see the card.
    usageLimitRecovery:
      isOwner && project
        ? {
            messages: messages ?? [],
            accounts,
            resolveAccountId,
            currentAccountId: project.providerAccountId ?? null,
            onSwitchAccount: switchProviderAccount,
            isSandboxActive,
          }
        : undefined,
    // No review-comment append on this send path (sessions-only), so a slash
    // command already reaches the harness verbatim.
    onSendCommand: (command) => {
      void handleSend(command);
    },
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <SandboxChatHeaderActions
        repoId={repo._id}
        isSandboxActive={isSandboxActive}
        isSandboxToggling={isSandboxToggling}
        onSandboxToggle={onSandboxToggle}
        isAssistantResponding={isExecuting}
        model={model}
        providerAccountId={providerAccountId}
        usageAccountLabel={usageAccountLabel}
      />
      <ChatBody
        repoId={repo._id}
        repoBasePath={basePath}
        conversationId={projectId}
        messages={messages ?? []}
        queuedMessages={queuedMessages ?? []}
        streamingActivity={streaming?.currentActivity}
        streamingContent={streaming?.currentContent}
        streamingPendingQuestion={streaming?.pendingQuestion}
        blockingQuestion={activeQuestion ?? undefined}
        onAnswerBlockingQuestion={handleAnswerBlockingQuestion}
        isExecuting={isExecuting}
        isInputDisabled={!isSandboxActive || isSwitchingAccount}
        placeholder={
          !isSandboxActive
            ? "Wake Eva up to chat..."
            : isSwitchingAccount
              ? "Switching Claude account..."
              : "Ask Eva anything... / for skills · @ to mention"
        }
        emptyStateTitle={
          isSandboxActive
            ? "Ask Eva anything about this project's running sandbox."
            : "Wake Eva up to begin chatting."
        }
        model={model}
        setModel={setModel}
        modelOptions={modelOptions}
        accounts={displayAccounts}
        accountId={providerAccountId}
        onAccountChange={setProviderAccountId}
        displayTraits={displayTraits}
        onTraitsChange={setTraits}
        onSend={handleSend}
        onCancel={handleCancel}
        preInputContent={<SandboxChatPreInput surface={chatSurface} />}
        draft={draftBundle}
        isDraftLoading={!draftSeed.isReady}
        onOpenFile={onOpenFile}
        onOpenAgentsTab={onOpenAgentsTab}
        backgroundAgents={project?.backgroundAgents}
        sandboxRunning={isSandboxActive}
      />
    </div>
  );
}
