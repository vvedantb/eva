"use client";

import { useMutation } from "convex/react";
import { api, type Id, type SandboxOwner } from "@eva/backend";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import { catchMutationError } from "@/lib/utils/mutationToast";
import {
  useSandboxAnnotationSend,
  type SandboxChatBinding,
} from "@/lib/components/chat/sandboxChatBinding";
import { sandboxChatKeys } from "@/lib/components/chat/sandboxChatTurn";
import { useSandboxPreview } from "./useSandboxPreview";
import { useSubagentRoster } from "./useSubagentRoster";

/**
 * What every sandbox rail reads (session, quick task, project, a project's
 * task pane): the owner's view state, the preview, the chat its preview
 * annotations and review comments go to, and the Agents roster. `paneSlots`
 * spreads into `SandboxPaneSlots`; the host adds its tab, panes and the
 * props only it knows.
 *
 * `active` false (a hidden cached session shell) skips the live reads and
 * holds what was last painted.
 */
export function useSandboxRail({
  owner,
  sandboxId,
  isActive,
  repoId,
  devPort,
  devCommand,
  binding,
  active = true,
}: {
  owner: SandboxOwner;
  sandboxId: string | undefined;
  isActive: boolean;
  repoId: Id<"githubRepos">;
  devPort: number | undefined;
  devCommand: string | undefined;
  /** The chat this sandbox belongs to. */
  binding: SandboxChatBinding;
  active?: boolean;
}) {
  const viewState = useHeldQuery(
    api.sandboxPanes.getViewState,
    active ? { owner } : "skip",
  );
  const releaseBrowserLock = useMutation(api.sandboxPanes.releaseBrowserLock);
  const preview = useSandboxPreview({
    owner,
    sandboxId,
    isActive,
    isRouteActive: active,
    repoId,
    devPort,
  });
  const annotation = useSandboxAnnotationSend(binding);
  const roster = useSubagentRoster({ binding, sandboxRunning: isActive });
  const { draftTarget } = sandboxChatKeys(binding.entity);

  return {
    preview,
    roster,
    /** Review comments go to this chat's draft (`ReviewChatTargetProvider`). */
    reviewTarget: draftTarget ?? null,
    agentBrowsingAt: viewState?.agentBrowsingAt,
    paneSlots: {
      owner,
      sandboxId,
      isActive,
      repoId,
      devCommand,
      preview,
      viewState,
      annotation,
      agentBrowsingAt: viewState?.agentBrowsingAt,
      onReleaseBrowserLock: () =>
        void catchMutationError(
          releaseBrowserLock({ owner }),
          "Couldn't unlock browser",
          "sandbox-browser-unlock",
        ).catch(() => undefined),
      // The backend starts the app in the Console tmux session after startup.
      runConsoleDevCommandOnConnect: false,
      onScreen: active,
    },
  };
}
