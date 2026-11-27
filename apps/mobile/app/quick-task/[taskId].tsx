import {
  api,
  getAIModelProvider,
  normalizeAIModel,
  taskScheduledAt,
  type AIModel,
  type Id,
} from "@eva/backend";
import { useTaskChatModel } from "@/quickTasks/useTaskChatModel";
import {
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  formatEntityNumLabel,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import {
  taskReplyTypingRoom,
  taskTypingRoom,
} from "@eva/shared/typingPresence";
import {
  canEditTaskText,
  getUserDisplayName,
  taskTextLockReason,
} from "@eva/shared/taskDetail";
import {
  IconChecklist,
  IconCalendarClock,
  IconClock,
  IconFolder,
  IconMessage,
  IconPlayerPlay,
  IconTag,
  IconUserPlus,
} from "@tabler/icons-react-native";
import { PromptInput } from "@vvedantb/native-ui/ai";
import { goBackOrReplace } from "@vvedantb/native-ui/expo-router";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import {
  Button,
  CenteredSpinner,
  EmptyState,
} from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import dayjs from "dayjs";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ComposerMentionChips } from "@/chat/MentionChip";
import { MentionMenu } from "@/chat/MentionMenu";
import { TypingIndicator } from "@/chat/TypingIndicator";
import { useDraftSync, type DraftTarget } from "@/chat/useDraftSync";
import { useMentionComposer } from "@/chat/useMentionComposer";
import { ScheduleSheet } from "@/ui/ScheduleSheet";
import { useTypingPresence } from "@/chat/useTypingPresence";
import { UserAttachments } from "@/chat/media/UserAttachments";
import {
  PrioritySheet,
  ProjectSheet,
  ReviewerSheet,
  TagsSheet,
  TaskStatusRows,
} from "@/quickTasks/OptionChips";
import { FooterSheet } from "@/chat/ComposerFooter";
import { PriorityIcon } from "@/quickTasks/PriorityIcon";
import { statusAppearance } from "@/quickTasks/statusAppearance";
import { TaskActivity, useTaskReactions } from "@/quickTasks/TaskActivity";
import {
  CommentModeChip,
  TaskSubscribers,
  useCommentMutations,
  type CommentMode,
} from "@/quickTasks/TaskDiscussion";
import { useQuickTaskActions } from "@/quickTasks/useQuickTaskActions";
import { useTaskGitActions } from "@/sandbox/OwnedSandboxActions";
import { FieldGroup, FieldRow } from "@/ui/FieldRows";
import { InitialsAvatar } from "@/ui/InitialsAvatar";
import { useScheme } from "@/ui/theme";
import { HeaderMoreButton } from "@/ui/HeaderRail";
import { ArchivedBar } from "@/ui/ArchivedBar";
import { TaskDescription, TaskTitle } from "@/quickTasks/TaskText";

/** A quick-task row (`getAllTasks`); `listByProject` shares its validator. */
type QuickTask = FunctionReturnType<typeof api.agentTasks.listByProject>[number];
type Repo = FunctionReturnType<typeof api.githubRepos.list>[number];
type User = FunctionReturnType<typeof api.users.listAll>[number];
type Field = "status" | "priority" | "reviewer" | "tags" | "project";

/**
 * One quick task, as the web task page (`TaskDetailInline`) on a phone, in one
 * column: the number and title, the description, the attachments, the web
 * Properties pane (Status, Priority, Code Reviewer, Labels, Project, each a
 * sheet that writes at once), then Activity (subscribers, the timeline, and
 * each comment's menu: reactions, Reply, Edit, Copy text, Delete) and the
 * comment box, which also replies and edits. The header
 * "…" is the row's long-press menu. The bottom bar opens the task chat (with
 * the unread dot) and, when the web shows it, Run Eva. The title and the
 * description edit in place while the web allows it (`canEditTaskText`).
 * Routes as `/quick-task/<taskId>?repo=<repoId>&numId=<numId>`; the task
 * resolves through the repo's quick tasks (live, then archived), so its id
 * keeps its table type. An archived task opens read-only under its
 * `ArchivedBar`. A project task is never a quick task: it resolves by its
 * number (`getByNumId`) and opens as its chat, as on the web (a link to it
 * lands here).
 */
export default function QuickTaskScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId: string; repo?: string; numId?: string }>();
  const leave = () => goBackOrReplace(router, "/sessions");
  const repos = useQuery(api.githubRepos.list, {});
  const repo = repos?.find((candidate) => candidate._id === params.repo);
  const tasks = useQuery(
    api.agentTasks.getAllTasks,
    repo ? { repoId: repo._id } : "skip",
  );
  const liveTask = tasks?.find((candidate) => candidate._id === params.taskId);
  const archivedTasks = useQuery(
    api.agentTasks.listArchived,
    repo && tasks !== undefined && liveTask === undefined ? { repoId: repo._id } : "skip",
  );
  const quickTask = liveTask ?? archivedTasks?.find((candidate) => candidate._id === params.taskId);
  const numId = Number(params.numId);
  const byNumber =
    repo !== undefined && archivedTasks !== undefined && quickTask === undefined && Number.isInteger(numId);
  const numbered = useQuery(api.agentTasks.getByNumId, repo && byNumber ? { repoId: repo._id, numId } : "skip");
  // A project task is its chat.
  if (numbered?._id === params.taskId && numbered.projectId !== undefined) {
    return <Redirect href={{ pathname: "/chat/[target]", params: { target: numbered._id } }} />;
  }
  const task = quickTask;

  const loading =
    repos === undefined ||
    (repo !== undefined && tasks === undefined) ||
    (liveTask === undefined && tasks !== undefined && archivedTasks === undefined) ||
    (byNumber && numbered === undefined);
  if (loading || !repo || !task || !tasks) {
    return (
      <View className="flex-1">
        <StackPageHeader title="Task" onBack={leave} />
        {loading ? (
          <CenteredSpinner label="Loading task" />
        ) : (
          // The web `EntityNotFound` for a task.
          <EmptyState
            icon={IconChecklist}
            title="Task not found"
            description="It does not exist, or you no longer have access."
          />
        )}
      </View>
    );
  }
  const allTags = [
    ...new Set(tasks.flatMap((entry) => entry.tags ?? [])),
  ].sort();
  return (
    <TaskOverview task={task} repo={repo} allTags={allTags} onLeave={leave} />
  );
}

function TaskOverview({
  task,
  repo,
  allTags,
  onLeave,
}: {
  task: QuickTask;
  repo: Repo;
  allTags: string[];
  onLeave: () => void;
}) {
  const users = useQuery(api.users.listAll, {});
  const projects = useQuery(api.projects.list, { repoId: repo._id });
  // One read for both task kinds, as on the web (`useTaskDetail`).
  const runFacts = useQuery(api.agentTasks.getRunFacts, { taskId: task._id });
  const hasActiveRun = runFacts?.hasActiveRun ?? false;
  const hasRuns = runFacts?.hasRuns ?? false;
  // A project archives with its tasks, so its task is read-only too.
  const project = useQuery(api.projects.get, task.projectId ? { id: task.projectId } : "skip");
  // The web page's sandbox and git actions, leading the "…" sheet.
  const git = useTaskGitActions({ task, projectPrUrl: project?.prUrl, hasRuns, hasActiveRun });
  const archived = task.archivedAt !== undefined;
  const readOnly = archived || project?.archivedAt !== undefined;
  const actions = useQuickTaskActions({
    repo,
    users,
    projects,
    onArchived: onLeave,
    extraRows: git.rows,
    readOnly,
  });
  const theme = EVA_THEME[useScheme()];
  const currentUserId = useQuery(api.auth.me, {});
  const attachments = useQuery(api.agentTasks.listAttachments, {
    taskId: task._id,
  });
  const updateTask = useMutation(api.agentTasks.update);
  const reactionsFor = useTaskReactions(task._id, users, currentUserId);
  const taskModel = useTaskChatModel(task._id);

  const editable = !readOnly && runFacts !== undefined && canEditTaskText(task.status, hasActiveRun);
  const update: UpdateTask = (fields, failure) => {
    updateTask({ id: task._id, ...fields }).catch(() => toast.error(failure));
  };
  const creator = users?.find((user) => user._id === task.createdBy);
  const scheduledAt = taskScheduledAt(task);
  // The web `SchedulePopover`: a first run at a time, changed or removed until it starts.
  const [scheduling, setScheduling] = useState(false);
  const schedule = useMutation(api.agentTasks.scheduleExecution);
  const updateSchedule = useMutation(api.agentTasks.updateScheduledExecution);
  const cancelSchedule = useMutation(api.agentTasks.cancelScheduledExecution);
  const pendingSchedule = task.status === "todo" ? scheduledAt : undefined;
  const writeSchedule = (write: Promise<unknown>, done: string, failure: string) => {
    setScheduling(false);
    write.then(() => toast.success(done)).catch(() => toast.error(failure));
  };
  const comments = useCommentMutations(task._id);
  const [commentMode, setCommentMode] = useState<CommentMode>({ kind: "new" });
  const scroll = useRef<KeyboardAwareScrollViewRef>(null);
  // Reply and Edit happen in the comment box at the end: bring it into view.
  const changeCommentMode = (mode: CommentMode) => {
    setCommentMode(mode);
    if (mode.kind !== "new") scroll.current?.scrollToEnd({ animated: true });
  };

  return (
    <View className="flex-1">
      <StackPageHeader
        title={formatEntityNumLabel({ numId: task.numId }) ?? "Task"}
        onBack={onLeave}
        headerRight={<HeaderMoreButton label="Task actions" onPress={() => actions.openSheet(task)} />}
      />
      {archived ? <ArchivedBar onUnarchive={() => actions.unarchive(task._id)} /> : null}
      {/* The focused field (the comment box, the description or the title) scrolls into view 16 above the keyboard. */}
      <KeyboardAwareScrollView
        ref={scroll}
        bottomOffset={16}
        // A style, not a class: the keyboard-controller view takes no NativeWind `className`.
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 24,
        }}
      >
        <TaskTitle
          title={task.title}
          editable={editable}
          lockReason={
            runFacts === undefined
              ? undefined
              : taskTextLockReason(hasActiveRun, "Title")
          }
          onSave={(title) => update({ title }, "Couldn't rename the task")}
        />
        {scheduledAt ? (
          <Pressable
            accessibilityRole={task.status === "todo" && !readOnly ? "button" : "text"}
            accessibilityHint={task.status === "todo" && !readOnly ? "Changes or removes the schedule" : undefined}
            disabled={task.status !== "todo" || readOnly}
            onPress={() => setScheduling(true)}
            hitSlop={{ top: 8, bottom: 8 }}
            className="mt-2 flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1 active:opacity-70"
            style={{ backgroundColor: withAlpha(theme.primary, 0.1) }}
          >
            <IconClock size={12} color={theme.primary} />
            <Text
              className="font-instrument-sans-medium text-xs"
              style={{ color: theme.primary, fontWeight: "500" }}
            >
              {`${task.status === "todo" ? "Scheduled for" : "Was scheduled for"} ${dayjs(scheduledAt).format("MMM D, h:mm A")}`}
            </Text>
          </Pressable>
        ) : null}

        <View className="mt-4 gap-2">
          <TaskDescription
            description={task.description}
            repoId={repo._id}
            model={taskModel}
            editable={editable}
            reactions={reactionsFor("description", task._id)}
            onSave={(description) =>
              update({ description }, "Couldn't save the description")
            }
          />
        </View>
        {attachments && attachments.length > 0 ? (
          <View className="mt-4">
            <UserAttachments
              attachments={attachments.flatMap((entry) =>
                entry.url
                  ? [{ url: entry.url, contentType: entry.contentType }]
                  : [],
              )}
            />
          </View>
        ) : null}

        <TaskProperties
          task={task}
          users={users}
          projects={projects}
          allTags={allTags}
          update={update}
          readOnly={readOnly}
        />

        <FieldGroup title="Activity">
          <TaskSubscribers taskId={task._id} users={users} />
          <View className="px-1 pt-1">
            <TaskActivity
              taskId={task._id}
              createdAt={task.createdAt}
              creator={creator}
              users={users}
              reactionsFor={reactionsFor}
              currentUserId={currentUserId}
              readOnly={readOnly}
              onReply={(comment) => changeCommentMode({ kind: "reply", comment })}
              onEdit={(comment) => changeCommentMode({ kind: "edit", comment })}
              onDelete={(id) => {
                comments.remove(id);
                if (
                  commentMode.kind !== "new" &&
                  commentMode.comment._id === id
                )
                  setCommentMode({ kind: "new" });
              }}
            />
          </View>
        </FieldGroup>
        <View className="mt-4">
          {/* Once the person is known: presence heartbeats need their id. */}
          {currentUserId && !readOnly ? (
            <CommentComposer
              currentUserId={currentUserId}
              taskId={task._id}
              repoId={repo._id}
              model={taskModel}
              users={users}
              mode={commentMode}
              onModeChange={changeCommentMode}
            />
          ) : null}
        </View>
      </KeyboardAwareScrollView>
      <ScheduleSheet
        open={scheduling}
        onOpenChange={setScheduling}
        title="Schedule run"
        scheduledAt={pendingSchedule}
        onSchedule={(at) =>
          pendingSchedule === undefined
            ? writeSchedule(schedule({ id: task._id, scheduledAt: at }), "Task scheduled", "Couldn't schedule task")
            : writeSchedule(updateSchedule({ id: task._id, scheduledAt: at }), "Schedule updated", "Couldn't update schedule")
        }
        onRemove={() => writeSchedule(cancelSchedule({ id: task._id }), "Schedule removed", "Couldn't remove schedule")}
      />
      <TaskDock onSchedule={() => setScheduling(true)} task={task} hasRuns={runFacts?.hasRuns} hasActiveRun={hasActiveRun} />

      {actions.dialogs}
      {git.dialogs}
    </View>
  );
}

type UpdateTask = (
  fields: Omit<FunctionArgs<typeof api.agentTasks.update>, "id">,
  failure: string,
) => void;

/**
 * A quick task's web Properties pane (`StatusFieldsSection`): a row per
 * field; a tap opens its sheet, and a pick writes at once. Read-only
 * (archived), the rows only show their values.
 */
function TaskProperties({
  task,
  users,
  projects,
  allTags,
  update,
  readOnly,
}: {
  task: QuickTask;
  users: User[] | undefined;
  projects: FunctionReturnType<typeof api.projects.list> | undefined;
  allTags: string[];
  update: UpdateTask;
  readOnly: boolean;
}) {
  const scheme = useScheme();
  const muted = EVA_THEME[scheme].mutedForeground;
  const updateStatus = useMutation(api.agentTasks.updateStatus);
  const [field, setField] = useState<Field | null>(null);
  const openField = (next: Field) => (readOnly ? undefined : () => setField(next));
  const reviewer = task.assignedTo
    ? users?.find((user) => user._id === task.assignedTo)
    : undefined;
  const project = task.projectId
    ? projects?.find((entry) => entry._id === task.projectId)
    : undefined;
  const status =
    task.status === "draft" ? undefined : statusAppearance(task.status, scheme);
  return (
    <>
      <FieldGroup title="Properties">
        {status ? (
          <FieldRow
            label="Status"
            icon={<status.icon size={16} color={status.text} />}
            value={TASK_STATUS_LABELS[task.status]}
            color={status.text}
            onPress={openField("status")}
          />
        ) : null}
        <FieldRow
          label="Priority"
          icon={<PriorityIcon level={task.priority} />}
          value={task.priority ? PRIORITY_LABELS[task.priority] : "Priority"}
          color={task.priority ? undefined : muted}
          onPress={openField("priority")}
        />
        <FieldRow
          label="Code Reviewer"
          icon={
            reviewer ? (
              <InitialsAvatar user={reviewer} size={16} />
            ) : (
              <IconUserPlus size={16} color={muted} />
            )
          }
          value={reviewer ? getUserDisplayName(reviewer) : "Code Reviewer"}
          color={reviewer ? undefined : muted}
          onPress={openField("reviewer")}
        />
        <FieldRow
          label="Labels"
          icon={<IconTag size={16} color={muted} />}
          value={
            task.tags && task.tags.length > 0 ? task.tags.join(", ") : "Labels"
          }
          color={task.tags && task.tags.length > 0 ? undefined : muted}
          onPress={openField("tags")}
        />
        <FieldRow
          label="Project"
          icon={<IconFolder size={16} color={muted} />}
          value={project ? project.title : "Project"}
          color={project ? undefined : muted}
          onPress={openField("project")}
        />
      </FieldGroup>
      <FooterSheet
        open={field === "status"}
        onOpenChange={(open) => setField(open ? "status" : null)}
        title="Status"
      >
        <TaskStatusRows
          value={task.status}
          onPick={(next) => {
            setField(null);
            updateStatus({ id: task._id, status: next }).catch(() =>
              toast.error("Couldn't change the status"),
            );
          }}
        />
      </FooterSheet>
      <PrioritySheet
        open={field === "priority"}
        onOpenChange={(open) => setField(open ? "priority" : null)}
        value={task.priority}
        onChange={(priority) =>
          update({ priority: priority ?? null }, "Couldn't change the priority")
        }
      />
      <ReviewerSheet
        open={field === "reviewer"}
        onOpenChange={(open) => setField(open ? "reviewer" : null)}
        users={users}
        value={task.assignedTo}
        onChange={(assignedTo) =>
          update({ assignedTo: assignedTo ?? null }, "Couldn't assign the task")
        }
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
        onChange={(projectId) =>
          update(
            { projectId: projectId ?? null },
            "Couldn't change the project",
          )
        }
      />
    </>
  );
}

const COMMENT_PLACEHOLDER: Record<CommentMode["kind"], string> = {
  new: "Add a comment...",
  reply: "Leave a reply...",
  edit: "Edit comment...",
};

/**
 * The web comment boxes in one: "Add a comment..." posts a top-level comment;
 * after Reply it answers that comment, and after Edit it holds your comment's
 * text and saves it. The chip above it names the comment; its X goes back to
 * a new comment.
 */
function CommentComposer({
  currentUserId,
  taskId,
  repoId,
  model,
  users,
  mode,
  onModeChange,
}: {
  currentUserId: Id<"users">;
  taskId: Id<"agentTasks">;
  repoId: Id<"githubRepos">;
  model: AIModel | undefined;
  users: User[] | undefined;
  mode: CommentMode;
  onModeChange: (mode: CommentMode) => void;
}) {
  // A new comment and each reply keep their own draft on the server, as the
  // web boxes do; an edit has none. Each has its own typing room too.
  const draftTargetFor = (next: CommentMode): DraftTarget | null =>
    next.kind === "edit"
      ? null
      : {
          kind: "taskComment",
          taskId,
          parentCommentId: next.kind === "reply" ? next.comment._id : undefined,
        };
  const draft = useDraftSync(draftTargetFor(mode));
  const typing = useTypingPresence(
    mode.kind === "reply"
      ? taskReplyTypingRoom(mode.comment._id)
      : taskTypingRoom(taskId),
    currentUserId,
  );
  const composer = useMentionComposer(
    repoId,
    getAIModelProvider(normalizeAIModel(model)),
    (tokenized) => {
      draft.save(tokenized);
      if (tokenized) typing.onActivity();
    },
  );
  const comments = useCommentMutations(taskId);
  const [sending, setSending] = useState(false);
  // A new mode resets the box during render: an edit loads its comment; a new
  // comment or a reply loads its last known draft, and a draft from elsewhere
  // (the web) comes in on a later render (`pull`).
  const [shownMode, setShownMode] = useState(mode);
  const modeChanged = shownMode !== mode;
  if (modeChanged) {
    setShownMode(mode);
    const target = draftTargetFor(mode);
    composer.load(
      mode.kind === "edit"
        ? mode.comment.content
        : ((target && draft.lastKnown(target)) ?? ""),
    );
  } else {
    draft.pull(composer);
  }
  const send = async (text: string) => {
    const content = composer.tokenize(text).trim();
    if (!content) return;
    setSending(true);
    try {
      if (mode.kind === "edit") {
        if (content !== mode.comment.content)
          await comments.update({ id: mode.comment._id, content });
      } else {
        await comments.create({
          taskId,
          content,
          parentId: mode.kind === "reply" ? mode.comment._id : undefined,
        });
      }
      typing.stopTyping();
      // An edit by the person, so the sent draft is cleared on the server too.
      composer.setText("");
      onModeChange({ kind: "new" });
    } catch {
      toast.error(
        mode.kind === "edit"
          ? "Couldn't save the comment"
          : "Couldn't post the comment",
      );
    }
    setSending(false);
  };
  return (
    <View>
      <TypingIndicator users={typing.typingUsers} />
      <PromptInput
        value={composer.text}
        onChangeText={composer.setText}
        status={sending ? "submitted" : "ready"}
        disabled={sending}
        replyTo={
          mode.kind === "new" ? undefined : (
            <CommentModeChip
              mode={mode}
              users={users}
              onDismiss={() => onModeChange({ kind: "new" })}
            />
          )
        }
        menu={
          composer.menu ? (
            <MentionMenu
              menu={composer.menu}
              onPick={composer.pick}
              onDismiss={composer.dismiss}
            />
          ) : null
        }
        header={
          composer.picks.length > 0 ? (
            <ComposerMentionChips
              picks={composer.picks}
              onRemove={composer.removePick}
            />
          ) : undefined
        }
        onSubmit={(text) => void send(text)}
        placeholder={COMMENT_PLACEHOLDER[mode.kind]}
        accessibilityLabel={COMMENT_PLACEHOLDER[mode.kind].replace("...", "")}
      />
    </View>
  );
}

/**
 * The bottom bar, as the project page: "Chat" (the task chat, with the unread
 * dot) and, when the web shows its Run button, "Run Eva" (outside a project;
 * a first run from To Do, or In Progress with no run going).
 */
function TaskDock({
  task,
  hasRuns,
  hasActiveRun,
  onSchedule,
}: {
  /** The web Run button's schedule half: pick a time for the run instead. */
  onSchedule: () => void;
  task: QuickTask;
  /** Undefined while the run facts load. */
  hasRuns: boolean | undefined;
  hasActiveRun: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = EVA_THEME[useScheme()];
  const startExecution = useMutation(api.agentTasks.startExecution);
  const [busy, setBusy] = useState(false);
  const canRun =
    task.projectId === undefined &&
    task.archivedAt === undefined &&
    hasRuns !== undefined &&
    ((task.status === "todo" && !hasRuns) ||
      (task.status === "in_progress" && !hasActiveRun));
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
    <View
      className="flex-row gap-2 px-4 pt-2"
      style={{ paddingBottom: insets.bottom + 12 }}
    >
      <View className="min-w-0 flex-1">
        <Button
          variant="secondary"
          accessibilityLabel={unread ? "Chat, unread reply" : "Chat"}
          leftIcon={<IconMessage size={16} color={theme.secondaryForeground} />}
          onPress={() =>
            router.push({
              pathname: "/chat/[target]",
              params: { target: task._id },
            })
          }
        >
          Chat
        </Button>
        {unread ? (
          <View
            pointerEvents="none"
            className="absolute right-3 top-3 size-1.5 rounded-full"
            style={{ backgroundColor: theme.primary }}
          />
        ) : null}
      </View>
      {canRun ? (
        <View className="min-w-0 flex-1">
          <Button
            loading={busy}
            disabled={busy}
            leftIcon={
              <IconPlayerPlay size={16} color={theme.primaryForeground} />
            }
            onPress={() => void run()}
          >
            Run Eva
          </Button>
        </View>
      ) : null}
      {canRun && task.status === "todo" ? (
        // The web split button's schedule half, as a 44 square beside Run Eva.
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Schedule run"
          onPress={onSchedule}
          className="h-11 w-11 items-center justify-center rounded-xl active:opacity-70"
          style={{ backgroundColor: theme.secondary }}
        >
          <IconCalendarClock size={18} color={theme.secondaryForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}
