"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import {
  api,
  buildTraitsExecutionPayload,
  resolveTraitsForDisplay,
  type Id,
} from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  openChatTurnOptimistically,
  useChatTurnOpen,
} from "@/lib/components/chat/useChatTurnOpen";
import { isChatTurnExecuting } from "@/lib/components/chat/chatBodyUtils";
import {
  annotationSender,
  type AnnotationSubmit,
} from "@/lib/components/sandbox/annotationSend";
import {
  projectChatModel,
  useProjectChatAccounts,
} from "./ProjectSandboxChatPanel";
import { projectStoredTraits } from "./useProjectTraits";

/**
 * Project twin of `useSessionAnnotationSend`: sends a preview annotation as
 * chat display text + rich agent prompt into the project chat. Queues with
 * displayContent when a turn is running.
 */
export function useProjectAnnotationSend(
  projectId: Id<"projects">,
): AnnotationSubmit {
  const { repo } = useRepo();
  const project = useQuery(api.projects.get, { id: projectId });
  const model = projectChatModel(project, repo.defaultModel);
  const storedTraits = projectStoredTraits(project);
  const displayTraits = resolveTraitsForDisplay(model, storedTraits);
  const executionTraits = buildTraitsExecutionPayload(model, storedTraits);
  const { providerAccountId, resolveAccountId } = useProjectChatAccounts(
    repo._id,
    project,
    model,
  );
  const messages = useQuery(api.messages.listByParent, { parentId: projectId });
  const turnOpen = useChatTurnOpen(projectId);
  const isExecuting = isChatTurnExecuting({ turnOpen, messages });

  const addMessage = useMutation(api.projectChatWorkflow.addMessage);
  const startExecute = useMutation(
    api.projectChatWorkflow.startExecute,
  ).withOptimisticUpdate((localStore, args) =>
    openChatTurnOptimistically(localStore, args.projectId),
  );
  const enqueueMessage = useMutation(api.projectChatWorkflow.enqueueMessage);

  return annotationSender({
    isExecuting,
    enqueue: (display, full) =>
      enqueueMessage({
        projectId,
        message: full,
        displayContent: display,
        model,
        ...executionTraits,
        reasoningLevel:
          displayTraits.effortLevel ?? executionTraits.reasoningLevel,
        providerAccountId: resolveAccountId(providerAccountId),
      }),
    send: async (display, full) => {
      const accountId = resolveAccountId(providerAccountId);
      await Promise.all([
        addMessage({
          projectId,
          content: display,
          providerAccountId: accountId,
          model,
          reasoningLevel: displayTraits.effortLevel,
        }),
        startExecute({
          projectId,
          message: full,
          model,
          ...executionTraits,
          providerAccountId: accountId,
        }),
      ]);
    },
    postError: (content) =>
      addMessage({ projectId, role: "assistant", content }),
  });
}
