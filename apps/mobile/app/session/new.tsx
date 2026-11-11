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
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared/gitDefaults";
import { useUser } from "@clerk/clerk-expo";
import { IconBrandGithub, IconChevronDown, IconStack2 } from "@tabler/icons-react-native";
import { PromptInput } from "@vvedantb/native-ui/ai";
import { RouterStackPageHeader } from "@vvedantb/native-ui/expo-router";
import { CenteredSpinner, EmptyState } from "@vvedantb/native-ui/primitives";
import { tokens, withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AttachButton } from "@/chat/AttachButton";
import { BaseBranchChip } from "@/chat/BranchChips";
import { ComposerFooter, ComposerHeader } from "@/chat/ComposerFooter";
import { MentionMenu } from "@/chat/MentionMenu";
import { ModelChip } from "@/chat/ModelChip";
import { useAttachments } from "@/chat/useAttachments";
import { useMentionComposer } from "@/chat/useMentionComposer";
import { RepoLogo } from "@/ui/RepoLogo";
import { repoName, RepoSheet } from "@/ui/RepoPicker";
import { useScheme } from "@/ui/theme";

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
  const startSession = useMutation(api.mobile.startSession);
  const attachments = useAttachments();
  const [picked, setPicked] = useState<Id<"githubRepos"> | null>(null);
  const [pickingRepo, setPickingRepo] = useState(false);
  const [sending, setSending] = useState(false);
  // The web landing: model and traits start from the repo defaults, a pick
  // overrides them; the base branch re-seeds to each repo's own default
  // (`useBaseBranchState`), so it is kept with the repo it was picked for.
  const [pickedModel, setPickedModel] = useState<AIModel | null>(null);
  const [pickedTraits, setPickedTraits] = useState<StoredModelTraits>({});
  const [pickedBranch, setPickedBranch] = useState<{ repoId: Id<"githubRepos">; branch: string } | null>(null);
  // The web landing's account: undefined follows the user's own account for
  // the model's provider (else Team), a pick holds; null is Team.
  const [pickedAccount, setPickedAccount] = useState<Id<"userProviderAccounts"> | null | undefined>(undefined);
  const accounts = toPickerAccounts(useQuery(api.userProviderAccounts.listSelectable, {}) ?? []);
  const repo = repos?.find((candidate) => candidate._id === (picked ?? repoParam)) ?? repos?.[0];
  const firstName = user?.firstName?.trim();
  const foreground = tokens.color.foreground[scheme];
  const muted = tokens.color.muted[scheme];

  const model = pickedModel ?? normalizeAIModel(repo?.defaultModel);
  const traits: StoredModelTraits = { ...(repo ? storedTraitsFromRepoDefaults(repo) : {}), ...pickedTraits };
  // The stack belongs to the repo it was opened for.
  const stack =
    repo !== undefined && repo._id === repoParam && stackBase !== undefined && Number.isInteger(Number(stackOn))
      ? { prNumber: Number(stackOn), base: stackBase }
      : null;
  const baseBranch =
    repo && pickedBranch?.repoId === repo._id
      ? pickedBranch.branch
      : (stack?.base ?? repo?.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH);
  // Picking another branch abandons the stack: the session's PR would no longer sit on that pull request.
  const stackOnPrNumber = stack !== null && baseBranch === stack.base ? stack.prNumber : undefined;
  const composer = useMentionComposer(repo?._id, getAIModelProvider(model));
  const providerAccountId = pickedAccount === undefined ? defaultAccountForProvider(accounts, getAIModelProvider(model)) : pickedAccount;

  const handleSend = async (prompt: string) => {
    if (!repo || sending) return;
    if (attachments.uploading) {
      toast.error("Wait for the attachments to upload");
      return;
    }
    setSending(true);
    try {
      // The resolved traits (model defaults included), as the web snapshots them.
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
        // As the new quick task screen.
        <EmptyState icon={IconBrandGithub} title="No repos" description="Connect a repo on the web. It shows up here." />
      ) : (
        // The web landing at 390: `p-4` in a column 10 short of the right edge.
        <View className="flex-1 justify-center gap-3 pl-4 pr-[26px]">
          {/* Web: text-xl semibold tracking-tight, centred, the repo picker inline (logo or GitHub mark, name underlined at 30%). */}
          <View className="flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <Text className="font-instrument-sans-semibold text-xl" style={{ color: foreground, fontWeight: "600", letterSpacing: -0.5 }}>
              {firstName ? `${firstName}, what are we building for` : "What are we building for"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Repo: ${repo ? repoName(repo) : "none"}`}
              accessibilityState={{ expanded: pickingRepo }}
              onPress={() => setPickingRepo(true)}
              // The headline keeps its 28 line; the slop makes the target 44.
              hitSlop={{ top: 8, bottom: 8 }}
              // `max-w-full` and a shrinking name: a long repo name (GitHub allows 100 characters) truncates on its own line.
              className="max-w-full flex-row items-center gap-1.5 active:opacity-70"
            >
              {/* The web `CodebasesPicker`: the logo at 28, else the GitHub mark. */}
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
            <RepoSheet open={pickingRepo} onOpenChange={setPickingRepo} repos={repos} value={repo} onChange={setPicked} />
            <Text className="font-instrument-sans-semibold text-xl" style={{ color: foreground, fontWeight: "600", letterSpacing: -0.5 }}>
              ?
            </Text>
          </View>
          <PromptInput
            layout="inline"
            shape="pill"
            disabled={!repo || sending}
            status={sending ? "submitted" : "ready"}
            value={composer.text}
            onChangeText={composer.setText}
            menu={composer.menu ? <MentionMenu menu={composer.menu} onPick={composer.pick} /> : null}
            onSubmit={(prompt) => void handleSend(prompt)}
            placeholder="Ask Eva anything..."
            leading={
              <AttachButton onPress={() => void attachments.pick()} />
            }
            header={<ComposerHeader attachments={attachments} composer={composer} />}
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
                        // An explicit account survives a switch within its provider, as the web.
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
      )}
    </View>
  );
}
