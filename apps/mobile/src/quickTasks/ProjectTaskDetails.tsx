import { api, normalizeAIModel, type Id, type StoredModelTraits } from "@eva/backend";
import { storedRunTraits, toPickerAccounts, toRunTraitArgs } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { projectTaskFacts } from "@eva/shared/projectView";
import { taskModelLockReason } from "@eva/shared/taskDetail";
import { useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { Pressable, Text, View } from "react-native";
import { useSimpleView } from "@/chat/ComposerFooter";
import { ModelChip } from "@/chat/ModelChip";
import { useOpenPr } from "@/reviews/PullRequestsSheet";
import { PrIcon } from "@/sessions/SessionGroup";
import { FieldGroup } from "@/ui/FieldRows";
import { useScheme } from "@/ui/theme";

/** A project task row (`agentTasks.listByProject`). */
type ProjectTask = FunctionReturnType<typeof api.agentTasks.listByProject>[number];

/**
 * The web project task Details under the prompt: one read-only facts line
 * (status, phase, the repos of a multi-repo task, a link per PR:
 * `projectTaskFacts`), then the Model, its one editable field. A project
 * task's status moves with its work, so it has no Properties. Simple view
 * hides the PRs and the model, as the web.
 */
export function ProjectTaskDetails({
  task,
  currentUserId,
  hasRuns,
  readOnly,
  update,
}: {
  task: ProjectTask;
  currentUserId: Id<"users"> | undefined;
  hasRuns: boolean;
  readOnly: boolean;
  update: (fields: Omit<FunctionArgs<typeof api.agentTasks.update>, "id">, failure: string) => void;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const simpleView = useSimpleView();
  const repos = useQuery(api.githubRepos.list, {});
  const prs = useQuery(api.pullRequests.listForOwner, simpleView ? "skip" : { owner: { kind: "task", taskId: task._id } });
  const taskAccounts = useQuery(api.userProviderAccounts.listForTaskOwner, simpleView ? "skip" : { taskId: task._id });
  const openPr = useOpenPr();
  const facts = projectTaskFacts(task, repos ?? [], prs ?? []);
  // As the web field: only the task's owner moves it onto another account.
  const isOwner = currentUserId !== undefined && currentUserId === task.createdBy;
  const lockReason = taskModelLockReason({ status: task.status, hasRuns, readOnly });
  return (
    <>
      <View className="mt-4 flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
        <Text className="font-instrument-sans text-xs" style={{ color: muted }}>
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
              <Text className="font-instrument-sans text-xs" style={{ color: muted }}>
                {pr.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
      {simpleView || task.repoId === undefined ? null : (
        <FieldGroup title="Model">
          <View
            className="min-h-12 flex-row items-center"
            pointerEvents={lockReason === undefined ? "auto" : "none"}
            accessibilityHint={lockReason}
          >
            <ModelChip
              repoId={task.repoId}
              model={normalizeAIModel(task.model)}
              traits={storedRunTraits(task)}
              onModelChange={(model) => update({ model }, "Couldn't change the model")}
              onTraitsChange={(partial: StoredModelTraits) =>
                update(toRunTraitArgs(partial), "Couldn't change the model")
              }
              account={{
                accounts: toPickerAccounts(taskAccounts ?? []),
                value: task.providerAccountId ?? null,
                onChange: (providerAccountId) => {
                  if (isOwner) update({ providerAccountId }, "Couldn't change the account");
                },
              }}
            />
          </View>
        </FieldGroup>
      )}
    </>
  );
}
