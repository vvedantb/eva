import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  motionBase,
  type ModelOption,
  type ModelAccount,
} from "@eva/ui";
import {
  ChatEmptyState,
  ChatTranscriptSkeleton,
} from "@/lib/components/chat/_components/ChatTranscriptStates";
import { AnimatePresence, m } from "motion/react";
import { ChatLastTurn } from "@/lib/components/chat/ChatLastTurn";
import { ChatJumpRail } from "@/lib/components/chat/ChatJumpRail";
import { ChatComposer } from "@/lib/components/chat/ChatComposer";
import { ChatMessage } from "@/lib/components/chat/ChatMessage";
import { AssistantCiteToolbar } from "@/lib/components/chat/AssistantCiteToolbar";
import { PendingCitationChips } from "@/lib/components/chat/PendingCitationChips";
import { PendingSnapshotChips } from "@/lib/components/chat/PendingSnapshotChips";
import { PendingWebMcpChips } from "@/lib/components/chat/PendingWebMcpChips";
import { ThreadFindBar } from "@/lib/components/chat/ThreadFindBar";
import { collectThreadFindDocuments } from "@/lib/components/chat/threadFind";
import { MessageForkDialog } from "@/lib/components/chat/MessageForkDialog";
import {
  canForkMessage,
  collectForkPrefix,
  forkThreadTitle,
  formatForkPrompt,
} from "@/lib/components/chat/messageFork";
import { tokenizedToDisplayText } from "@/lib/components/mentions";
import { appendCitationsToPrompt } from "@/lib/components/chat/assistantCitation";
import { appendSnapshotsToPrompt } from "@/lib/components/sandbox/previewSnapshot";
import { appendWebMcpToPrompt } from "@/lib/components/sandbox/previewWebMcp";
import {
  PendingCitationsProvider,
  usePendingCitations,
} from "@/lib/contexts/PendingCitationsContext";
import { usePendingPreviewSnapshots } from "@/lib/contexts/PendingPreviewSnapshotsContext";
import { usePendingWebMcp } from "@/lib/contexts/PendingWebMcpContext";
import type { TurnCheckpointContext } from "@/lib/components/chat/_components/useTurnCheckpointActions";
import { ChatQuestionDock } from "@/lib/components/chat/ChatQuestionDock";
import { useChangedFilesExpansion } from "@/lib/components/chat/useChangedFilesExpansion";
import { useAgentReplyChime } from "@/lib/components/chat/useAgentReplyChime";
import { ChatUiPanel } from "@/lib/components/chat/generativeUi/ChatUiPanel";
import { placeChatUiPanels } from "@/lib/components/chat/generativeUi/chatUiPanelPlacement";
import { useState, type ReactNode } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  api,
  type AIModel,
  type BackgroundAgentEntry,
  type Id,
  type StoredModelTraits,
  type resolveTraitsForDisplay,
} from "@eva/backend";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import type { ChatDraftSeed } from "@/lib/components/chat/useChatDraftSeed";
import {
  buildJumpRailTicks,
  buildMessageHistory,
  findHandoffBoundaryIds,
  findLastUserMessageIndex,
  findLastAssistantMessageId,
  findStreamingTargetMessage,
  findPrecedingUserTurn,
  firstNameFromUser,
  isOtherUserChatMessage,
  otherUserIdsInChat,
  parsePendingQuestion,
  SANDBOX_CHAT_COPY,
  visibleChatMessages,
  type ChatBodyMessage,
  type ChatBodyQueuedMessage,
} from "@/lib/components/chat/chatBodyUtils";

export type { ChatBodyMessage };

interface ChatBodyProps {
  repoId: Id<"githubRepos">;
  /** Repo route prefix, e.g. `/owner/repo` or `/owner/repo--app`. */
  repoBasePath: string;
  /** Conversation id (session / agent task / project) — scopes the typing-presence room. */
  conversationId: string;
  /**
   * The same chat, typed as the id its messages hang off. Used to load the
   * agent-composed UI panels (`render_ui`) that belong to this transcript.
   */
  chatParentId: Id<"sessions"> | Id<"projects"> | Id<"agentTasks">;
  messages: ChatBodyMessage[];
  /**
   * True while the transcript query is still in flight. Panels collapse Convex's
   * `undefined` into `[]`, so without this the empty state flashes before the
   * turns arrive.
   */
  isLoadingMessages?: boolean;
  queuedMessages: ChatBodyQueuedMessage[];
  streamingActivity?: string;
  streamingContent?: string;
  streamingPendingQuestion?: string;
  /**
   * A blocking AskUserQuestion awaiting the user (Agent SDK `canUseTool`). When
   * set, its interactive card replaces the fire-and-forget `streamingPendingQuestion`
   * path and the turn stays executing until {@link onAnswerBlockingQuestion} runs.
   */
  blockingQuestion?: { toolUseId: string; payload: string };
  /** Submits a structured answer for {@link blockingQuestion}, resuming the turn. */
  onAnswerBlockingQuestion?: (
    toolUseId: string,
    answers: Record<string, string>,
  ) => Promise<void>;
  isExecuting: boolean;
  isInputDisabled: boolean;
  isArchived?: boolean;
  placeholder: string;
  emptyStateTitle: string;
  /**
   * Second line of the empty state. Always passed explicitly by the panels —
   * the library's default ("Start a conversation to see messages here")
   * contradicts a chat whose sandbox is asleep.
   */
  emptyStateDescription?: string;
  /**
   * Why the composer will not send, shown when the user presses Enter on a
   * disabled composer instead of swallowing the keystroke.
   */
  disabledReason?: string;
  /**
   * Wakes the sandbox. Set only when it is stopped and not already toggling;
   * gives the empty state its button and the blocked-send toast its action.
   */
  onStartSandbox?: () => void;
  model: AIModel;
  setModel: (model: AIModel) => void;
  modelOptions: ReadonlyArray<ModelOption<AIModel>>;
  /**
   * The user's own provider accounts. When non-empty, the model picker nests
   * Team + account submenus under each provider; the chosen account's
   * credentials run the turn (see `accountId`/`onAccountChange`).
   */
  accounts?: ReadonlyArray<ModelAccount>;
  accountId?: string | null;
  onAccountChange?: (accountId: string | null) => void;
  /**
   * Model trait controls (reasoning effort, thinking toggle, Fast, 1M context). When
   * provided, trait pills appear above the model list for capable models.
   */
  displayTraits?: ReturnType<typeof resolveTraitsForDisplay>;
  onTraitsChange?: (partial: Partial<StoredModelTraits>) => void;
  /**
   * Called with the tokenized content and any uploaded image attachment storage
   * ids. Caller decides whether to send or enqueue.
   */
  onSend: (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
  ) => Promise<void>;
  onCancel: () => Promise<void>;
  /** Optional slot inserted above the conversation (session summary accordion). */
  preConversationContent?: React.ReactNode;
  /** Optional slot inserted above the queued messages panel (session startup streaming). */
  beforeQueuedContent?: React.ReactNode;
  /** Optional slot inserted between the queued messages panel and the input (session PRD plan view). */
  preInputContent?: React.ReactNode;
  /** Replaces the default empty-state component when there are zero messages. */
  emptyStateOverride?: React.ReactNode;
  /** Leading control on the composer's under-input bar (e.g. the sandbox branch chip). */
  underCardLeading?: React.ReactNode;
  /**
   * Draft seed to restore. When provided, the PromptInputProvider is seeded
   * with the stored draft text and mention maps, and a ChatDraftSync child
   * saves keystrokes back to Convex.
   *
   * IMPORTANT: only pass this once the draft query has resolved — the provider
   * reads initialInput only at mount, so it must not mount before the data is
   * available. Use `isDraftLoading` to render a placeholder while waiting.
   */
  draft?: ChatDraftSeed;
  /**
   * When true, renders a disabled placeholder in place of the real input while
   * the draft query is in flight. This prevents the PromptInputProvider from
   * mounting with an empty initial value before the persisted draft is known.
   */
  isDraftLoading?: boolean;
  /**
   * When provided, file chips in assistant activity blocks become clickable and
   * call this with the file's full path (sessions wire this to the File Viewer
   * tab). Pass a stable callback — the activity renderer is memoised.
   */
  onOpenFile?: (path: string) => void;
  /** Opens the Diffs tab; optional repo-relative path scrolls to that file. */
  onViewDiff?: (repoRelativePath?: string) => void;
  /** True when ephemeral diff review comments are queued for the next send. */
  hasPendingContext?: boolean;
  /**
   * Opens the Agents sandbox tab. Only sessions have one, so leaving this unset
   * hides the sub-agent CTA row under assistant turns.
   */
  onOpenAgentsTab?: () => void;
  /** Entity-wide sub-agent lifecycle entries, for the CTA row's live status. */
  backgroundAgents?: ReadonlyArray<BackgroundAgentEntry>;
  /** False lets stranded "running" sub-agents read as stale, not live. */
  sandboxRunning?: boolean;
  /** Sessions only: turn diff / restore actions on assistant messages. */
  turnCheckpoint?: TurnCheckpointContext;
  allowEmptySubmit?: boolean;
  afterMessage?: (messageId: string) => ReactNode;
  /** Sessions: create a new chat from the transcript through this message. */
  onForkTranscript?: (input: {
    throughMessageId: string;
    title: string;
    prompt: string;
  }) => Promise<void>;
}

export function ChatBody(props: ChatBodyProps) {
  return (
    <PendingCitationsProvider>
      <ChatBodyInner {...props} />
    </PendingCitationsProvider>
  );
}

function ChatBodyInner({
  repoId,
  repoBasePath,
  conversationId,
  chatParentId,
  messages,
  isLoadingMessages = false,
  queuedMessages,
  streamingActivity,
  streamingContent,
  streamingPendingQuestion,
  blockingQuestion,
  onAnswerBlockingQuestion,
  isExecuting,
  isInputDisabled,
  isArchived,
  placeholder,
  emptyStateTitle,
  emptyStateDescription = "",
  disabledReason = SANDBOX_CHAT_COPY.asleepDisabledReason,
  onStartSandbox,
  model,
  setModel,
  modelOptions,
  accounts,
  accountId,
  onAccountChange,
  displayTraits,
  onTraitsChange,
  onSend,
  onCancel,
  preConversationContent,
  beforeQueuedContent,
  preInputContent,
  emptyStateOverride,
  underCardLeading,
  draft,
  isDraftLoading,
  onOpenFile,
  onViewDiff,
  hasPendingContext,
  onOpenAgentsTab,
  backgroundAgents,
  sandboxRunning,
  turnCheckpoint,
  allowEmptySubmit,
  afterMessage,
  onForkTranscript,
}: ChatBodyProps) {
  const citations = usePendingCitations();
  const snapshots = usePendingPreviewSnapshots();
  const webmcp = usePendingWebMcp();
  const sendWithPendingContext = async (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
  ) => {
    const withCitations = appendCitationsToPrompt(
      content,
      citations?.items ?? [],
    );
    const withSnapshots = appendSnapshotsToPrompt(
      withCitations,
      (snapshots?.items ?? []).map((item) => item.snapshot),
    );
    const withWebMcp = appendWebMcpToPrompt(
      withSnapshots,
      (webmcp?.items ?? []).map((item) => item.discovery),
    );
    await onSend(withWebMcp, attachmentStorageIds);
    citations?.clear();
    snapshots?.clear();
    webmcp?.clear();
  };
  const hasComposerContext =
    (hasPendingContext ?? false) ||
    (citations?.items.length ?? 0) > 0 ||
    (snapshots?.items.length ?? 0) > 0 ||
    (webmcp?.items.length ?? 0) > 0;
  // Sandbox start/stop/reconnect banners are always omitted. Simple view also
  // hides remaining system alerts, diffs, and — since it has no Agents tab —
  // the sub-agent CTA row. Quick task / project / session all render through
  // ChatBody, so this is the one gate.
  const simpleView = useSimpleView();
  const displayMessages = visibleChatMessages(messages, simpleView);

  const lastMessage = displayMessages[displayMessages.length - 1];
  // The oldest unfinished Working bubble owns the session-scoped streaming
  // row — turns run FIFO, so a newer queued placeholder must not steal a
  // still-streaming older turn's tokens (see findStreamingTargetMessage).
  const streamingTarget = findStreamingTargetMessage(displayMessages);
  const streamingTargetId = streamingTarget?._id;
  const latestAssistantMessageId = findLastAssistantMessageId(displayMessages);
  const { expandedByMessageId, setMessageExpanded } =
    useChangedFilesExpansion(conversationId);

  const [dismissedQuestionKey, setDismissedQuestionKey] = useState<
    string | null
  >(null);
  // Submit-in-flight only — not turn execution. Blocking AskUserQuestion leaves
  // the turn executing while waiting for the user; mirroring that would lock the UI.
  const [isAnsweringQuestion, setIsAnsweringQuestion] = useState(false);
  const [forkThroughId, setForkThroughId] = useState<string | null>(null);
  const pendingQuestionRaw =
    streamingPendingQuestion ??
    streamingTarget?.pendingQuestion ??
    lastMessage?.pendingQuestion;
  const questionDismissed =
    pendingQuestionRaw !== undefined &&
    pendingQuestionRaw !== null &&
    pendingQuestionRaw !== "" &&
    dismissedQuestionKey === pendingQuestionRaw;
  const activePendingQuestion = questionDismissed
    ? null
    : parsePendingQuestion(pendingQuestionRaw);
  // A blocking AskUserQuestion (Agent SDK) takes precedence over the
  // fire-and-forget path: it keeps the turn paused until the user answers.
  const blockingQuestions = blockingQuestion
    ? parsePendingQuestion(blockingQuestion.payload)
    : null;
  // Both question kinds render in the composer's slot, so the card stays put
  // instead of scrolling with the conversation. Blocking wins: it holds the
  // turn open and its answer resumes the run.
  const dockedQuestions = blockingQuestions ?? activePendingQuestion;

  const handleQuestionAnswer = async (answer: string) => {
    if (pendingQuestionRaw) {
      setDismissedQuestionKey(pendingQuestionRaw);
    }
    setIsAnsweringQuestion(true);
    // Reset is duplicated into the catch instead of using `finally`: React
    // Compiler bails on the whole file when it meets a `finally` clause.
    try {
      await onSend(answer);
    } catch (error) {
      setIsAnsweringQuestion(false);
      throw error;
    }
    setIsAnsweringQuestion(false);
  };

  const handleBlockingAnswer = async (answers: Record<string, string>) => {
    if (!blockingQuestion || !onAnswerBlockingQuestion) return;
    setIsAnsweringQuestion(true);
    try {
      await onAnswerBlockingQuestion(blockingQuestion.toolUseId, answers);
    } catch (error) {
      setIsAnsweringQuestion(false);
      throw error;
    }
    setIsAnsweringQuestion(false);
  };

  const messageHistory = buildMessageHistory(displayMessages);

  const lastUserMessageIndex = findLastUserMessageIndex(displayMessages);

  const jumpRailMessages = buildJumpRailTicks(displayMessages);
  const handoffBoundaryIds = findHandoffBoundaryIds(displayMessages);
  const findDocuments = collectThreadFindDocuments(
    displayMessages.map((message) => ({
      id: message._id,
      text: tokenizedToDisplayText(
        message.content.trim().length > 0
          ? message.content
          : message._id === streamingTargetId
            ? (streamingContent ?? "")
            : "",
      ),
      skip: message.isSystemAlert === true,
    })),
  );

  const currentUserId = useQuery(api.auth.me);

  // The turn that just finished belongs to whoever sent the last user message.
  // Unattributed rows (legacy / optimistic) count as own, matching how the
  // transcript itself attributes them.
  const lastUserMessage = displayMessages[lastUserMessageIndex];
  useAgentReplyChime({
    conversationId,
    isExecuting,
    isOwnTurn:
      lastUserMessage === undefined ||
      !isOtherUserChatMessage(lastUserMessage, currentUserId),
  });

  // Agent-composed UI panels (`render_ui`). One query per chat covers all three
  // surfaces, since every one of them renders through this component.
  const chatUiPanels = useQuery(api.chatUi.listByParent, {
    parentId: chatParentId,
  });
  const panelPlacement = placeChatUiPanels(
    chatUiPanels ?? [],
    new Set(displayMessages.map((message) => message._id)),
  );

  const otherUserIds = otherUserIdsInChat(displayMessages, currentUserId);
  const users = useQuery(
    api.users.getMany,
    otherUserIds.length > 0 ? { ids: otherUserIds } : "skip",
  );
  const firstNameByUserId = (() => {
    const map = new Map<Id<"users">, string>();
    for (const user of users ?? []) {
      const name = firstNameFromUser(user);
      if (name) map.set(user._id, name);
    }
    return map;
  })();

  // Retry re-sends the failed turn's prompt through the normal send path. It is
  // withheld while a turn is running (the send would only queue behind it) and
  // on a read-only chat, which has no composer at all.
  const handleRetryTurn =
    isArchived || isExecuting
      ? undefined
      : (content: string, attachmentStorageIds?: Id<"_storage">[]) => {
          void onSend(content, attachmentStorageIds);
        };

  // A panel button sends its text through the normal send path, so it queues
  // behind a running turn exactly as a typed message would. Withheld on a
  // read-only chat and on one whose sandbox is asleep, which is what renders
  // the panel's buttons disabled instead of inert.
  const handlePanelReply =
    isArchived || isInputDisabled
      ? undefined
      : (message: string) => {
          void onSend(message);
        };

  // Undefined rather than an empty array: the caller slots this into a wrapper
  // that must not render (and take margin) when the turn has no panels.
  const renderChatUiPanels = (panels: typeof panelPlacement.trailing) =>
    panels.length === 0
      ? undefined
      : panels.map((panel) => (
          <ChatUiPanel
            key={panel._id}
            spec={panel.spec}
            onReply={handlePanelReply}
          />
        ));

  const renderMessage = (message: ChatBodyMessage) => {
    const isStreamingTarget = message._id === streamingTargetId;
    const isOtherUser = isOtherUserChatMessage(message, currentUserId);
    const senderFirstName =
      isOtherUser && message.userId
        ? firstNameByUserId.get(message.userId)
        : undefined;
    const precedingUser =
      message.role === "assistant"
        ? findPrecedingUserTurn(displayMessages, message._id)
        : undefined;

    return (
      <div key={message._id} className="flex flex-col gap-3">
        <ChatMessage
          message={message}
          repoBasePath={repoBasePath}
          isLatestAssistantTurn={message._id === latestAssistantMessageId}
          showChangedFiles={!simpleView}
          {...(expandedByMessageId[message._id] !== undefined
            ? { changedFilesExpanded: expandedByMessageId[message._id] }
            : {})}
          onChangedFilesExpandedChange={setMessageExpanded}
          isOtherUser={isOtherUser}
          senderFirstName={senderFirstName}
          isHandoffBoundary={handoffBoundaryIds.has(message._id)}
          turnModel={precedingUser?.model}
          turnReasoningLevel={precedingUser?.reasoningLevel}
          turnCredentialSourceLabel={precedingUser?.credentialSourceLabel}
          streamingActivity={isStreamingTarget ? streamingActivity : undefined}
          streamingContent={isStreamingTarget ? streamingContent : undefined}
          onOpenFile={onOpenFile}
          onViewDiff={onViewDiff}
          onOpenAgentsTab={simpleView ? undefined : onOpenAgentsTab}
          backgroundAgents={backgroundAgents}
          sandboxRunning={sandboxRunning}
          turnCheckpoint={simpleView ? undefined : turnCheckpoint}
          onRetryTurn={handleRetryTurn}
          precedingUser={precedingUser}
          citeHighlight={citations?.highlightedMessageId === message._id}
          onFork={
            onForkTranscript && canForkMessage(message)
              ? () => setForkThroughId(message._id)
              : undefined
          }
          belowContent={renderChatUiPanels(
            panelPlacement.byMessageId.get(message._id) ?? [],
          )}
        />
        {afterMessage?.(message._id)}
      </div>
    );
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      data-chat-pane=""
    >
      {preConversationContent}
      <ThreadFindBar documents={findDocuments} />
      <Conversation className="flex-1 min-h-0">
        <ConversationContent
          className="gap-3 p-3 max-w-3xl mx-auto w-full"
          scrollClassName="[container-type:size]"
        >
          {displayMessages.length === 0 ? (
            (emptyStateOverride ??
            (isLoadingMessages ? (
              <ChatTranscriptSkeleton />
            ) : (
              <ChatEmptyState
                title={emptyStateTitle}
                description={emptyStateDescription}
                {...(isInputDisabled && onStartSandbox
                  ? {
                      action: {
                        label: SANDBOX_CHAT_COPY.wakeAction,
                        onClick: onStartSandbox,
                      },
                    }
                  : {})}
              />
            )))
          ) : lastUserMessageIndex < 0 ? (
            displayMessages.map(renderMessage)
          ) : (
            <>
              {displayMessages
                .slice(0, lastUserMessageIndex)
                .map(renderMessage)}
              <ChatLastTurn>
                {displayMessages.slice(lastUserMessageIndex).map(renderMessage)}
              </ChatLastTurn>
            </>
          )}
          {renderChatUiPanels(panelPlacement.trailing)}
        </ConversationContent>
        <ConversationScrollButton resetKey={conversationId} />
        <ChatJumpRail messages={jumpRailMessages} />
        {isArchived ? null : <AssistantCiteToolbar />}
      </Conversation>
      {isArchived ? null : (
        <AnimatePresence mode="wait" initial={false}>
          {dockedQuestions ? (
            <m.div
              key="question-dock"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={motionBase}
            >
              <ChatQuestionDock
                questions={dockedQuestions}
                onAnswer={handleQuestionAnswer}
                {...(blockingQuestions
                  ? { onAnswerStructured: handleBlockingAnswer }
                  : {})}
                isLoading={isAnsweringQuestion}
              />
            </m.div>
          ) : (
            <m.div
              key="composer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={motionBase}
            >
              <ChatComposer
                repoId={repoId}
                repoBasePath={repoBasePath}
                conversationId={conversationId}
                queuedMessages={queuedMessages}
                messageHistory={messageHistory}
                isExecuting={isExecuting}
                isInputDisabled={isInputDisabled}
                disabledReason={disabledReason}
                onStartSandbox={onStartSandbox}
                placeholder={placeholder}
                model={model}
                setModel={setModel}
                modelOptions={modelOptions}
                accounts={accounts}
                accountId={accountId}
                onAccountChange={onAccountChange}
                displayTraits={displayTraits}
                onTraitsChange={onTraitsChange}
                onSend={sendWithPendingContext}
                onCancel={onCancel}
                beforeQueuedContent={beforeQueuedContent}
                preInputContent={
                  <>
                    <PendingCitationChips />
                    <PendingSnapshotChips />
                    <PendingWebMcpChips />
                    {preInputContent}
                  </>
                }
                streamingActivity={streamingActivity}
                streamingTurnId={streamingTargetId}
                underCardLeading={underCardLeading}
                draft={draft}
                isDraftLoading={isDraftLoading}
                hasPendingContext={hasComposerContext}
                allowEmptySubmit={allowEmptySubmit}
              />
            </m.div>
          )}
        </AnimatePresence>
      )}
      <MessageForkDialog
        prefix={
          forkThroughId
            ? collectForkPrefix(
                displayMessages.map((message) => ({
                  id: message._id,
                  role: message.role,
                  content: message.content,
                  isSystemAlert: message.isSystemAlert,
                })),
                forkThroughId,
              )
            : null
        }
        open={forkThroughId !== null}
        onOpenChange={(open) => {
          if (!open) setForkThroughId(null);
        }}
        onConfirm={
          onForkTranscript
            ? async (prefix) => {
                await onForkTranscript({
                  throughMessageId: prefix.throughMessageId,
                  title: forkThreadTitle(prefix),
                  prompt: formatForkPrompt(prefix),
                });
              }
            : undefined
        }
      />
    </div>
  );
}
