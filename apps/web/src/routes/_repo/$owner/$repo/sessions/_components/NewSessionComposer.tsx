"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useUser } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import {
  api,
  normalizeAIModel,
  storedTraitsFromRepoDefaults,
  type Id,
} from "@eva/backend";
import { toast } from "@eva/ui";
import { BranchSelect } from "@/lib/components/BranchSelect";
import { ChatComposer } from "@/lib/components/chat/ChatComposer";
import { tokenizedToEditable } from "@/lib/components/mentions";
import { useRepo } from "@/lib/contexts/RepoContext";
import {
  useAvailableAiModels,
  useProviderAccounts,
} from "@/lib/hooks/useAvailableAiModels";
import { useBaseBranchState } from "@/lib/hooks/useBaseBranchState";
import { useNewSessionComposerState } from "@/lib/hooks/useNewSessionComposerState";
import {
  defaultProviderAccountId,
  providerAccountIdForModel,
} from "@/lib/utils/defaultProviderAccount";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { CodebasesPicker, useCodebasesSelection } from "./CodebasesPicker";

/**
 * Shared landing composer for repo home and `/sessions`: branding + prompt,
 * base-branch picker under the composer, create with the first message, then
 * navigate while the sandbox boots.
 */
export function NewSessionComposer() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { repo, basePath } = useRepo();
  const firstName = user?.firstName?.trim();
  const createSession = useMutation(api.sessions.create);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { baseBranch, setBaseBranch } = useBaseBranchState();
  const codebases = useCodebasesSelection();

  const defaultModel = normalizeAIModel(repo.defaultModel);
  const {
    draft: draftTokenized,
    model,
    setModel,
    displayTraits,
    executionTraits,
    onTraitsChange,
    providerAccountId,
    setProviderAccountId,
    setDraft,
    clearDraft,
  } = useNewSessionComposerState(
    repo._id,
    defaultModel,
    storedTraitsFromRepoDefaults(repo),
  );
  const {
    displayText: draftDisplay,
    mentionMap: draftMentionMap,
    skillMap: draftSkillMap,
  } = tokenizedToEditable(draftTokenized);

  const { options: modelOptions } = useAvailableAiModels(repo._id, model);
  const {
    options: accounts,
    resolveId: resolveAccountId,
    ready: accountsReady,
  } = useProviderAccounts();
  const [accountDefaulted, setAccountDefaulted] = useState(false);

  // Default the account once the provider list is ready, but only when the
  // stored pick does not resolve to an OWN account — a saved own pick must
  // survive a reload, while a stored shared id is re-defaulted (an earlier bug
  // auto-saved teammates' shared accounts here, and a shared account is an
  // explicit per-visit choice, never a persisted default). Runs in an effect
  // because setProviderAccountId writes to localStorage, which dispatches a
  // sync event — doing that during render triggers React's
  // event-handler-in-render error.
  /* eslint-disable no-effect/no-event-handler, no-effect/no-chain-state-updates --
     See the comment above: setProviderAccountId writes localStorage and
     dispatches a sync event, which React forbids during render. */
  useEffect(() => {
    if (accountsReady && !accountDefaulted) {
      const storedResolvesToOwn = accounts.some(
        (account) => account.id === providerAccountId && account.isOwn,
      );
      if (!storedResolvesToOwn) {
        setProviderAccountId(defaultProviderAccountId(accounts, model));
      }
      setAccountDefaulted(true);
    }
  }, [
    accountsReady,
    accountDefaulted,
    accounts,
    model,
    providerAccountId,
    setProviderAccountId,
  ]);
  /* eslint-enable no-effect/no-event-handler, no-effect/no-chain-state-updates */

  const handleSend = async (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
  ) => {
    setIsSubmitting(true);
    // Resolved before the try: React Compiler bails on the whole file when a
    // nullish-coalescing expression sits inside a try/catch.
    const accountId = resolveAccountId(providerAccountId) ?? null;
    // Only sent when the codebases picker actually links other repos — an
    // empty array would still be a meaningful signal server-side.
    const linkedCodebases =
      codebases.linkedRepoIds.length > 0
        ? {
            linkedRepoIds: codebases.linkedRepoIds,
            repoGroupId: codebases.repoGroupId ?? undefined,
            installDependencies: codebases.installDependencies,
          }
        : {};
    try {
      const { numId } = await createSession({
        repoId: repo._id,
        message: content,
        model,
        baseBranch,
        ...executionTraits,
        // Snapshot resolved display traits (including model defaults) so the
        // new session's sticky Convex fields match the landing composer.
        reasoningLevel: displayTraits.effortLevel,
        thinkingEnabled: displayTraits.thinkingEnabled,
        use1mContext: displayTraits.use1mContext,
        fastMode: displayTraits.fastMode,
        providerAccountId: accountId,
        attachmentStorageIds,
        ...linkedCodebases,
      });
      clearDraft();
      // The codebases selection is query-string state, and this navigation
      // already drops it. Clearing it here queued a nuqs URL write instead:
      // nuqs flushes on a later tick, through an adapter that navigates to the
      // pathname captured when it rendered — the composer's own. That flush
      // landed after this navigation and replaced the new session's URL with
      // the composer again, so hitting send looked like it did nothing.
      await navigate({
        to: toInternalRepoHref(`${basePath}/sessions/${numId}`),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Couldn't create session";
      toast.error(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-4 sm:p-6">
      <div className="flex w-full max-w-2xl flex-col gap-3">
        <h1 className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          <span>
            {firstName ? (
              <>
                <span data-pii>{firstName}</span>, what are we building for
              </>
            ) : (
              "What are we building for"
            )}
          </span>
          <CodebasesPicker />
          <span>?</span>
        </h1>
        <ChatComposer
          repoId={repo._id}
          repoBasePath={basePath}
          conversationId={`new-session-${repo._id}`}
          queuedMessages={[]}
          messageHistory={[]}
          isExecuting={false}
          isInputDisabled={isSubmitting}
          placeholder="Ask Eva anything... / for skills · @ to mention"
          model={model}
          setModel={(next) => {
            setModel(next);
            setProviderAccountId(
              providerAccountIdForModel(accounts, providerAccountId, next),
            );
          }}
          modelOptions={modelOptions}
          accounts={accounts}
          accountId={providerAccountId}
          onAccountChange={setProviderAccountId}
          displayTraits={displayTraits}
          onTraitsChange={onTraitsChange}
          onSend={handleSend}
          onCancel={async () => {}}
          localDraft={{
            initialDisplay: draftDisplay,
            mentionMap: draftMentionMap,
            skillMap: draftSkillMap,
            onSave: setDraft,
          }}
          underCardLeading={
            <BranchSelect
              value={baseBranch}
              onValueChange={setBaseBranch}
              placeholder="Select a branch"
              className="h-7 w-auto max-w-full justify-start border-0 bg-transparent px-2 text-xs font-normal text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
              disabled={isSubmitting}
            />
          }
        />
      </div>
    </div>
  );
}
