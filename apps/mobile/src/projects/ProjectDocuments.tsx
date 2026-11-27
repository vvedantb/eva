import { api, type Id } from "@eva/backend";
import type { ChatSourceLabelFields } from "@eva/shared";
import { CHAT_LOG_KIND_LABELS } from "@eva/shared/chatLog";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconFile } from "@tabler/icons-react-native";
import { CenteredSpinner, EmptyState, ListDivider } from "@vvedantb/native-ui/primitives";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ScrollView, Text, View } from "react-native";
import { ChatArtifactCard } from "@/chat/cards/TurnOutputs";
import { ChatSourceBadge, DocListRow, useDocActions } from "@/docs/DocsSection";
import type { ProjectTaskListRow } from "@/projects/useProjectStatus";
import { META_TEXT, MetaPill } from "@/quickTasks/QuickTaskRow";
import { displayTitle, timeAgo } from "@/ui/format";
import { FieldGroup } from "@/ui/FieldRows";
import { useScheme, XS_TRACKING } from "@/ui/theme";

type LogEntry = FunctionReturnType<typeof api.chatLog.listForSource>[number];
type ChatSource = FunctionReturnType<typeof api.docs.listForSource>[number]["source"];

function taskBadge(source: ChatSource): ChatSourceLabelFields | null {
  return source?.kind === "task" ? source : null;
}

/**
 * The web project Documents and Artifacts tabs in one column: the Log
 * (current entries, newest first), the documents, then the artifacts. The
 * project's lists roll up its child tasks' rows (`listForSource` with a
 * project source), and a row a child task made names that task, as the web.
 * A document opens on tap (`/doc/<id>`) and has the Documents row menu on a
 * long press; an artifact is the chat's artifact card.
 */
export function ProjectDocuments({
  projectId,
  repoId,
  tasks,
}: {
  projectId: Id<"projects">;
  repoId: Id<"githubRepos">;
  tasks: ProjectTaskListRow[] | undefined;
}) {
  const source = { kind: "project" as const, projectId };
  const docs = useQuery(api.docs.listForSource, { source });
  const artifacts = useQuery(api.artifacts.listForSource, { source });
  const log = useQuery(api.chatLog.listForSource, { source });
  const actions = useDocActions();
  if (docs === undefined || artifacts === undefined || log === undefined) {
    return <CenteredSpinner label="Loading documents" />;
  }
  const entries = log.filter((entry) => entry.supersededById === undefined).reverse();
  if (docs.length === 0 && artifacts.length === 0 && entries.length === 0) {
    return <EmptyState icon={IconFile} title="No documents yet" />;
  }
  const tasksById = new Map((tasks ?? []).map((task) => [String(task._id), task]));
  const entryTask = (entry: LogEntry): ChatSourceLabelFields | undefined => {
    const task = entry.sourceTaskId ? tasksById.get(entry.sourceTaskId) : undefined;
    return task && task.locked !== true ? { kind: "task", numId: task.numId, title: task.title } : undefined;
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
      {entries.length > 0 ? (
        <FieldGroup title="Log">
          {entries.map((entry, index) => (
            <View key={entry._id}>
              {index > 0 ? <ListDivider /> : null}
              <LogEntryRow entry={entry} task={entryTask(entry)} />
            </View>
          ))}
        </FieldGroup>
      ) : null}
      {docs.length > 0 ? (
        <FieldGroup title="Documents">
          {docs.map((doc, index) => (
            <View key={doc._id} className="-mx-4">
              {index > 0 ? <ListDivider /> : null}
              <DocListRow doc={doc} repoId={repoId} source={taskBadge(doc.source)} onLongPress={() => actions.openSheet(doc)} />
            </View>
          ))}
        </FieldGroup>
      ) : null}
      {artifacts.length > 0 ? (
        <FieldGroup title="Artifacts">
          <View className="gap-3">
            {artifacts.map((artifact) => {
              const task = taskBadge(artifact.source);
              return (
                <View key={artifact._id} className="gap-1.5">
                  {task ? <ChatSourceBadge source={task} /> : null}
                  <ChatArtifactCard artifact={artifact} />
                </View>
              );
            })}
          </View>
        </FieldGroup>
      ) : null}
      {actions.dialogs}
    </ScrollView>
  );
}

function LogEntryRow({ entry, task }: { entry: LogEntry; task: ChatSourceLabelFields | undefined }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View className="gap-1.5 px-2 py-3">
      <View className="flex-row items-center gap-1.5">
        <MetaPill label={CHAT_LOG_KIND_LABELS[entry.kind]} />
        {task ? <ChatSourceBadge source={task} /> : null}
        <Text
          className="font-instrument-sans ml-auto"
          style={{ ...META_TEXT, color: theme.mutedForeground, letterSpacing: XS_TRACKING, fontVariant: ["tabular-nums"] }}
        >
          {timeAgo(entry.createdAt)}
        </Text>
      </View>
      <Text className="font-instrument-sans text-sm" style={{ color: theme.foreground }}>
        {displayTitle(entry.title)}
      </Text>
    </View>
  );
}
