"use client";

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryStates } from "nuqs";
import { useUser } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import {
  api,
  normalizeAIModel,
  storedTraitsFromRepoDefaults,
  type Id,
} from "@eva/backend";
import { toast } from "@vvedantb/ui";
import { IconStack2 } from "@tabler/icons-react";
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
import { stackBaseParser, stackOnPrParser } from "@/lib/search-params";
import { CodebasesPicker, useCodebasesSelection } from "./CodebasesPicker";
import { EvaSetupCard } from "./EvaSetupCard";
import { ComposerActionCards } from "./ComposerActionCards";

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
  const [stack] = useQueryStates({
    stackOn: stackOnPrParser,
    stackBase: stackBaseParser,
  });
  const stackBase = stack.stackOn === null ? null : stack.stackBase;
  const { baseBranch, setBaseBranch } = useBaseBranchState(
    stackBase ?? undefined,
  );
  const stackOnPrNumber =
    stackBase !== null && baseBranch === stackBase ? stack.stackOn : null;
  const codebases = useCodebasesSelection();

  const defaultModel = normalizeAIModel(repo.defaultModel);
  const {
    draft: draftTokenized,
    model,
    setModel,
    displayTraits,
    executionTraits,
    onTraitsChange,
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
  const { options: accounts, resolveId: resolveAccountId } =
    useProviderAccounts();
  const [pickedAccountId, setPickedAccountId] = useState<
    string | null | undefined
  >(undefined);
  const providerAccountId =
    pickedAccountId === undefined
      ? defaultProviderAccountId(accounts, model)
      : pickedAccountId;

  const handleSend = async (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
  ) => {
    setIsSubmitting(true);
    const accountId = resolveAccountId(providerAccountId) ?? null;
    const linkedCodebases =
      codebases.linkedRepoIds.length > 0
        ? {
            linkedRepoIds: codebases.linkedRepoIds,
            repoGroupId: codebases.repoGroupId ?? undefined,
            installDependencies: codebases.installDependencies,
          }
        : {};
    const stackArgs = stackOnPrNumber === null ? {} : { stackOnPrNumber };
    try {
      const { numId } = await createSession({
        repoId: repo._id,
        message: content,
        model,
        baseBranch,
        ...executionTraits,
        reasoningLevel: displayTraits.effortLevel,
        thinkingEnabled: displayTraits.thinkingEnabled,
        use1mContext: displayTraits.use1mContext,
        fastMode: displayTraits.fastMode,
        providerAccountId: accountId,
        attachmentStorageIds,
        ...linkedCodebases,
        ...stackArgs,
      });
      clearDraft();
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
    <div className="relative isolate flex h-full items-center justify-center p-4 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="eva-blob -top-[25%] -right-[15%] [--eva-blob-path:eva-blob-a] [--eva-blob-tone:var(--eva-brand-blue)]" />
        <div className="eva-blob top-[5%] -left-[20%] [--eva-blob-path:eva-blob-b] [--eva-blob-tone:var(--eva-brand-purple)]" />
        <div className="eva-blob -top-[30%] left-[20%] [--eva-blob-duration:9s] [--eva-blob-path:eva-blob-c] [--eva-blob-tone:var(--chart-5)]" />
      </div>
      <div className="flex w-full max-w-2xl flex-col gap-3">
        <EvaSetupCard />
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
          repo={{ id: repo._id, basePath }}
          conversationId={`new-session-${repo._id}`}
          queuedMessages={[]}
          messageHistory={[]}
          isExecuting={false}
          isInputDisabled={isSubmitting}
          placeholder="Ask Eva anything... / for skills · @ to mention"
          modelPicker={{
            model,
            setModel: (next) => {
              setModel(next);
              if (pickedAccountId !== undefined) {
                setPickedAccountId(
                  providerAccountIdForModel(accounts, pickedAccountId, next),
                );
              }
            },
            modelOptions,
            accounts,
            accountId: providerAccountId,
            onAccountChange: setPickedAccountId,
            displayTraits,
            onTraitsChange,
          }}
          onSend={handleSend}
          onCancel={async () => {}}
          localDraft={{
            initialDisplay: draftDisplay,
            mentionMap: draftMentionMap,
            skillMap: draftSkillMap,
            onSave: setDraft,
          }}
          underCardLeading={
            <span className="inline-flex max-w-full min-w-0 items-center gap-1">
              <BranchSelect
                value={baseBranch}
                onValueChange={setBaseBranch}
                placeholder="Select a branch"
                className="h-7 w-auto max-w-full min-w-0 shrink justify-start border-0 bg-transparent px-2 text-xs font-normal text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                disabled={isSubmitting}
              />
              {stackOnPrNumber === null ? null : (
                <span className="flex shrink-0 items-center gap-1 pr-1 text-xs whitespace-nowrap text-muted-foreground">
                  <IconStack2 size={13} aria-hidden />
                  Stacks on #{stackOnPrNumber}
                </span>
              )}
            </span>
          }
        />
        <ComposerActionCards />
      </div>
    </div>
  );
}
