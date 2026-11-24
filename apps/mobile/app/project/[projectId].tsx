import { api } from "@eva/backend";
import { isProjectPlanning } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconLayoutKanban, IconMessage } from "@tabler/icons-react-native";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import { Button, CenteredSpinner, EmptyState } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProjectDocuments } from "@/projects/ProjectDocuments";
import { ProjectOverview } from "@/projects/ProjectOverview";
import { ProjectPlan } from "@/projects/ProjectPlan";
import { ProjectTasks } from "@/projects/ProjectTasks";
import { useProjectActions } from "@/projects/useProjectActions";
import { useProjectTaskStatus } from "@/projects/useProjectStatus";
import { useProjectGitActions } from "@/sandbox/OwnedSandboxActions";
import { SegmentedTabs } from "@/ui/SegmentedTabs";
import { useScheme } from "@/ui/theme";
import { HeaderMoreButton } from "@/ui/HeaderRail";

type Tab = "overview" | "coordinator" | "documents";

/**
 * One project, as the web project page (`ProjectDetailClient`) on a phone:
 * the header (back, the title, the web "…" project menu as a sheet), the
 * web Overview | Coordinator switch under it with Documents (the web
 * sandbox Documents and Artifacts tabs, `ProjectDocuments`), kept in
 * `?tab=` and set in place (no history), Coordinator by default, and the
 * tab below. An older
 * project still in planning with an interview or a plan shows "Plan" in
 * place of Coordinator; a new project has no planning step. Coordinator is
 * the project's task list (`ProjectTasks`); the coordinator chat itself is
 * the phone chat screen (`/chat/<projectId>`), as embedding it would fork
 * the chat screen: "Chat" in the bottom bar opens it, with the web unread
 * dot; a project has no closed state, so it always shows. "Feedback"
 * beside it files a feedback task into Triage, as the web header. Outside
 * planning the "…" sheet is led by the web's sandbox actions
 * (`useProjectGitActions`); the coordinator starts approved tasks. Not here
 * from the web: the sandbox preview, files and review panes.
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
  const tab: Tab = params.tab === "overview" || params.tab === "documents" ? params.tab : "coordinator";
  // The web page's sandbox actions, leading the "…" sheet.
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
  const openFeedback = () => router.push({ pathname: "/project/feedback", params: { projectId: project._id, repo: repo._id } });
  return (
    <Screen
      title={project.title}
      onBack={leave}
      headerRight={
        // The web header "…" (`ProjectDetailHeaderActions`), shown outside planning as the web.
        planning ? undefined : (
          <HeaderMoreButton label="More" onPress={() => actions.openSheet(project)} />
        )
      }
    >
      <View className="px-4 pb-2">
        <SegmentedTabs
          value={tab}
          options={[
            { value: "overview", label: "Project" },
            { value: "coordinator", label: showPlan ? "Plan" : "Sandbox" },
            { value: "documents", label: "Documents" },
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
      />
      {showPlan ? null : <ProjectDock project={project} onFeedback={openFeedback} />}
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
}: {
  tab: Tab;
  project: Project;
  repo: Repo;
  users: User[] | undefined;
  showPlan: boolean;
}) {
  const { tasks, failedTaskIds, status } = useProjectTaskStatus(project._id, repo._id);
  if (tab === "overview") {
    return <ProjectOverview project={project} repo={repo} users={users} status={status} />;
  }
  if (tab === "documents") return <ProjectDocuments projectId={project._id} repoId={repo._id} tasks={tasks} />;
  if (showPlan) return <ProjectPlan project={project} />;
  return (
    <ProjectTasks
      project={project}
      repo={repo}
      users={users}
      tasks={tasks}
      failedTaskIds={failedTaskIds}
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
 * reply waits), then "Feedback".
 */
function ProjectDock({ project, onFeedback }: { project: Project; onFeedback: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = EVA_THEME[useScheme()];
  // The project chats in its session's Main chat; no chat yet, nothing unread.
  const owned = useQuery(api.sessions.getOwnedWithSeed, { owner: { kind: "project", projectId: project._id } });
  const chatId = owned?.session?.chatId;
  const unread = useQuery(api.chatReads.isUnread, chatId ? { parentId: chatId } : "skip")?.hasUnread === true;

  return (
    <View className="flex-row gap-2 px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
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
      {/* The web header "Feedback": files a feedback task into Triage. */}
      <View className="min-w-0 flex-1">
        <Button leftIcon={<IconMessage size={16} color={theme.primaryForeground} />} onPress={onFeedback}>
          Feedback
        </Button>
      </View>
    </View>
  );
}
