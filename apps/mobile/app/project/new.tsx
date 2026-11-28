import { api, type Id } from "@eva/backend";
import { FALLBACK_GIT_BASE_BRANCH, newProjectSubmitBlocker, type Priority } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import { Button, CenteredSpinner, EmptyState, KeyboardAvoidingView } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BaseBranchChip } from "@/chat/BranchChips";
import { OptionPillFrame, PriorityChip } from "@/quickTasks/OptionChips";
import { rememberRepo, RepoPicker, useLastRepoId } from "@/ui/RepoPicker";
import { useScheme } from "@/ui/theme";

type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];

/**
 * A new project, as the web `NewProjectModal` on a phone: a full screen in
 * place of the dialog. The repo (the web takes it from the page), one prompt
 * ("Describe the project…"; the server titles the project from it), then the
 * web option chips, each opening a bottom sheet: base branch and priority. A
 * project has no interview or plan step: its coordinator chat plans it.
 * "Save" and "Save and Run" sit at the bottom in thumb reach; they are off
 * until there is a prompt, and say why to a screen reader
 * (`newProjectSubmitBlocker`, the web tooltip). Both call the web's
 * `projects.create`; "Save and Run" (`run`) also sends the prompt as the
 * coordinator chat's first message. Then the project's coordinator chat
 * replaces this screen, so back does not return to the spent form. Not here
 * from the web: @ mentions and / skills, and the keyboard shortcut (Return is
 * a newline, as the phone's session composer).
 */
export default function NewProjectScreen() {
  const router = useRouter();
  const { repoId: repoParam } = useLocalSearchParams<{ repoId?: string }>();
  const leave = () => goBackOrReplace(router, "/projects");
  const repos = useQuery(api.githubRepos.list, {});
  const lastRepoId = useLastRepoId();
  const first =
    repos?.find((candidate) => candidate._id === repoParam) ?? repos?.find((candidate) => candidate._id === lastRepoId) ?? repos?.[0];
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
  const [picked, setPicked] = useState<Id<"githubRepos">>(initialRepo._id);
  const repo = repos.find((candidate) => candidate._id === picked) ?? initialRepo;
  const createProject = useMutation(api.projects.create);
  const [prompt, setPrompt] = useState("");
  const [priority, setPriority] = useState<Priority | undefined>(undefined);
  const [pickedBranch, setPickedBranch] = useState<{ repoId: Id<"githubRepos">; branch: string } | null>(null);
  const [saving, setSaving] = useState<"save" | "run" | null>(null);
  const repoBranch = repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH;
  const baseBranch = pickedBranch?.repoId === repo._id ? pickedBranch.branch : repoBranch;
  const blocker = newProjectSubmitBlocker(saving !== null, prompt);

  const submit = async (run: boolean) => {
    if (blocker !== undefined) return;
    setSaving(run ? "run" : "save");
    try {
      const projectId = await createProject({
        repoId: repo._id,
        rawInput: prompt.trim(),
        baseBranch,
        priority,
        run,
      });
      toast.success("Project created");
      router.replace({ pathname: "/chat/[target]", params: { target: projectId } });
    } catch {
      toast.error("Couldn't create project");
      setSaving(null);
    }
  };

  return (
    <Screen onBack={leave}>
      <KeyboardAvoidingView style={{ flex: 1 }}>
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 4, paddingHorizontal: 16, paddingBottom: 16 }}>
          <RepoPicker
            repos={repos}
            value={repo}
            onChange={(repoId) => {
              setPicked(repoId);
              rememberRepo(repoId);
            }}
          />
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe the project…"
            placeholderTextColor={theme.mutedForeground}
            accessibilityLabel="Describe the project"
            autoFocus
            multiline
            textAlignVertical="top"
            className="font-instrument-sans min-h-40 py-2 text-base"
            style={{ color: theme.foreground }}
          />
          <View className="flex-row flex-wrap gap-1.5 pt-2">
            <OptionPillFrame>
              <BaseBranchChip repoId={repo._id} value={baseBranch} onChange={(branch) => setPickedBranch({ repoId: repo._id, branch })} />
            </OptionPillFrame>
            <PriorityChip value={priority} onChange={setPriority} />
          </View>
        </ScrollView>
        <View className="flex-row gap-2 px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="min-w-0 flex-1">
            <Button
              variant="secondary"
              onPress={() => void submit(true)}
              disabled={blocker !== undefined}
              loading={saving === "run"}
              accessibilityHint={blocker}
            >
              Save and Run
            </Button>
          </View>
          <View className="min-w-0 flex-1">
            <Button onPress={() => void submit(false)} disabled={blocker !== undefined} loading={saving === "save"} accessibilityHint={blocker}>
              Save
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Screen({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <View className="flex-1">
      <StackPageHeader title="New Project" onBack={onBack} />
      {children}
    </View>
  );
}
