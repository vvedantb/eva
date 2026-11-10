import {
  api,
  normalizeAIModel,
  storedTraitsFromRepoDefaults,
  type AIModel,
  type Id,
  type StoredModelTraits,
} from "@eva/backend";
import { TASK_TAGS, type Priority } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared/gitDefaults";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import { Button, CenteredSpinner, EmptyState } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BaseBranchChip } from "@/chat/BranchChips";
import { useSimpleView } from "@/chat/ComposerFooter";
import { ModelChip } from "@/chat/ModelChip";
import { OptionPillFrame, PriorityChip, ProjectChip, ReviewerChip, TagsChip } from "@/quickTasks/OptionChips";
import { RepoPicker } from "@/ui/RepoPicker";
import { useScheme } from "@/ui/theme";

/**
 * A new quick task, as the web `QuickTaskModal` on a phone: a full screen in
 * place of the dialog. The repo (the web takes it from the page), the title
 * and description fields, then the web option chips, each opening a bottom
 * sheet: priority, code reviewer, model and traits, base branch (locked to
 * the project's when a project is picked), tags and project. "Create Task"
 * sits at the bottom in thumb reach and calls the web's
 * `agentTasks.createQuickTask`, which files the task in To Do without
 * running it; the screen then goes back to the list, as the dialog closes
 * (to Quick Tasks after a deep link). Return on the title moves to the
 * description.
 *
 * Not here from the web dialog: drafts (save on close, the Drafts menu),
 * attachments, voice input, @ mentions and / skills, the readiness check,
 * the provider account (the server picks the creator's own, as the web
 * default) and "New project...".
 */
export default function NewQuickTaskScreen() {
  const router = useRouter();
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const insets = useSafeAreaInsets();
  const simpleView = useSimpleView();
  const { repoId: repoParam } = useLocalSearchParams<{ repoId?: string }>();
  // The description field, for Return on the title: focus is imperative.
  const descriptionRef = useRef<TextInput>(null);
  const leave = () => goBackOrReplace(router, "/sessions?section=quick-tasks");
  const repos = useQuery(api.githubRepos.list, {});
  const [picked, setPicked] = useState<Id<"githubRepos"> | null>(null);
  const repo = repos?.find((candidate) => candidate._id === (picked ?? repoParam)) ?? repos?.[0];
  const repoArgs = repo ? { repoId: repo._id } : "skip";
  const tasks = useQuery(api.agentTasks.getAllTasks, repoArgs);
  const projects = useQuery(api.projects.list, repoArgs);
  const users = useQuery(api.users.listAll, {});
  const createQuickTask = useMutation(api.agentTasks.createQuickTask);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority | undefined>(undefined);
  const [assignedTo, setAssignedTo] = useState<Id<"users"> | undefined>(undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<Id<"projects"> | undefined>(undefined);
  // As the new-session screen: model and traits start from the repo defaults
  // and a pick overrides them; the base branch is kept with its repo.
  const [pickedModel, setPickedModel] = useState<AIModel | null>(null);
  const [pickedTraits, setPickedTraits] = useState<StoredModelTraits>({});
  const [pickedBranch, setPickedBranch] = useState<{ repoId: Id<"githubRepos">; branch: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // A task in a project takes the project's base branch (web `useEffectiveProject`).
  const project = useQuery(api.projects.get, projectId ? { id: projectId } : "skip");
  if (repos === undefined) return <Screen onBack={leave}><CenteredSpinner label="Loading repos" /></Screen>;
  if (!repo) {
    return (
      <Screen onBack={leave}>
        <EmptyState title="No repos" description="Connect a repo on the web. It shows up here." />
      </Screen>
    );
  }

  const model = pickedModel ?? normalizeAIModel(repo.defaultModel);
  const traits: StoredModelTraits = { ...storedTraitsFromRepoDefaults(repo), ...pickedTraits };
  const repoBranch = repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const baseBranch = pickedBranch?.repoId === repo._id ? pickedBranch.branch : repoBranch;
  const branchLocked = projectId !== undefined;
  const displayBranch = branchLocked ? (project?.baseBranch ?? repoBranch) : baseBranch;
  // The web tag list: the stock tags and every tag on the repo's tasks. `sort` on a fresh array; Hermes lacks `toSorted`.
  const allTags = [...new Set([...TASK_TAGS, ...(tasks ?? []).flatMap((task) => task.tags ?? [])])].sort();
  const canSubmit = !saving && title.trim().length > 0 && displayBranch.length > 0;

  const changeRepo = (repoId: Id<"githubRepos">) => {
    setPicked(repoId);
    // A project belongs to one repo.
    setProjectId(undefined);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await createQuickTask({
        repoId: repo._id,
        title: title.trim(),
        description: description.trim() || undefined,
        baseBranch: branchLocked ? undefined : baseBranch,
        model,
        reasoningLevel: traits.effortLevel,
        thinkingEnabled: traits.thinkingEnabled,
        use1mContext: traits.use1mContext,
        fastMode: traits.fastMode,
        projectId,
        tags: tags.length > 0 ? tags : undefined,
        assignedTo,
        priority,
      });
      leave();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create task");
      setSaving(false);
    }
  };

  return (
    <Screen onBack={leave}>
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 4, paddingHorizontal: 16, paddingBottom: 16 }}>
          <RepoPicker repos={repos} value={repo} onChange={changeRepo} />
          {/* Web: a borderless `text-base font-medium` title over a borderless description, min 160 high. */}
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Task title"
            placeholderTextColor={theme.mutedForeground}
            accessibilityLabel="Task title"
            autoFocus
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => descriptionRef.current?.focus()}
            className="font-instrument-sans-medium min-h-11 text-base"
            style={{ color: theme.foreground, fontWeight: "500" }}
          />
          <TextInput
            ref={descriptionRef}
            value={description}
            onChangeText={setDescription}
            placeholder="Add description..."
            placeholderTextColor={theme.mutedForeground}
            accessibilityLabel="Description"
            multiline
            textAlignVertical="top"
            className="font-instrument-sans min-h-40 py-2 text-base"
            style={{ color: theme.foreground }}
          />
          {/* Web: the chips wrap `gap-1.5`, in its order. */}
          <View className="flex-row flex-wrap gap-1.5 pt-2">
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
        <View className="px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
          <Button onPress={() => void submit()} disabled={!canSubmit} loading={saving}>
            Create Task
          </Button>
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
