import { api, type Id } from "@eva/backend";
import { FALLBACK_GIT_BASE_BRANCH, newProjectSubmitBlocker, type Priority } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconListCheck, IconSparkles } from "@tabler/icons-react-native";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import { Button, CenteredSpinner, EmptyState, KeyboardAvoidingView, SheetRow } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BaseBranchChip } from "@/chat/BranchChips";
import { FooterSheet } from "@/chat/ComposerFooter";
import { OptionPill, OptionPillFrame, PriorityChip } from "@/quickTasks/OptionChips";
import { RepoPicker } from "@/ui/RepoPicker";
import { useScheme } from "@/ui/theme";

type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];

/**
 * A new project, as the web `NewProjectModal` on a phone: a full screen in
 * place of the dialog. The repo (the web takes it from the page), the title
 * and the description ("Describe the feature…"), then the web option chips,
 * each opening a bottom sheet: base branch, priority and planning mode
 * ("With interview/plan" or "Tasks only"). "Create Project" sits at the
 * bottom in thumb reach; it is off until there is a title and a
 * description, and says why to a screen reader (`newProjectSubmitBlocker`,
 * the web tooltip). It calls the web's `projects.create`, then replaces this
 * screen with the new project, so back does not return to the spent form.
 * Return on the title moves to the description. Not here from the web: the
 * rich-text editor (plain text here) and the keyboard shortcut.
 */
export default function NewProjectScreen() {
  const router = useRouter();
  const { repoId: repoParam } = useLocalSearchParams<{ repoId?: string }>();
  const leave = () => goBackOrReplace(router, "/projects");
  const repos = useQuery(api.githubRepos.list, {});
  const first = repos?.find((candidate) => candidate._id === repoParam) ?? repos?.[0];
  if (repos === undefined) {
    return (
      <Screen onBack={leave}>
        <CenteredSpinner label="Loading repos" />
      </Screen>
    );
  }
  if (!first) {
    return (
      <Screen onBack={leave}>
        <EmptyState title="No repos" description="Connect a repo on the web. It shows up here." />
      </Screen>
    );
  }
  return <NewProjectForm repos={repos} initialRepo={first} onLeave={leave} />;
}

function NewProjectForm({ repos, initialRepo, onLeave: leave }: { repos: Repo[]; initialRepo: Repo; onLeave: () => void }) {
  const router = useRouter();
  const scheme = useScheme();
  const theme = EVA_THEME[scheme];
  const insets = useSafeAreaInsets();
  // The description field, for Return on the title: focus is imperative.
  const descriptionRef = useRef<TextInput>(null);
  const [picked, setPicked] = useState<Id<"githubRepos">>(initialRepo._id);
  const repo = repos.find((candidate) => candidate._id === picked) ?? initialRepo;
  const createProject = useMutation(api.projects.create);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority | undefined>(undefined);
  const [skipPlanning, setSkipPlanning] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  // The base branch is kept with its repo; a new repo starts on its default (web `useBaseBranchState`).
  const [pickedBranch, setPickedBranch] = useState<{ repoId: Id<"githubRepos">; branch: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const repoBranch = repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const baseBranch = pickedBranch?.repoId === repo._id ? pickedBranch.branch : repoBranch;
  const blocker = newProjectSubmitBlocker(saving, title, description);

  const submit = async () => {
    if (blocker !== undefined) return;
    setSaving(true);
    try {
      const projectId = await createProject({
        repoId: repo._id,
        title: title.trim(),
        rawInput: description.trim(),
        baseBranch,
        priority,
        skipPlanning,
      });
      toast.success("Project created");
      router.replace({ pathname: "/project/[projectId]", params: { projectId, repo: repo._id } });
    } catch {
      toast.error("Couldn't create project");
      setSaving(false);
    }
  };

  const pickPlanning = (next: boolean) => {
    setSkipPlanning(next);
    setPlanningOpen(false);
  };
  const PlanningIcon = skipPlanning ? IconListCheck : IconSparkles;
  const planningLabel = skipPlanning ? "Tasks only" : "With interview/plan";

  return (
    <Screen onBack={leave}>
      {/* The kit's: it pads frame by frame with the keyboard (`KeyboardControllerProvider`). */}
      <KeyboardAvoidingView style={{ flex: 1 }}>
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 4, paddingHorizontal: 16, paddingBottom: 16 }}>
          <RepoPicker repos={repos} value={repo} onChange={setPicked} />
          {/* Web: a borderless `text-base font-medium` title over the description, min 160 high. */}
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Project title"
            placeholderTextColor={theme.mutedForeground}
            accessibilityLabel="Project title"
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
            placeholder="Describe the feature…"
            placeholderTextColor={theme.mutedForeground}
            accessibilityLabel="Description"
            multiline
            textAlignVertical="top"
            className="font-instrument-sans min-h-40 py-2 text-base"
            style={{ color: theme.foreground }}
          />
          {/* Web: the chips wrap, in its order: base branch, priority, planning mode. */}
          <View className="flex-row flex-wrap gap-1.5 pt-2">
            <OptionPillFrame>
              <BaseBranchChip repoId={repo._id} value={baseBranch} onChange={(branch) => setPickedBranch({ repoId: repo._id, branch })} />
            </OptionPillFrame>
            <PriorityChip value={priority} onChange={setPriority} />
            <OptionPill
              icon={<PlanningIcon size={14} color={theme.mutedForeground} />}
              label={planningLabel}
              set
              accessibilityLabel={`Planning: ${planningLabel}`}
              expanded={planningOpen}
              onPress={() => setPlanningOpen(true)}
            />
          </View>
        </ScrollView>
        {/* Web footer: Create Project (Cancel is the header back). */}
        <View className="px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
          <Button onPress={() => void submit()} disabled={blocker !== undefined} loading={saving} accessibilityHint={blocker}>
            Create Project
          </Button>
        </View>
      </KeyboardAvoidingView>
      <FooterSheet open={planningOpen} onOpenChange={setPlanningOpen} title="Planning">
        <SheetRow icon={IconSparkles} title="With interview/plan" active={!skipPlanning} onPress={() => pickPlanning(false)} />
        <SheetRow icon={IconListCheck} title="Tasks only" active={skipPlanning} onPress={() => pickPlanning(true)} />
      </FooterSheet>
    </Screen>
  );
}

/** The stack header ("New Project", back) over the screen body. */
function Screen({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <View className="flex-1">
      <StackPageHeader title="New Project" onBack={onBack} />
      {children}
    </View>
  );
}
