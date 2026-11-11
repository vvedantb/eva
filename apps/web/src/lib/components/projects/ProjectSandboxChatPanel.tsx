"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
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
import { patchLoadedQuery } from "@vvedantb/server";
import { openChatTurnOptimistically } from "@/lib/components/chat/useChatTurnOpen";
import {
  SandboxChatPanel,
  type SandboxChatPanelProps,
} from "@/lib/components/chat/SandboxChatPanel";
import type { SandboxChatBinding } from "@/lib/components/chat/sandboxChatBinding";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  useAvailableAiModels,
  useProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { projectStoredTraits, useSetProjectTraits } from "./useProjectTraits";
import { useUpdateProject } from "./useUpdateProject";

type ProjectChatProject = FunctionReturnType<typeof api.projects.get>;

export function ProjectSandboxChatPanel({
  projectId,
  ...panel
}: SandboxChatPanelProps & { projectId: Id<"projects"> }) {
  const binding = useProjectChatBinding(projectId);
  return <SandboxChatPanel binding={binding} {...panel} />;
}

/**
 * The project side of the sandbox chat. The chat model is `lastChatModel`
 * (sticky), distinct from the project's build model. A teammate sees the
 * owner's sticky account as an extra, read-only picker row.
 */
export function useProjectChatBinding(
  projectId: Id<"projects">,
): SandboxChatBinding {
  const { repo } = useRepo();
  const project = useQuery(api.projects.get, { id: projectId });

  const addMessage = useMutation(api.projectChatWorkflow.addMessage);
  const startExecute = useMutation(
    api.projectChatWorkflow.startExecute,
  ).withOptimisticUpdate((localStore, args) =>
    openChatTurnOptimistically(localStore, args.projectId),
  );
  const enqueueMessage = useMutation(api.projectChatWorkflow.enqueueMessage);
  const cancelExecution = useMutation(api.projectChatWorkflow.cancelExecution);
  const prewarmChatDaemonNow = useAction(
    api.projectChatWorkflow.prewarmChatDaemonNow,
  );
  const updateProject = useUpdateProject(projectId);
  const setChatModel = useMutation(
    api.projects.setChatModel,
  ).withOptimisticUpdate((localStore, args) => {
    patchLoadedQuery(
      localStore,
      api.projects.get,
      { id: args.id },
      (current) => current && { ...current, lastChatModel: args.model },
    );
  });
  const setTraits = useSetProjectTraits(projectId);

  const model = projectChatModel(project, repo.defaultModel);
  const storedTraits = projectStoredTraits(project);
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
  const pickerAccounts =
    isOwner || !providerAccountId
      ? accounts
      : [
          {
            id: providerAccountId,
            provider: getAIModelProvider(model),
            label: projectOwnerAccountLabel(ownerProfile),
            // The project owner's account, shown to a collaborator: theirs, not
            // the viewer's, so it must never be defaulted to.
            isOwn: false,
          },
          ...accounts,
        ];

  return {
    entity: { kind: "project", projectId },
    doc: project,
    intendedBranch: project?.branchName,
    model,
    setModel: (next) => {
      void setChatModel({ id: projectId, model: normalizeAIModel(next) });
    },
    modelOptions,
    displayTraits: resolveTraitsForDisplay(model, storedTraits),
    executionTraits: buildTraitsExecutionPayload(model, storedTraits),
    onTraitsChange: setTraits,
    providerAccountId,
    accounts,
    pickerAccounts,
    resolveAccountId,
    isOwner,
    persistAccount: (next) =>
      updateProject({ id: projectId, providerAccountId: next }),
    prewarm: () => prewarmChatDaemonNow({ projectId }),
    ports: {
      add: (args) => addMessage({ projectId, ...args }),
      start: (args) => startExecute({ projectId, ...args }),
      enqueue: (args) => enqueueMessage({ projectId, ...args }),
    },
    cancel: () => cancelExecution({ projectId }),
  };
}

// Sandbox chat model is `lastChatModel` (sticky); falls back to metadata
// `model` then repo default. Distinct from projects.model build prefs.
function projectChatModel(
  project: ProjectChatProject | undefined,
  repoDefaultModel: string | undefined,
): AIModel {
  const defaultModel = normalizeAIModel(repoDefaultModel ?? DEFAULT_AI_MODEL);
  return normalizeAIModel(
    project?.lastChatModel ?? project?.model ?? defaultModel,
  );
}

function projectOwnerAccountLabel(
  ownerProfile: FunctionReturnType<typeof api.users.get> | undefined,
): string {
  return (
    ownerProfile?.firstName?.trim() ||
    ownerProfile?.fullName?.trim() ||
    "Personal"
  );
}
