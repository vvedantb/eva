import {
  api,
  normalizeAIModel,
  storedTraitsFromRepoDefaults,
  type AIModel,
  type Id,
  type StoredModelTraits,
} from "@eva/backend";
import { draftPrompt, TASK_TAGS, type Priority } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared/gitDefaults";
import { Attachment, Attachments } from "@vvedantb/native-ui/ai";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import { Button, CenteredSpinner, EmptyState, KeyboardAvoidingView } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FunctionReturnType } from "convex/server";
import { AttachButton } from "@/chat/AttachButton";
import { BaseBranchChip } from "@/chat/BranchChips";
import { useSimpleView } from "@/chat/ComposerFooter";
import { useAttachments } from "@/chat/useAttachments";
import { ModelChip } from "@/chat/ModelChip";
import { DraftsMenu, type QuickTaskDraft } from "@/quickTasks/DraftsMenu";
import { OptionPillFrame, PriorityChip, ProjectChip, ReviewerChip, TagsChip } from "@/quickTasks/OptionChips";
import { rememberRepo, RepoPicker, useLastRepoId } from "@/ui/RepoPicker";
import { useScheme } from "@/ui/theme";

type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];

/**
 * A new quick task, as the web `QuickTaskModal` on a phone: a full screen in
 * place of the dialog. The repo (the web takes it from the page), one prompt
 * ("Describe the task…"; the server titles the task from it), then the web
 * option chips, each opening a bottom sheet: priority, code reviewer, model
 * and traits, base branch (locked to the project's when a project is
 * picked), tags and project. "Save" and "Save and Run" sit at the bottom in
 * thumb reach and call the web's `agentTasks.createQuickTask`: "Save" files
 * the task in To Do (a project task waits in Triage), "Save and Run" (`run`)
 * starts it (a project task is approved, so the project's scheduler runs
 * it). The screen then goes back to the list, as the dialog closes (to Quick
 * Tasks after a deep link). Files attach with the chat's picker
 * (`AttachButton`).
 *
 * Drafts are the web's: leaving with a prompt saves one
 * (`agentTasks.saveDraft`, as the dialog's close), and "Drafts (N)" beside
 * the buttons lists the repo's saved drafts, from any device, to load or
 * delete. Either button on a loaded draft promotes it
 * (`agentTasks.activateDraft`). A link with `draftId` (a Drafts card) opens
 * with that draft loaded, as the web Drafts page opens the dialog with
 * `?draft=`.
 *
 * Not here from the web dialog: voice input, @ mentions and /
 * skills, the readiness check, the provider account (the server picks the
 * creator's own, as the web default), "New project..." and the keyboard
 * shortcut (Return is a newline, as the phone's session composer).
 */
export default function NewQuickTaskScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ repoId?: string; projectId?: string; draftId?: string }>();
  const leave = () => goBackOrReplace(router, "/sessions?section=quick-tasks");
  const repos = useQuery(api.githubRepos.list, {});
  const lastRepoId = useLastRepoId();
  const first =
    repos?.find((candidate) => candidate._id === params.repoId) ?? repos?.find((candidate) => candidate._id === lastRepoId) ?? repos?.[0];
  // The linked draft, once the repo's drafts are in; a removed one opens a blank form.
  const linkedDrafts = useQuery(api.agentTasks.listDrafts, params.draftId && first ? { repoId: first._id } : "skip");
  const initialDraft = linkedDrafts?.find((draft) => draft._id === params.draftId);
  if (repos === undefined || (params.draftId && first && linkedDrafts === undefined)) {
    return <Screen onBack={leave}><CenteredSpinner label="Loading repos" /></Screen>;
  }
  if (!first) {
    return (
      <Screen onBack={leave}>
        <EmptyState title="No repos" description="Connect a repo on the web. It shows up here." />
      </Screen>
    );
  }
  return <NewQuickTaskForm repos={repos} initialRepo={first} projectParam={params.projectId} initialDraft={initialDraft} onLeave={leave} />;
}

function NewQuickTaskForm({
  repos,
  initialRepo,
  projectParam,
  initialDraft,
  onLeave: leave,
}: {
  repos: Repo[];
  initialRepo: Repo;
  projectParam: string | undefined;
  initialDraft: QuickTaskDraft | undefined;
  onLeave: () => void;
}) {
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const insets = useSafeAreaInsets();
  const simpleView = useSimpleView();
  const [picked, setPicked] = useState<Id<"githubRepos">>(initialRepo._id);
  const repo = repos.find((candidate) => candidate._id === picked) ?? initialRepo;
  const repoArgs = { repoId: repo._id };
  const tasks = useQuery(api.agentTasks.getAllTasks, repoArgs);
  const projects = useQuery(api.projects.list, repoArgs);
  const users = useQuery(api.users.listAll, {});
  const createQuickTask = useMutation(api.agentTasks.createQuickTask);
  const saveDraft = useMutation(api.agentTasks.saveDraft);
  const activateDraft = useMutation(api.agentTasks.activateDraft);
  const drafts = useQuery(api.agentTasks.listDrafts, repoArgs);
  const navigation = useNavigation();

  // The one prompt: the task's description, and its title once the server takes the first line.
  const [prompt, setPrompt] = useState(initialDraft ? draftPrompt(initialDraft) : "");
  const [priority, setPriority] = useState<Priority | undefined>(undefined);
  const [assignedTo, setAssignedTo] = useState<Id<"users"> | undefined>(undefined);
  const [tags, setTags] = useState<string[]>(initialDraft?.tags ?? []);
  const attachments = useAttachments();
  // A pick wins; until then, the link's project once the repo's projects resolve it (route params are strings).
  const [pickedProject, setPickedProject] = useState<{ id: Id<"projects"> | undefined } | null>(
    initialDraft ? { id: initialDraft.projectId } : null,
  );
  const projectId = pickedProject ? pickedProject.id : projects?.find((candidate) => candidate._id === projectParam)?._id;
  const setProjectId = (id: Id<"projects"> | undefined) => setPickedProject({ id });
  // As the new-session screen: model and traits start from the repo defaults
  // and a pick overrides them; the base branch is kept with its repo.
  const [pickedModel, setPickedModel] = useState<AIModel | null>(null);
  const [pickedTraits, setPickedTraits] = useState<StoredModelTraits>({});
  const [pickedBranch, setPickedBranch] = useState<{ repoId: Id<"githubRepos">; branch: string } | null>(
    initialDraft?.baseBranch ? { repoId: initialRepo._id, branch: initialDraft.baseBranch } : null,
  );
  // Which button is saving, for its spinner; null when idle.
  const [saving, setSaving] = useState<"save" | "run" | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<Id<"agentTasks"> | null>(initialDraft?._id ?? null);

  // A task in a project takes the project's base branch (web `useEffectiveProject`).
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip");
  const model = pickedModel ?? normalizeAIModel(repo.defaultModel);
  const traits: StoredModelTraits = { ...storedTraitsFromRepoDefaults(repo), ...pickedTraits };
  const repoBranch = repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const baseBranch = pickedBranch?.repoId === repo._id ? pickedBranch.branch : repoBranch;
  const branchLocked = projectId !== undefined;
  const displayBranch = branchLocked ? (project?.baseBranch ?? repoBranch) : baseBranch;

  // The fields a draft keeps (the web `handleClose`), or null when there is nothing to keep.
  const draftToSave =
    saving === null && prompt.trim()
      ? {
          id: activeDraftId ?? undefined,
          repoId: repo._id,
          description: prompt.trim(),
          baseBranch: branchLocked ? undefined : baseBranch,
          projectId,
        }
      : null;
  // Leaving by any way (the header back, Android back, a swipe) saves the
  // draft, as the web dialog saves on close. An effect, because leaving is a
  // navigation event outside React. Create skips it: `saving` is set while
  // the task is made.
  useEffect(
    () =>
      navigation.addListener("beforeRemove", () => {
        if (draftToSave) saveDraft(draftToSave).catch(() => toast.error("Couldn't save draft"));
      }),
    [navigation, draftToSave, saveDraft],
  );

  // The web tag list: the stock tags and every tag on the repo's tasks. `sort` on a fresh array; Hermes lacks `toSorted`.
  const allTags = [...new Set([...TASK_TAGS, ...(tasks ?? []).flatMap((task) => task.tags ?? [])])].sort();
  const canSubmit = saving === null && prompt.trim().length > 0 && displayBranch.length > 0;

  const changeRepo = (repoId: Id<"githubRepos">) => {
    setPicked(repoId);
    rememberRepo(repoId);
    // A project belongs to one repo, and so does a draft: the next save starts a new one there.
    setProjectId(undefined);
    setActiveDraftId(null);
  };

  // The web `loadDraft`: its fields into the form; Create then promotes it.
  const loadDraft = (draft: QuickTaskDraft) => {
    setPrompt(draftPrompt(draft));
    setPickedBranch(draft.baseBranch ? { repoId: repo._id, branch: draft.baseBranch } : null);
    setActiveDraftId(draft._id);
    setProjectId(draft.projectId);
    setTags(draft.tags ?? []);
  };
  const resetForm = () => {
    setPrompt("");
    setPriority(undefined);
    setAssignedTo(undefined);
    setTags([]);
    setProjectId(undefined);
    setPickedModel(null);
    setPickedTraits({});
    setPickedBranch(null);
    setActiveDraftId(null);
    attachments.clear();
  };

  const submit = async (run: boolean) => {
    if (!canSubmit) return;
    if (attachments.uploading) {
      toast.error("Wait for the attachments to upload");
      return;
    }
    setSaving(run ? "run" : "save");
    const fields = {
      description: prompt.trim(),
      baseBranch: branchLocked ? undefined : baseBranch,
      model,
      reasoningLevel: traits.effortLevel,
      thinkingEnabled: traits.thinkingEnabled,
      use1mContext: traits.use1mContext,
      fastMode: traits.fastMode,
      tags: tags.length > 0 ? tags : undefined,
      assignedTo,
      attachmentStorageIds: attachments.storageIds.length > 0 ? attachments.storageIds : undefined,
      run,
    };
    try {
      // As the web: a loaded draft becomes the task (the draft keeps its project; priority is not a draft field).
      if (activeDraftId) await activateDraft({ id: activeDraftId, ...fields });
      else await createQuickTask({ repoId: repo._id, ...fields, projectId, priority });
      leave();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create task");
      setSaving(null);
    }
  };

  return (
    <Screen onBack={leave}>
      {/* The kit's: it pads frame by frame with the keyboard (`KeyboardControllerProvider`). */}
      <KeyboardAvoidingView style={{ flex: 1 }}>
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 4, paddingHorizontal: 16, paddingBottom: 16 }}>
          <RepoPicker repos={repos} value={repo} onChange={changeRepo} />
          {/* Web: one borderless prompt, min 160 high. */}
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe the task…"
            placeholderTextColor={theme.mutedForeground}
            accessibilityLabel="Describe the task"
            autoFocus
            multiline
            textAlignVertical="top"
            className="font-instrument-sans min-h-40 py-2 text-base"
            style={{ color: theme.foreground }}
          />
          {attachments.items.length > 0 ? (
            <Attachments>
              {attachments.items.map((item) => (
                <Attachment key={item.id} data={item} onRemove={() => attachments.remove(item.id)} />
              ))}
            </Attachments>
          ) : null}
          {/* Web: the chips wrap `gap-1.5`, in its order. */}
          <View className="flex-row flex-wrap items-center gap-1.5 pt-2">
            <AttachButton attachments={attachments} />
            <PriorityChip value={priority} onChange={setPriority} />
            <ReviewerChip users={users} value={assignedTo} onChange={setAssignedTo} />
            {simpleView ? null : (
              <OptionPillFrame>
                <ModelChip
                  repoId={repo._id}
                  model={model}
                  traits={traits}
                  onModelChange={setPickedModel}
                  onTraitsChange={(partial) => setPickedTraits((current) => ({ ...current, ...partial }))}
                />
              </OptionPillFrame>
            )}
            <OptionPillFrame>
              <BaseBranchChip
                repoId={repo._id}
                value={displayBranch}
                onChange={(branch) => setPickedBranch({ repoId: repo._id, branch })}
                disabled={branchLocked}
              />
            </OptionPillFrame>
            <TagsChip allTags={allTags} value={tags} onChange={setTags} />
            <ProjectChip projects={projects} value={projectId} onChange={setProjectId} />
          </View>
        </ScrollView>
        {/* Web footer: the Drafts menu on the start side, Save and Save and Run on the end. */}
        <View className="flex-row items-center gap-2 px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
          <DraftsMenu
            drafts={drafts}
            onLoad={loadDraft}
            onDeleted={(draftId) => {
              if (draftId === activeDraftId) resetForm();
            }}
          />
          <View className="min-w-0 flex-1">
            <Button variant="secondary" onPress={() => void submit(false)} disabled={!canSubmit} loading={saving === "save"}>
              Save
            </Button>
          </View>
          <View className="min-w-0 flex-1">
            <Button onPress={() => void submit(true)} disabled={!canSubmit} loading={saving === "run"}>
              Save and Run
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** The stack header ("New Quick Task", back) over the screen body. */
function Screen({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <View className="flex-1">
      <StackPageHeader title="New Quick Task" onBack={onBack} />
      {children}
    </View>
  );
}
