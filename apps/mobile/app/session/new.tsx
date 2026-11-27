import {
  api,
  getAIModelProvider,
  normalizeAIModel,
  resolveTraitsForDisplay,
  storedTraitsFromRepoDefaults,
  type AIModel,
  type Id,
  type StoredModelTraits,
} from "@eva/backend";
import { carriedAccountForProvider, defaultAccountForProvider, toPickerAccounts } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared/gitDefaults";
import { useUser } from "@clerk/expo";
import { IconBrandGithub, IconChevronDown, IconStack2 } from "@tabler/icons-react-native";
import { PromptInput } from "@vvedantb/native-ui/ai";
import { RouterStackPageHeader } from "@vvedantb/native-ui/expo-router";
import { CenteredSpinner, EmptyState, KeyboardAvoidingView } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";
import { AttachButton } from "@/chat/AttachButton";
import { BaseBranchChip } from "@/chat/BranchChips";
import { ComposerFooter, composerHeader } from "@/chat/ComposerFooter";
import { MentionMenu } from "@/chat/MentionMenu";
import { ModelChip } from "@/chat/ModelChip";
import { ComposerSuggestions } from "@/chat/ComposerSuggestions";
import { useSkillSuggestions } from "@/chat/useSkillSuggestions";
import { useAttachments } from "@/chat/useAttachments";
import { useMentionComposer } from "@/chat/useMentionComposer";
import { jsonParser, persistedStore } from "@/storage/persistedStore";
import { RepoLogo } from "@/ui/RepoLogo";
import { rememberRepo, repoName, RepoSheet, useLastRepoId } from "@/ui/RepoPicker";
import { useScheme } from "@/ui/theme";

const newSessionDrafts = persistedStore<string | null>("newSessionDraft", null, jsonParser(z.string()));

/**
 * A new session, as the web sessions landing (`NewSessionComposer`): "Sam,
 * what are we building for <repo ⌄>?" over the composer, and under it the
 * web footer: base branch, stash and model (with its account), and the web `@` / `/` picker. Sends with those picks
 * (`mobile.startSession`), then opens the chat in place of this screen, so
 * Back from the chat does not return to a sent form. `?repo=<id>` (a Sessions
 * group "+", as the web group "+" opens that repo's composer) picks the repo
 * first; without it, or for a repo not in the list, the first repo. The repo
 * picker is the bottom sheet the other repo pickers use, in place of the web
 * dropdown. `?stackOn=<n>&stackBase=<branch>` (a pull request's "Stack a new
 * session") starts from that branch, and while it stays picked the session's
 * pull request joins that one's stack ("Stacks on #n"), as the web composer.
 */
export default function NewSessionScreen() {
  const router = useRouter();
  const { repo: repoParam, stackOn, stackBase } = useLocalSearchParams<{ repo?: string; stackOn?: string; stackBase?: string }>();
  const scheme = useScheme();
  const { user } = useUser();
  const repos = useQuery(api.githubRepos.list, {});
  const startSession = useMutation(api.chats.start);
  const attachments = useAttachments();
  const [picked, setPicked] = useState<Id<"githubRepos"> | null>(null);
  const [pickingRepo, setPickingRepo] = useState(false);
  const [sending, setSending] = useState(false);
  const [pickedModel, setPickedModel] = useState<AIModel | null>(null);
  const [pickedTraits, setPickedTraits] = useState<StoredModelTraits>({});
  const [pickedBranch, setPickedBranch] = useState<{ repoId: Id<"githubRepos">; branch: string } | null>(null);
  const [pickedAccount, setPickedAccount] = useState<Id<"userProviderAccounts"> | null | undefined>(undefined);
  const accounts = toPickerAccounts(useQuery(api.userProviderAccounts.listSelectable, {}) ?? []);
  const lastRepoId = useLastRepoId();
  const repo = repos?.find((candidate) => candidate._id === (picked ?? repoParam ?? lastRepoId)) ?? repos?.[0];
  const firstName = user?.firstName?.trim();
  const foreground = EVA_THEME[scheme].foreground;
  const muted = EVA_THEME[scheme].mutedForeground;

  const model = pickedModel ?? normalizeAIModel(repo?.defaultModel);
  const traits: StoredModelTraits = { ...(repo ? storedTraitsFromRepoDefaults(repo) : {}), ...pickedTraits };
  const stack =
    repo !== undefined && repo._id === repoParam && stackBase !== undefined && Number.isInteger(Number(stackOn))
      ? { prNumber: Number(stackOn), base: stackBase }
      : null;
  const baseBranch =
    repo && pickedBranch?.repoId === repo._id
      ? pickedBranch.branch
      : (stack?.base ?? repo?.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH);
  const stackOnPrNumber = stack !== null && baseBranch === stack.base ? stack.prNumber : undefined;
  // The prompt draft is kept per repo on the device, as the web's `new-session-composer`;
  // model and traits start from the repo defaults each visit, as on the web.
  const savedDraft = newSessionDrafts.useValue(repo?._id ?? "");
  const composer = useMentionComposer(repo?._id, getAIModelProvider(model), (tokenized) => {
    if (repo) newSessionDrafts.set(repo._id, tokenized);
  });
  const suggestions = useSkillSuggestions(composer.skills, composer.text);
  // A repo's saved draft goes into the composer when the repo changes, or when it finishes loading into an empty one.
  const [shownDraft, setShownDraft] = useState<{ repoId: string; loaded: boolean } | null>(null);
  if (repo && (shownDraft?.repoId !== repo._id || (!shownDraft.loaded && savedDraft !== null && composer.text === ""))) {
    setShownDraft({ repoId: repo._id, loaded: savedDraft !== null });
    composer.load(savedDraft ?? "");
  }
  const providerAccountId = pickedAccount === undefined ? defaultAccountForProvider(accounts, getAIModelProvider(model)) : pickedAccount;

  const handleSend = async (prompt: string) => {
    if (!repo || sending) return;
    if (attachments.uploading) {
      toast.error("Wait for the attachments to upload");
      return;
    }
    setSending(true);
    try {
      const display = resolveTraitsForDisplay(model, traits);
      const { sessionId } = await startSession({
        repoId: repo._id,
        prompt: composer.tokenize(prompt),
        attachmentStorageIds: attachments.storageIds,
        model,
        baseBranch,
        stackOnPrNumber,
        reasoningLevel: display.effortLevel,
        thinkingEnabled: display.thinkingEnabled,
        use1mContext: display.use1mContext,
        fastMode: display.fastMode,
        providerAccountId,
      });
      router.replace({ pathname: "/chat/[target]", params: { target: sessionId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create session");
      setSending(false);
    }
  };

  return (
    <View className="flex-1">
      <RouterStackPageHeader title="New session" fallbackHref="/sessions" />
      {repos === undefined ? (
        <CenteredSpinner label="Loading repos" />
      ) : repos.length === 0 ? (
        <EmptyState icon={IconBrandGithub} title="No repos" description="Connect a repo on the web. It shows up here." />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }}>
        <View className="flex-1 justify-center gap-3 pl-4 pr-[26px]">
          <View className="flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <Text className="font-instrument-sans-semibold text-xl" style={{ color: foreground, fontWeight: "600", letterSpacing: -0.5 }}>
              {firstName ? `${firstName}, what are we building for` : "What are we building for"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Repo: ${repo ? repoName(repo) : "none"}`}
              accessibilityState={{ expanded: pickingRepo }}
              onPress={() => setPickingRepo(true)}
              hitSlop={{ top: 8, bottom: 8 }}
              className="max-w-full flex-row items-center gap-1.5 active:opacity-70"
            >
              <RepoLogo logoUrl={repo?.logoUrl} size={28} fallback={<IconBrandGithub size={28} color={muted} />} />
              <Text
                numberOfLines={1}
                className="font-instrument-sans-semibold min-w-0 shrink text-xl"
                style={{
                  color: foreground,
                  fontWeight: "600",
                  letterSpacing: -0.5,
                  textDecorationLine: "underline",
                  textDecorationColor: withAlpha(foreground, 0.3),
                }}
              >
                {repo ? repoName(repo) : "a repo"}
              </Text>
              <IconChevronDown size={16} color={foreground} />
            </Pressable>
            <RepoSheet open={pickingRepo} onOpenChange={setPickingRepo} repos={repos} value={repo} onChange={(repoId) => {
                setPicked(repoId);
                rememberRepo(repoId);
              }} />
            <Text className="font-instrument-sans-semibold text-xl" style={{ color: foreground, fontWeight: "600", letterSpacing: -0.5 }}>
              ?
            </Text>
          </View>
          <ComposerSuggestions
            onPaste={() => void attachments.paste()}
            skills={suggestions.chips}
            onPickSkill={(item) => {
              composer.insertSkill(item);
              suggestions.dismiss(item.id);
            }}
          />
          <PromptInput
            layout="inline"
            shape="pill"
            disabled={!repo || sending}
            status={sending ? "submitted" : "ready"}
            value={composer.text}
            onChangeText={(next) => {
              composer.setText(next);
              suggestions.noteDraft(next);
            }}
            menu={composer.menu ? <MentionMenu menu={composer.menu} onPick={composer.pick} onDismiss={composer.dismiss} /> : null}
            onSubmit={(prompt) => void handleSend(prompt)}
            placeholder="Ask Eva anything..."
            onPasteImages={attachments.pasteFiles}
            leading={
              <AttachButton attachments={attachments} />
            }
            header={composerHeader(attachments, composer)}
            footer={
              repo ? (
                <ComposerFooter
                  repoId={repo._id}
                  composer={composer}
                attachments={attachments}
                  leading={
                    <>
                      <BaseBranchChip
                        repoId={repo._id}
                        value={baseBranch}
                        onChange={(branch) => setPickedBranch({ repoId: repo._id, branch })}
                        disabled={sending}
                      />
                      {stackOnPrNumber === undefined ? null : (
                        <View className="flex-row items-center gap-1 pr-1">
                          <IconStack2 size={13} color={muted} />
                          <Text className="font-instrument-sans text-xs" style={{ color: muted }}>{`Stacks on #${stackOnPrNumber}`}</Text>
                        </View>
                      )}
                    </>
                  }
                  model={
                    <ModelChip
                      repoId={repo._id}
                      model={model}
                      traits={traits}
                      onModelChange={(next) => {
                        setPickedModel(next);
                        if (pickedAccount !== undefined) setPickedAccount(carriedAccountForProvider(accounts, pickedAccount, getAIModelProvider(next)));
                      }}
                      account={{ accounts, value: providerAccountId, onChange: setPickedAccount }}
                      onTraitsChange={(partial) => setPickedTraits((current) => ({ ...current, ...partial }))}
                    />
                  }
                />
              ) : null
            }
          />
        </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}
