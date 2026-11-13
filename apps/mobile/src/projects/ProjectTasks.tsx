import { api } from "@eva/backend";
import { TASK_STATUS_LABELS, projectTaskSections, type DisplayTaskStatus } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconPlus } from "@tabler/icons-react-native";
import { SkeletonList, SkeletonRow } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { QuickTaskRow } from "@/quickTasks/QuickTaskRow";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import { useQuickTaskActions } from "@/quickTasks/useQuickTaskActions";
import { CardGap, FoldFooter, FoldHeader } from "@/ui/FoldHeader";
import { useScheme } from "@/ui/theme";
import { LIST_WINDOW } from "@/ui/listWindow";

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>;
type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];

/**
 * The web project Tasks tab (`ProjectTaskListPanel`) at phone width: a
 * collapsible section per task status in workflow order
 * (`projectTaskSections`: To Do in project order, the rest latest run first;
 * live sections start open), with the quick-task cards numbered
 * "#project/task". To Do's "+" opens the new-task screen on this project.
 * Every section shows, "No tasks" when open and empty, as the web
 * accordion. A tap opens the task chat (the web opens the task beside the list); a
 * long press opens the web task card menu (`useQuickTaskActions`). Not here
 * from the web: drag to reorder To Do.
 */
export function ProjectTasks({ project, repo, users }: { project: Project; repo: Repo; users: User[] | undefined }) {
  const router = useRouter();
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const tasks = useQuery(api.agentTasks.listByProject, { projectId: project._id });
  const errorTaskIds = useQuery(
    api.agentRuns.getTaskIdsWithLatestRunError,
    tasks ? { repoId: repo._id, taskIds: tasks.map((task) => task._id) } : "skip",
  );
  const projects = useQuery(api.projects.list, { repoId: repo._id });
  const actions = useQuickTaskActions({ repo, users, projects });
  // Sections the user folded or unfolded, against each one's `defaultOpen`.
  const [toggled, setToggled] = useState<ReadonlySet<DisplayTaskStatus>>(new Set());

  if (tasks === undefined) {
    return (
      <SkeletonList
        label="Loading tasks"
        divided={false}
        className="px-3"
        renderRow={(row) => (
          <View className="mb-2 rounded-lg" style={{ backgroundColor: EVA_THEME[scheme].card }}>
            <SkeletonRow index={row} lines={2} trailing={false} minHeight={72} className="px-3" />
          </View>
        )}
      />
    );
  }
  const openNewTask = () =>
    router.push({ pathname: "/quick-task/new", params: { repoId: repo._id, projectId: project._id } });
  const errors = new Set<string>(errorTaskIds ?? []);
  const toggle = (status: DisplayTaskStatus) => {
    const next = new Set(toggled);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setToggled(next);
  };

  return (
    <>
      <SectionList
        {...LIST_WINDOW}
        sections={projectTaskSections(tasks).map((section) => {
          const open = section.defaultOpen !== toggled.has(section.status);
          return { status: section.status, count: section.tasks.length, open, data: open ? section.tasks : [] };
        })}
        keyExtractor={(task) => task._id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => {
          const { icon, text } = statusAppearance(section.status, scheme);
          return (
            <FoldHeader
              icon={icon}
              color={text}
              label={TASK_STATUS_LABELS[section.status]}
              count={section.count}
              noun="task"
              open={section.open}
              onToggle={() => toggle(section.status)}
              trailing={
                section.status === "todo" ? (
                  // The web outline "+" on To Do: a 44 square here, in place of the web 24.
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="New task"
                    onPress={openNewTask}
                    className="mr-1 h-11 w-11 items-center justify-center rounded-lg active:opacity-70"
                  >
                    <IconPlus size={14} color={muted} />
                  </Pressable>
                ) : undefined
              }
            />
          );
        }}
        ItemSeparatorComponent={CardGap}
        renderItem={({ item: task, section }) => (
          <QuickTaskRow
            task={task}
            status={section.status}
            hasError={errors.has(task._id)}
            creator={users?.find((user) => user._id === task.createdBy)}
            projectNumId={project.numId}
            onLongPress={() => actions.openSheet(task)}
          />
        )}
        renderSectionFooter={({ section }) => <FoldFooter open={section.open} count={section.count} empty="No tasks" />}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
      />
      {actions.dialogs}
    </>
  );
}
