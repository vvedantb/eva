import { api, isProjectBuilding, projectScheduledBuildAt } from "@eva/backend";
import { BUILDABLE_PROJECT_PHASES, isProjectPlanning } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconCalendarClock, IconHammer, IconLayoutKanban, IconMessage, IconPlayerStop } from "@tabler/icons-react-native";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import { Button, CenteredSpinner, ConfirmDialog, EmptyState } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import dayjs from "dayjs";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProjectOverview } from "@/projects/ProjectOverview";
import { ScheduleSheet } from "@/ui/ScheduleSheet";
import { ProjectPlan } from "@/projects/ProjectPlan";
import { ProjectTasks } from "@/projects/ProjectTasks";
import { useProjectActions } from "@/projects/useProjectActions";
import { useProjectTaskStatus } from "@/projects/useProjectStatus";
import { useProjectGitActions } from "@/sandbox/OwnedSandboxActions";
import { SegmentedTabs } from "@/ui/SegmentedTabs";
import { useScheme } from "@/ui/theme";
import { HeaderMoreButton } from "@/ui/HeaderRail";

type Tab = "overview" | "work";

/** The web phases with a project sandbox, and so the project chat (`useProjectSandbox`). */
const SANDBOX_PHASES = ["in_progress", "business_review", "code_review"];

/**
 * One project, as the web project page (`ProjectDetailClient`) on a phone:
 * the header (back, the title, the web "…" project menu as a sheet), the
 * web Overview | Tasks switch under it, kept in `?tab=` and set in place
 * (no history), and the tab below. An older project still in planning with
 * an interview or a plan shows "Plan" in place of Tasks; a new project has
 * no planning step. The web Sandbox tab's coordinator chat is the phone
 * chat screen (`/chat/<projectId>`): "Chat" in the bottom bar opens it, in
 * the phases the web shows the Sandbox tab, with the web unread dot. A
 * contributor gets "Build" (the web "Build Project", with its "Run Eva"
 * confirm) or, while a build runs, "Stop Build" (with the web stop
 * confirm) beside it in thumb reach, with the web's build schedule as a
 * calendar square, and the "…" sheet, led by the web's sandbox and git
 * actions (`useProjectGitActions`). A viewer (`callerRole`) gets
 * "Feedback" in their place, as the web header. Not here from the web: the
 * sandbox preview, files and review panes.
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
  // The web page's sandbox and git actions, leading the "…" sheet.
  const git = useProjectGitActions(project);
  const actions = useProjectActions({ repo: repo ?? EMPTY_REPO, users, onDeleted: leave, extraRows: git.rows });

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
  // Only an older project still planning, with an interview or a plan to show, keeps the Plan view.
  const showPlan = planning && (project.conversationHistory.length > 0 || project.generatedSpec !== undefined);
  const canContribute = project.callerRole === "contributor";
  const openFeedback = () => router.push({ pathname: "/project/feedback", params: { projectId: project._id, repo: repo._id } });
  return (
    <Screen
      title={project.title}
      onBack={leave}
      headerRight={
        // The web header "…" (`ProjectDetailHeaderActions`), shown to a contributor outside planning as the web.
        planning || !canContribute ? undefined : (
          <HeaderMoreButton label="More" onPress={() => actions.openSheet(project)} />
        )
      }
    >
      <View className="px-4 pb-2">
        <SegmentedTabs
          value={tab}
          options={[
            { value: "overview", label: "Overview" },
            { value: "work", label: showPlan ? "Plan" : "Tasks" },
          ]}
          onChange={(next) => router.setParams({ tab: next })}
        />
      </View>
      <ProjectTab
        tab={tab}
        project={project}
        repo={repo}
        users={users}
        showPlan={showPlan}
        canContribute={canContribute}
        onFeedback={openFeedback}
      />
      {showPlan ? null : <ProjectDock project={project} canContribute={canContribute} onFeedback={openFeedback} />}
      {actions.dialogs}
      {git.dialogs}
    </Screen>
  );
}

type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];

/** The open tab, over the project's child tasks and their derived status (`useProjectTaskStatus`). */
function ProjectTab({
  tab,
  project,
  repo,
  users,
  showPlan,
  canContribute,
  onFeedback,
}: {
  tab: Tab;
  project: Project;
  repo: Repo;
  users: User[] | undefined;
  showPlan: boolean;
  canContribute: boolean;
  onFeedback: () => void;
}) {
  const { tasks, failedTaskIds, status } = useProjectTaskStatus(project._id, repo._id);
  if (tab === "overview") {
    return <ProjectOverview project={project} repo={repo} users={users} status={status} canContribute={canContribute} />;
  }
  if (showPlan) return <ProjectPlan project={project} />;
  return (
    <ProjectTasks
      project={project}
      repo={repo}
      users={users}
      tasks={tasks}
      failedTaskIds={failedTaskIds}
      canContribute={canContribute}
      onFeedback={onFeedback}
    />
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

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;

/**
 * The bottom bar: "Chat" (the coordinator chat, with the unread dot while a
 * reply waits), then the web build button behind the web confirm for a
 * contributor, or "Feedback" for a viewer.
 */
function ProjectDock({ project, canContribute, onFeedback }: { project: Project; canContribute: boolean; onFeedback: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = EVA_THEME[useScheme()];
  // The project chats in its session's Main chat; no chat yet, nothing unread.
  const owned = useQuery(api.sessions.getOwnedWithSeed, { owner: { kind: "project", projectId: project._id } });
  const chatId = owned?.session?.chatId;
  const unread = useQuery(api.chatReads.isUnread, chatId ? { parentId: chatId } : "skip")?.hasUnread === true;
  const startBuild = useMutation(api.buildWorkflow.startBuild);
  // The web split Build button's schedule half (`ScheduleBuildPopover`).
  const scheduleBuild = useMutation(api.buildWorkflow.scheduleBuild);
  const updateScheduledBuild = useMutation(api.buildWorkflow.updateScheduledBuild);
  const cancelScheduledBuild = useMutation(api.buildWorkflow.cancelScheduledBuild);
  const [scheduling, setScheduling] = useState(false);
  const scheduledBuildAt = projectScheduledBuildAt(project);
  const cancelBuild = useMutation(api.buildWorkflow.cancelBuild);
  const [confirm, setConfirm] = useState<"build" | "stop" | null>(null);
  const [busy, setBusy] = useState(false);
  const showChat = SANDBOX_PHASES.includes(project.phase);
  const canBuild = canContribute && BUILDABLE_PROJECT_PHASES.includes(project.phase);
  const building = isProjectBuilding(project);
  if (!showChat && !canBuild && canContribute) return null;

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
      {!canContribute ? (
        // The web header's viewer "Feedback": a viewer's one write action in a project.
        <View className="min-w-0 flex-1">
          <Button leftIcon={<IconMessage size={16} color={theme.primaryForeground} />} onPress={onFeedback}>
            Feedback
          </Button>
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
              {scheduledBuildAt !== undefined ? `Build · ${dayjs(scheduledBuildAt).format("MMM D, h:mm A")}` : "Build"}
            </Button>
          )}
        </View>
      ) : null}
      {canBuild && !building ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={scheduledBuildAt !== undefined ? "Change or remove the build schedule" : "Schedule build"}
          onPress={() => setScheduling(true)}
          className="h-11 w-11 items-center justify-center rounded-xl active:opacity-70"
          style={{ backgroundColor: theme.secondary }}
        >
          <IconCalendarClock size={18} color={scheduledBuildAt !== undefined ? theme.primary : theme.secondaryForeground} />
        </Pressable>
      ) : null}
      <ScheduleSheet
        open={scheduling}
        onOpenChange={setScheduling}
        title="Schedule build"
        scheduleLabel="Schedule build"
        scheduledAt={scheduledBuildAt}
        onSchedule={(at) => {
          setScheduling(false);
          void (scheduledBuildAt === undefined
            ? run(() => scheduleBuild({ projectId: project._id, scheduledAt: at }), "Build scheduled", "Couldn't schedule build")
            : run(() => updateScheduledBuild({ projectId: project._id, scheduledAt: at }), "Build schedule updated", "Couldn't update build schedule"));
        }}
        onRemove={() => {
          setScheduling(false);
          void run(() => cancelScheduledBuild({ projectId: project._id }), "Build schedule removed", "Couldn't remove build schedule");
        }}
      />
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
