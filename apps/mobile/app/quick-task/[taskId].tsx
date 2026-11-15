import { api, getAIModelProvider, normalizeAIModel, taskScheduledAt, type Id } from "@eva/backend";
import { PRIORITY_LABELS, TASK_STATUS_LABELS, formatEntityNumLabel } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { canEditTaskText, getUserDisplayName, taskTextLockReason } from "@eva/shared/taskDetail";
import { IconChecklist, IconClock, IconDots, IconFolder, IconMessage, IconPlayerPlay, IconTag, IconUserPlus } from "@tabler/icons-react-native";
import { PromptInput } from "@vvedantb/native-ui/ai";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import { Button, CenteredSpinner, EmptyState, KeyboardAvoidingView } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import dayjs from "dayjs";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View, type TextStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ComposerMentionChips, UserMessageText } from "@/chat/MentionChip";
import { MentionMenu } from "@/chat/MentionMenu";
import { useMentionComposer } from "@/chat/useMentionComposer";
import { UserAttachments } from "@/chat/media/UserAttachments";
import { PrioritySheet, ProjectSheet, ReviewerSheet, TagsSheet, TaskStatusRows } from "@/quickTasks/OptionChips";
import { FooterSheet } from "@/chat/ComposerFooter";
import { PriorityIcon } from "@/quickTasks/PriorityIcon";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import { ReactionChips, TaskActivity, useTaskReactions } from "@/quickTasks/TaskActivity";
import { useQuickTaskActions } from "@/quickTasks/useQuickTaskActions";
import { FieldGroup, FieldRow } from "@/ui/FieldRows";
import { displayTitle } from "@/ui/format";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { useScheme } from "@/ui/theme";

type QuickTask = FunctionReturnType<typeof api.agentTasks.getAllTasks>[number];
type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];
type Field = "status" | "priority" | "reviewer" | "tags" | "project";

/**
 * One quick task, as the web task page (`TaskDetailInline`) on a phone, in one
 * column: the number and title, the description, the attachments, the web
 * Properties pane (Status, Priority, Code Reviewer, Labels, Project, each a
 * sheet that writes at once), then Activity and a comment box. The header
 * "…" is the row's long-press menu. The bottom bar opens the task chat (with
 * the unread dot) and, when the web shows it, Run Eva. The title and the
 * description edit in place while the web allows it (`canEditTaskText`).
 * Routes as `/quick-task/<taskId>?repo=<repoId>`; the task resolves through
 * the repo's list, so its id keeps its table type.
 */
export default function QuickTaskScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId: string; repo?: string }>();
  const leave = () => goBackOrReplace(router, "/sessions");
  const repos = useQuery(api.githubRepos.list, {});
  const repo = repos?.find((candidate) => candidate._id === params.repo);
  const tasks = useQuery(api.agentTasks.getAllTasks, repo ? { repoId: repo._id } : "skip");
  const task = tasks?.find((candidate) => candidate._id === params.taskId);

  const loading = repos === undefined || (repo !== undefined && tasks === undefined);
  if (loading || !repo || !task || !tasks) {
    return (
      <View className="flex-1">
        <StackPageHeader title="Task" onBack={leave} />
        {loading ? (
          <CenteredSpinner label="Loading task" />
        ) : (
          // The web `EntityNotFound` for a task.
          <EmptyState icon={IconChecklist} title="Task not found" description="It was deleted, or you no longer have access." />
        )}
      </View>
    );
  }
  const allTags = [...new Set(tasks.flatMap((entry) => entry.tags ?? []))].sort();
  return <TaskOverview task={task} repo={repo} allTags={allTags} onLeave={leave} />;
}

function TaskOverview({ task, repo, allTags, onLeave }: { task: QuickTask; repo: Repo; allTags: string[]; onLeave: () => void }) {
  const users = useQuery(api.users.listAll, {});
  const projects = useQuery(api.projects.list, { repoId: repo._id });
  const actions = useQuickTaskActions({ repo, users, projects, onDeleted: onLeave });
  const theme = EVA_THEME[useScheme()];
  const currentUserId = useQuery(api.auth.me, {});
  const runs = useQuery(api.agentRuns.listByTask, { taskId: task._id });
  const attachments = useQuery(api.agentTasks.listAttachments, { taskId: task._id });
  const updateTask = useMutation(api.agentTasks.update);
  const reactionsFor = useTaskReactions(task._id, users, currentUserId);

  const hasActiveRun = runs?.some((run) => run.status === "queued" || run.status === "running") ?? false;
  const editable = runs !== undefined && canEditTaskText(task.status, hasActiveRun);
  const update: UpdateTask = (fields, failure) => {
    updateTask({ id: task._id, ...fields }).catch(() => toast.error(failure));
  };
  const creator = users?.find((user) => user._id === task.createdBy);
  const scheduledAt = taskScheduledAt(task);
  const descriptionReactions = reactionsFor("description", task._id);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }}>
      <StackPageHeader
        title={formatEntityNumLabel({ numId: task.numId }) ?? "Task"}
        onBack={onLeave}
        headerRight={<MoreButton onPress={() => actions.openSheet(task)} />}
      />
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}>
        <TaskTitle
          title={task.title}
          editable={editable}
          lockReason={runs === undefined ? undefined : taskTextLockReason(hasActiveRun, "Title")}
          onSave={(title) => update({ title }, "Couldn't rename the task")}
        />
        {scheduledAt ? (
          <View className="mt-2 flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1" style={{ backgroundColor: withAlpha(theme.primary, 0.1) }}>
            <IconClock size={12} color={theme.primary} />
            <Text className="font-instrument-sans-medium text-xs" style={{ color: theme.primary, fontWeight: "500" }}>
              {`${task.status === "todo" ? "Scheduled for" : "Was scheduled for"} ${dayjs(scheduledAt).format("MMM D, h:mm A")}`}
            </Text>
          </View>
        ) : null}

        <View className="mt-4 gap-2">
          <TaskDescription
            description={task.description}
            repoId={repo._id}
            model={task.model}
            editable={editable}
            onSave={(description) => update({ description }, "Couldn't save the description")}
          />
          {descriptionReactions.groups.length > 0 ? (
            <ReactionChips groups={descriptionReactions.groups} onToggle={descriptionReactions.toggle} />
          ) : null}
        </View>
        {attachments && attachments.length > 0 ? (
          <View className="mt-4">
            <UserAttachments attachments={attachments.flatMap((entry) => (entry.url ? [{ url: entry.url, contentType: entry.contentType }] : []))} />
          </View>
        ) : null}

        <TaskProperties task={task} users={users} projects={projects} allTags={allTags} update={update} />

        <FieldGroup title="Activity">
          <View className="px-1 pt-1">
            <TaskActivity taskId={task._id} createdAt={task.createdAt} creator={creator} users={users} reactionsFor={reactionsFor} isProjectTask={task.projectId !== undefined} />
          </View>
        </FieldGroup>
        <View className="mt-4">
          <CommentComposer taskId={task._id} repoId={repo._id} model={task.model} />
        </View>
      </ScrollView>
      <TaskDock task={task} runs={runs} hasActiveRun={hasActiveRun} />

      {actions.dialogs}
    </KeyboardAvoidingView>
  );
}

type UpdateTask = (fields: Omit<FunctionArgs<typeof api.agentTasks.update>, "id">, failure: string) => void;

/** The web Properties pane (`StatusFieldsSection`): a row per field; a tap opens its sheet, and a pick writes at once. */
function TaskProperties({
  task,
  users,
  projects,
  allTags,
  update,
}: {
  task: QuickTask;
  users: User[] | undefined;
  projects: FunctionReturnType<typeof api.projects.list> | undefined;
  allTags: string[];
  update: UpdateTask;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const updateStatus = useMutation(api.agentTasks.updateStatus);
  const [field, setField] = useState<Field | null>(null);
  const reviewer = task.assignedTo ? users?.find((user) => user._id === task.assignedTo) : undefined;
  const project = task.projectId ? projects?.find((entry) => entry._id === task.projectId) : undefined;
  const status = task.status === "draft" ? undefined : statusAppearance(task.status, scheme);
  return (
    <>
      <FieldGroup title="Properties">
        {status ? (
          <FieldRow
            label="Status"
            icon={<status.icon size={16} color={status.text} />}
            value={TASK_STATUS_LABELS[task.status]}
            color={status.text}
            onPress={() => setField("status")}
          />
        ) : null}
        <FieldRow
          label="Priority"
          icon={<PriorityIcon level={task.priority} />}
          value={task.priority ? PRIORITY_LABELS[task.priority] : "Priority"}
          color={task.priority ? undefined : muted}
          onPress={() => setField("priority")}
        />
        <FieldRow
          label="Code Reviewer"
          icon={reviewer ? <InitialsAvatar user={reviewer} size={16} /> : <IconUserPlus size={16} color={muted} />}
          value={reviewer ? getUserDisplayName(reviewer) : "Code Reviewer"}
          color={reviewer ? undefined : muted}
          onPress={() => setField("reviewer")}
        />
        <FieldRow
          label="Labels"
          icon={<IconTag size={16} color={muted} />}
          value={task.tags && task.tags.length > 0 ? task.tags.join(", ") : "Labels"}
          color={task.tags && task.tags.length > 0 ? undefined : muted}
          onPress={() => setField("tags")}
        />
        <FieldRow
          label="Project"
          icon={<IconFolder size={16} color={muted} />}
          value={project ? project.title : "Project"}
          color={project ? undefined : muted}
          onPress={() => setField("project")}
        />
      </FieldGroup>
      <FooterSheet open={field === "status"} onOpenChange={(open) => setField(open ? "status" : null)} title="Status">
        <TaskStatusRows
          value={task.status}
          onPick={(next) => {
            setField(null);
            updateStatus({ id: task._id, status: next }).catch(() => toast.error("Couldn't change the status"));
          }}
        />
      </FooterSheet>
      <PrioritySheet
        open={field === "priority"}
        onOpenChange={(open) => setField(open ? "priority" : null)}
        value={task.priority}
        onChange={(priority) => update({ priority: priority ?? null }, "Couldn't change the priority")}
      />
      <ReviewerSheet
        open={field === "reviewer"}
        onOpenChange={(open) => setField(open ? "reviewer" : null)}
        users={users}
        value={task.assignedTo}
        onChange={(assignedTo) => update({ assignedTo: assignedTo ?? null }, "Couldn't assign the task")}
      />
      <TagsSheet
        open={field === "tags"}
        onOpenChange={(open) => setField(open ? "tags" : null)}
        allTags={allTags}
        value={task.tags ?? []}
        onChange={(tags) => update({ tags }, "Couldn't change the labels")}
      />
      <ProjectSheet
        open={field === "project"}
        onOpenChange={(open) => setField(open ? "project" : null)}
        projects={projects}
        value={task.projectId}
        onChange={(projectId) => update({ projectId: projectId ?? null }, "Couldn't change the project")}
      />
    </>
  );
}

/** The web `TaskHeader` title: a tap edits it while editable; Return or leaving the field saves a changed, non-empty title. */
function TaskTitle({
  title,
  editable,
  lockReason,
  onSave,
}: {
  title: string;
  editable: boolean;
  lockReason: string | undefined;
  onSave: (title: string) => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const [editing, setEditing] = useState<string | null>(null);
  const style: TextStyle = { fontSize: 18, lineHeight: 26, fontWeight: "600", color: theme.foreground };
  if (editing !== null) {
    const save = () => {
      const trimmed = editing.trim();
      if (trimmed && trimmed !== title) onSave(trimmed);
      setEditing(null);
    };
    return (
      <TextInput
        autoFocus
        accessibilityLabel="Task title"
        value={editing}
        onChangeText={setEditing}
        // Return blurs (`blurAndSubmit`), so leaving the field is the one save.
        onBlur={save}
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        multiline
        className="font-instrument-sans-semibold rounded-lg px-2 py-1"
        style={{ ...style, marginHorizontal: -8, backgroundColor: theme.secondary }}
      />
    );
  }
  return (
    <Pressable
      accessibilityRole={editable ? "button" : "header"}
      accessibilityLabel={displayTitle(title)}
      accessibilityHint={editable ? "Edits the title" : lockReason}
      disabled={!editable}
      onPress={() => setEditing(title)}
      className="active:opacity-70"
    >
      <Text accessibilityRole="header" className="font-instrument-sans-semibold" style={style}>
        {displayTitle(title)}
      </Text>
    </Pressable>
  );
}

/**
 * The web `TaskDescription`: the Markdown with mention chips, or "No
 * description". While editable a tap opens the mention composer on it ("Add
 * description..." when empty); its send saves, Cancel leaves it as it was.
 */
function TaskDescription({
  description,
  repoId,
  model,
  editable,
  onSave,
}: {
  description: string | undefined;
  repoId: Id<"githubRepos">;
  model: QuickTask["model"];
  editable: boolean;
  onSave: (description: string) => void;
}) {
  const theme = EVA_THEME[useScheme()];
  const composer = useMentionComposer(repoId, getAIModelProvider(normalizeAIModel(model)));
  const [editing, setEditing] = useState(false);
  const text = description?.trim() ?? "";
  if (editing) {
    return (
      <View className="gap-2">
        <PromptInput
          value={composer.text}
          onChangeText={composer.setText}
          menu={composer.menu ? <MentionMenu menu={composer.menu} onPick={composer.pick} onDismiss={composer.dismiss} /> : null}
          header={composer.picks.length > 0 ? <ComposerMentionChips picks={composer.picks} onRemove={composer.removePick} /> : undefined}
          onSubmit={(next) => {
            const tokenized = composer.tokenize(next).trim();
            if (tokenized !== text) onSave(tokenized);
            setEditing(false);
          }}
          placeholder="Add description..."
          accessibilityLabel="Task description"
        />
        <View className="flex-row justify-end">
          <Button variant="ghost" size="sm" onPress={() => setEditing(false)}>
            Cancel
          </Button>
        </View>
      </View>
    );
  }
  const body = text ? (
    <UserMessageText content={text} />
  ) : (
    <Text className="font-instrument-sans text-sm" style={{ color: withAlpha(theme.mutedForeground, 0.6) }}>
      {editable ? "Add description..." : "No description"}
    </Text>
  );
  if (!editable) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text ? "Edit description" : "Add description"}
      onPress={() => {
        composer.load(text);
        setEditing(true);
      }}
      className="rounded-lg active:opacity-70"
    >
      {body}
    </Pressable>
  );
}

/** The web "Add a comment...": the mention composer; a send posts a top-level comment. */
function CommentComposer({ taskId, repoId, model }: { taskId: Id<"agentTasks">; repoId: Id<"githubRepos">; model: QuickTask["model"] }) {
  const composer = useMentionComposer(repoId, getAIModelProvider(normalizeAIModel(model)));
  const createComment = useMutation(api.taskComments.create);
  const [sending, setSending] = useState(false);
  const send = async (text: string) => {
    const content = composer.tokenize(text).trim();
    if (!content) return;
    setSending(true);
    try {
      await createComment({ taskId, content });
      composer.load("");
    } catch {
      toast.error("Couldn't post the comment");
    }
    setSending(false);
  };
  return (
    <PromptInput
      value={composer.text}
      onChangeText={composer.setText}
      status={sending ? "submitted" : "ready"}
      disabled={sending}
      menu={composer.menu ? <MentionMenu menu={composer.menu} onPick={composer.pick} onDismiss={composer.dismiss} /> : null}
      header={composer.picks.length > 0 ? <ComposerMentionChips picks={composer.picks} onRemove={composer.removePick} /> : undefined}
      onSubmit={(text) => void send(text)}
      placeholder="Add a comment..."
      accessibilityLabel="Add a comment"
    />
  );
}

/** The header "…": a 44 ghost square with the muted dots, as on the project page. */
function MoreButton({ onPress }: { onPress: () => void }) {
  const muted = EVA_THEME[useScheme()].mutedForeground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Task actions"
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-lg active:opacity-70"
    >
      <IconDots size={16} color={muted} />
    </Pressable>
  );
}

/**
 * The bottom bar, as the project page: "Chat" (the task chat, with the unread
 * dot) and, when the web shows its Run button, "Run Eva" (outside a project;
 * a first run from To Do, or In Progress with no run going).
 */
function TaskDock({
  task,
  runs,
  hasActiveRun,
}: {
  task: QuickTask;
  runs: FunctionReturnType<typeof api.agentRuns.listByTask> | undefined;
  hasActiveRun: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = EVA_THEME[useScheme()];
  const startExecution = useMutation(api.agentTasks.startExecution);
  const [busy, setBusy] = useState(false);
  const canRun =
    task.projectId === undefined &&
    runs !== undefined &&
    ((task.status === "todo" && runs.length === 0) || (task.status === "in_progress" && !hasActiveRun));
  const unread = task.hasUnread && !task.isExecuting;
  const run = async () => {
    setBusy(true);
    try {
      await startExecution({ id: task._id });
    } catch {
      toast.error("Couldn't start task");
    }
    setBusy(false);
  };
  return (
    <View className="flex-row gap-2 px-4 pt-2" style={{ paddingBottom: insets.bottom + 12 }}>
      <View className="min-w-0 flex-1">
        <Button
          variant="secondary"
          accessibilityLabel={unread ? "Chat, unread reply" : "Chat"}
          leftIcon={<IconMessage size={16} color={theme.secondaryForeground} />}
          onPress={() => router.push({ pathname: "/chat/[target]", params: { target: task._id } })}
        >
          Chat
        </Button>
        {unread ? <View pointerEvents="none" className="absolute right-3 top-3 size-1.5 rounded-full" style={{ backgroundColor: theme.primary }} /> : null}
      </View>
      {canRun ? (
        <View className="min-w-0 flex-1">
          <Button loading={busy} disabled={busy} leftIcon={<IconPlayerPlay size={16} color={theme.primaryForeground} />} onPress={() => void run()}>
            Run Eva
          </Button>
        </View>
      ) : null}
    </View>
  );
}
