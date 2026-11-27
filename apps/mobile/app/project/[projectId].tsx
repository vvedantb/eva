import { api } from "@eva/backend";
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
import { ProjectTasks } from "@/projects/ProjectTasks";
import { useProjectActions } from "@/projects/useProjectActions";
import { useProjectTaskStatus } from "@/projects/useProjectStatus";
import { useProjectGitActions } from "@/sandbox/OwnedSandboxActions";
import { SegmentedTabs } from "@/ui/SegmentedTabs";
import { useScheme } from "@/ui/theme";
import { HeaderMoreButton } from "@/ui/HeaderRail";
import { ArchivedBar } from "@/ui/ArchivedBar";

type Tab = "overview" | "coordinator" | "documents";

/**
 * One project, as the web project page (`ProjectDetailClient`) on a phone:
 * the header (back, the title, the web "…" project menu as a sheet), the
 * web Overview | Coordinator switch under it with Documents (the web
 * sandbox Documents and Artifacts tabs, `ProjectDocuments`), kept in
 * `?tab=` and set in place (no history), Coordinator by default, and the
 * tab below. Coordinator is
 * the project's task list (`ProjectTasks`); the coordinator chat itself is
 * the phone chat screen (`/chat/<projectId>`), as embedding it would fork
 * the chat screen: "Chat" in the bottom bar opens it, with the web unread
 * dot; a project has no closed state, so it always shows. The task list's
 * "+" adds a task to Triage, or starts it now. The "…" sheet is led by the
 * web's sandbox actions
 * (`useProjectGitActions`); the coordinator starts approved tasks. Not here
 * from the web: the sandbox preview, files and review panes. An archived
 * project (found in `projects.listArchived`) opens read-only under its
 * `ArchivedBar`.
 */
export default function ProjectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId: string; repo?: string; tab?: string }>();
  const leave = () => goBackOrReplace(router, "/projects");
  const repos = useQuery(api.githubRepos.list, {});
  const repo = repos?.find((candidate) => candidate._id === params.repo);
  const projects = useQuery(api.projects.list, repo ? { repoId: repo._id } : "skip");
  const live = projects?.find((candidate) => candidate._id === params.projectId);
  const archivedProjects = useQuery(
    api.projects.listArchived,
    repo && projects !== undefined && live === undefined ? { repoId: repo._id } : "skip",
  );
  const listed = live ?? archivedProjects?.find((candidate) => candidate._id === params.projectId);
  const project = useQuery(api.projects.get, listed ? { id: listed._id } : "skip");
  const users = useQuery(api.users.listAll, {});
  const tab: Tab = params.tab === "overview" || params.tab === "documents" ? params.tab : "coordinator";
  const git = useProjectGitActions(project);
  const actions = useProjectActions({ repo: repo ?? EMPTY_REPO, users, onArchived: leave, extraRows: git.rows });

  const loading =
    repos === undefined ||
    (repo !== undefined &&
      (projects === undefined ||
        (live === undefined && archivedProjects === undefined) ||
        (listed !== undefined && project === undefined)));
  if (loading || !repo || !project) {
    return (
      <Screen title="Project" onBack={leave}>
        {loading ? (
          <CenteredSpinner label="Loading project" />
        ) : (
          <EmptyState icon={IconLayoutKanban} title="Project not found" description="It does not exist, or you no longer have access." />
        )}
      </Screen>
    );
  }

  return (
    <Screen
      title={project.title}
      onBack={leave}
      headerRight={
        <HeaderMoreButton label="More" onPress={() => actions.openSheet(project)} />
      }
    >
      {project.archivedAt !== undefined ? <ArchivedBar onUnarchive={() => actions.unarchive(project._id)} /> : null}
      <View className="px-4 pb-2">
        <SegmentedTabs
          value={tab}
          options={[
            { value: "overview", label: "Project" },
            { value: "coordinator", label: "Sandbox" },
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
      />
      <ProjectDock project={project} />
      {actions.dialogs}
      {git.dialogs}
    </Screen>
  );
}

type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];

function ProjectTab({
  tab,
  project,
  repo,
  users,
}: {
  tab: Tab;
  project: Project;
  repo: Repo;
  users: User[] | undefined;
}) {
  const { tasks, failedTaskIds, status } = useProjectTaskStatus(project._id, repo._id);
  if (tab === "overview") {
    return <ProjectOverview project={project} repo={repo} users={users} status={status} />;
  }
  if (tab === "documents") return <ProjectDocuments projectId={project._id} repoId={repo._id} tasks={tasks} />;
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

const EMPTY_REPO = { owner: "", name: "" };

function Screen({ title, onBack, headerRight, children }: { title: string; onBack: () => void; headerRight?: ReactNode; children: ReactNode }) {
  return (
    <View className="flex-1">
      <StackPageHeader title={title} onBack={onBack} headerRight={headerRight} />
      {children}
    </View>
  );
}

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;

function ProjectDock({ project }: { project: Project }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = EVA_THEME[useScheme()];
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
    </View>
  );
}
