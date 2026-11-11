import { api, isProjectBuilding } from "@eva/backend";
import { BUILDABLE_PROJECT_PHASES, isProjectPlanning } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconDots, IconHammer, IconLayoutKanban, IconMessage, IconPlayerStop } from "@tabler/icons-react-native";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import { Button, CenteredSpinner, ConfirmDialog, EmptyState } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProjectOverview } from "@/projects/ProjectOverview";
import { ProjectPlan } from "@/projects/ProjectPlan";
import { ProjectTasks } from "@/projects/ProjectTasks";
import { useProjectActions } from "@/projects/useProjectActions";
import { SegmentedTabs } from "@/ui/SegmentedTabs";
import { useScheme } from "@/ui/theme";

type Tab = "overview" | "work";

/** The web phases with a project sandbox, and so the project chat (`useProjectSandbox`). */
const SANDBOX_PHASES = ["in_progress", "business_review", "code_review"];

/**
 * One project, as the web project page (`ProjectDetailClient`) on a phone:
 * the header (back, the title, the web "…" project menu as a sheet), the
 * web Overview | Tasks switch ("Plan" while drafting) under it, kept in
 * `?tab=` and set in place (no history), and the tab below. The web Sandbox
 * tab's project chat is the phone chat screen (`/chat/<projectId>`):
 * "Chat" in the bottom bar opens it, in the phases the web shows the
 * Sandbox tab, with the web unread dot. "Build" (the web "Build Project",
 * with its "Run Eva" confirm) or, while a build runs, "Stop Build" (with
 * the web stop confirm) sits beside it in thumb reach. Not here from the
 * web: the sandbox preview, files and review panes, sandbox wake and sleep,
 * commit and push, scheduled builds, Create PR and Resolve Conflicts.
 */
export default function ProjectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId: string; repo?: string; tab?: string }>();
  const leave = () => goBackOrReplace(router, "/projects");
  // Route params are strings: the repo and the project resolve through the
  // lists that hold them, so their ids keep their table types.
  const repos = useQuery(api.githubRepos.list, {});
  const repo = repos?.find((candidate) => candidate._id === params.repo);
  const projects = useQuery(api.projects.list, repo ? { repoId: repo._id } : "skip");
  const listed = projects?.find((candidate) => candidate._id === params.projectId);
  const project = useQuery(api.projects.get, listed ? { id: listed._id } : "skip");
  const users = useQuery(api.users.listAll, {});
  const tab: Tab = params.tab === "overview" ? "overview" : "work";
  const actions = useProjectActions({ repo: repo ?? EMPTY_REPO, users, onDeleted: leave });

  const loading = repos === undefined || (repo !== undefined && (projects === undefined || (listed !== undefined && project === undefined)));
  if (loading || !repo || !project) {
    return (
      <Screen title="Project" onBack={leave}>
        {loading ? (
          <CenteredSpinner label="Loading project" />
        ) : (
          // The web `EntityNotFound` for a project.
          <EmptyState icon={IconLayoutKanban} title="Project not found" description="It was deleted, or you no longer have access." />
        )}
      </Screen>
    );
  }

  const planning = isProjectPlanning(project.phase);
  return (
    <Screen
      title={project.title}
      onBack={leave}
      headerRight={
        // The web header "…" (`ProjectDetailHeaderActions`), shown outside planning as the web.
        planning ? undefined : (
          <MoreButton onPress={() => actions.openSheet(project)} />
        )
      }
    >
      <View className="px-4 pb-2">
        <SegmentedTabs
          value={tab}
          options={[
            { value: "overview", label: "Overview" },
            { value: "work", label: planning ? "Plan" : "Tasks" },
          ]}
          onChange={(next) => router.setParams({ tab: next })}
        />
      </View>
      {tab === "overview" ? (
        <ProjectOverview project={project} repo={repo} users={users} />
      ) : planning ? (
        <ProjectPlan project={project} />
      ) : (
        <ProjectTasks project={project} repo={repo} users={users} />
      )}
      {planning ? null : <ProjectDock project={project} />}
      {actions.dialogs}
    </Screen>
  );
}

/** Never shown: the menu hook needs a repo before the screen has one. */
const EMPTY_REPO = { owner: "", name: "" };

/** The stack header (back, the title, an optional end button) over the screen body. */
function Screen({ title, onBack, headerRight, children }: { title: string; onBack: () => void; headerRight?: ReactNode; children: ReactNode }) {
  return (
    <View className="flex-1">
      <StackPageHeader title={title} onBack={onBack} headerRight={headerRight} />
      {children}
    </View>
  );
}

/** The header "…": a 44 ghost square with the muted dots, as the list "+". */
function MoreButton({ onPress }: { onPress: () => void }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="More"
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-lg active:opacity-70"
    >
      <IconDots size={16} color={muted} />
    </Pressable>
  );
}

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;

/**
 * The bottom bar: "Chat" (the project chat, with the unread dot while a
 * reply waits) and the web build button, each behind the web confirm.
 */
function ProjectDock({ project }: { project: Project }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = EVA_THEME[useScheme()];
  const unread = useQuery(api.chatReads.isUnread, { parentId: project._id })?.hasUnread === true;
  const startBuild = useMutation(api.buildWorkflow.startBuild);
  const cancelBuild = useMutation(api.buildWorkflow.cancelBuild);
  const [confirm, setConfirm] = useState<"build" | "stop" | null>(null);
  const [busy, setBusy] = useState(false);
  const showChat = SANDBOX_PHASES.includes(project.phase);
  const canBuild = BUILDABLE_PROJECT_PHASES.includes(project.phase);
  const building = isProjectBuilding(project);
  if (!showChat && !canBuild) return null;

  const run = async (action: () => Promise<unknown>, success: string | undefined, failure: string) => {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
    } catch {
      toast.error(failure);
    }
    setBusy(false);
  };

  return (
    <View className="flex-row gap-2 px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
      {showChat ? (
        <View className="min-w-0 flex-1">
          <Button
            variant="secondary"
            accessibilityLabel={unread ? "Chat, unread reply" : "Chat"}
            leftIcon={<IconMessage size={16} color={theme.secondaryForeground} />}
            onPress={() => router.push({ pathname: "/chat/[target]", params: { target: project._id } })}
          >
            Chat
          </Button>
          {unread ? (
            <View pointerEvents="none" className="absolute right-3 top-3 size-1.5 rounded-full" style={{ backgroundColor: theme.primary }} />
          ) : null}
        </View>
      ) : null}
      {canBuild ? (
        <View className="min-w-0 flex-1">
          {building ? (
            <Button
              variant="destructive"
              loading={busy}
              disabled={busy}
              leftIcon={<IconPlayerStop size={16} color={theme.destructiveForeground} />}
              onPress={() => setConfirm("stop")}
            >
              Stop Build
            </Button>
          ) : (
            <Button
              loading={busy}
              disabled={busy}
              leftIcon={<IconHammer size={16} color={theme.primaryForeground} />}
              onPress={() => setConfirm("build")}
            >
              Build
            </Button>
          )}
        </View>
      ) : null}
      {/* The web `RunEvaDialog`. */}
      <ConfirmDialog
        open={confirm === "build"}
        onOpenChange={(open) => setConfirm(open ? "build" : null)}
        title="Run Eva"
        description={
          "This will allow Eva to autonomously work through all tasks in sequence until the project is fully built.\n\n" +
          "Best suited for projects with well-defined requirements. If Eva makes an error on an earlier task, it may carry forward into subsequent tasks."
        }
        confirmLabel="Start cooking"
        onConfirm={() => void run(() => startBuild({ projectId: project._id }), "Build started", "Couldn't start build")}
      />
      {/* The web `StopConfirmDialog`. */}
      <ConfirmDialog
        open={confirm === "stop"}
        onOpenChange={(open) => setConfirm(open ? "stop" : null)}
        title="Stop Execution"
        description="This will stop the agent mid-execution. Any uncommitted progress on this run will be lost."
        confirmLabel="Stop Execution"
        variant="destructive"
        onConfirm={() => void run(() => cancelBuild({ projectId: project._id }), undefined, "Could not stop the build. Try again.")}
      />
    </View>
  );
}
