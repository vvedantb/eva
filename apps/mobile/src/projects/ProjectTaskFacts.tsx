import { api, type Id } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { projectTaskFacts } from "@eva/shared/projectView";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Pressable, Text, View } from "react-native";
import { useSimpleView } from "@/chat/ComposerFooter";
import { useOpenPr } from "@/reviews/PullRequestsSheet";
import { PrIcon } from "@/sessions/SessionGroup";
import { useScheme } from "@/ui/theme";

/** A project task row (`agentTasks.listByProject`): it carries the server's status facts. */
export type ProjectTaskRow = FunctionReturnType<typeof api.agentTasks.listByProject>[number];

/**
 * A task's row in its project's task list (the archived list for a task
 * archived on its own), or undefined for a quick task and while it loads.
 */
export function useProjectTaskRow(taskId: Id<"agentTasks"> | undefined): ProjectTaskRow | undefined {
  const task = useQuery(api.agentTasks.get, taskId ? { id: taskId } : "skip");
  const rows = useQuery(
    api.agentTasks.listByProject,
    task?.projectId ? { projectId: task.projectId, archived: task.archivedAt !== undefined } : "skip",
  );
  return rows?.find((row) => row._id === taskId);
}

/**
 * The web `ProjectTaskFacts`: a project task's status and PR line under its
 * title, on one line ("In review · Phase 1", the repos of a multi-repo task,
 * then a link per PR: `projectTaskFacts`). Simple view hides the PRs, as the web.
 */
export function ProjectTaskFacts({ task }: { task: ProjectTaskRow }) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const simpleView = useSimpleView();
  const repos = useQuery(api.githubRepos.list, {});
  const prs = useQuery(api.pullRequests.listForOwner, simpleView ? "skip" : { owner: { kind: "task", taskId: task._id } });
  const openPr = useOpenPr();
  const facts = projectTaskFacts(task, repos ?? [], prs ?? []);
  return (
    <View className="flex-row items-center gap-1.5 overflow-hidden">
      <Text numberOfLines={1} className="shrink font-instrument-sans text-xs" style={{ color: muted }}>
        {facts.text}
      </Text>
      {facts.prs.map((pr) => (
        <View key={pr.prUrl} className="flex-row items-center gap-1.5">
          <Text className="font-instrument-sans text-xs" style={{ color: muted }}>
            ·
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Pull request ${pr.label}`}
            onPress={() => openPr(pr.prUrl, pr.repoId)}
            hitSlop={8}
            className="flex-row items-center gap-1 active:opacity-70"
          >
            <PrIcon state={pr.state} scheme={scheme} size={12} />
            <Text numberOfLines={1} className="font-instrument-sans text-xs" style={{ color: muted }}>
              {pr.label}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
