import { api, findUsageLimitHold, getAIModelProvider, isHeldByUsageLimit, normalizeAIModel, type Id } from "@eva/backend";
import { groupChatFeedback } from "@eva/shared/chatFeedback";
import { findNewMessageIds, useChatReadState, useChatRecap } from "@eva/shared/chatReadState";
import { findDayBoundaryIds } from "@eva/shared/dayLabel";
import {
  EVA_SENDER_NAME,
  buildPrecedingUserTurns,
  chatStreamingEntityId,
  collectForkPrefix,
  findStreamingTargetMessage,
  firstNameByUserId,
  forkThreadTitle,
  getSessionReadOnlyMessage,
  formatForkPrompt,
  isOtherUserChatMessage,
  MAX_PARALLEL_CHATS,
  messageAttachments,
  type ResolvedMediaEntry,
  otherUserIdsInChat,
  appendReviewCommentsToPrompt,
  prNumberFromGithubUrl,
  SANDBOX_CHAT_COPY,
  sandboxComposerState,
  type SessionMenuAction,
  tokenizedToDisplayText,
  turnErrorTitle,
  visibleChatMessages,
  findBubbleGroups,
  EVA_MENTION_ITEM,
  archiveCopy,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { turnCheckpoint } from "@eva/shared/turnCheckpoint";
import { chatTypingRoom } from "@eva/shared/typingPresence";
import { isUsageLimitFailure } from "@eva/shared/usageLimitRecovery";
import { messageLinkHref } from "@eva/shared/messageLink";
import { appendCitationsToPrompt } from "@eva/shared/assistantCitation";
import { formatQuestionAnswers, type ParsedQuestion, parsePendingQuestion } from "@eva/shared/pendingQuestion";
import { collectThreadFindDocuments } from "@eva/shared/threadFind";
import { IconChevronDown, IconMessageCircle, IconPlayerStop, IconSearch, IconSparkles } from "@tabler/icons-react-native";
import {
  ChoiceQuestion,
  Conversation,
  ConversationEmptyState,
  ConversationDock,
  ConversationList,
  ConversationScrollButton,
  Message,
  MessageContent,
  type MessageMenu,
  PromptInput,
  PromptInputButton,
  Shimmer,
} from "@vvedantb/native-ui/ai";
import { providerLabel } from "@vvedantb/native-ui/brand";
import { goBackOrReplace, RouterStackPageHeader } from "@vvedantb/native-ui/expo-router";
import { CenteredSpinner, EmptyState, Spinner, Text } from "@vvedantb/native-ui/primitives";
import { withAlpha } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Clipboard from "expo-clipboard";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AttachButton } from "@/chat/AttachButton";
import { formatDuration } from "@eva/shared/duration";
import { AssistantMessage, LiveAssistantMessage } from "@/chat/AssistantMessage";
import { DayDivider, NewDivider } from "@/chat/DayDivider";
import { ThreadSummary } from "@/chat/ThreadSummary";
import { useAppActive } from "@/ui/appState";
import { UserMessageText } from "@/chat/MentionChip";
import { EvaBubble, TEAMMATE_FOOTER_INSET, TEAMMATE_SIDE, TeammateBubble, TeammateName } from "@/chat/TeammateTurn";
import { InlineCards, TurnOutputs, useChatCards, type InlineCard, type TurnOutput } from "@/chat/cards/ChatCards";
import { UserAttachments } from "@/chat/media/UserAttachments";
import { createSeenRows, SeenRowsContext } from "@/chat/cards/seenRows";
import { SandboxBranchChip } from "@/chat/BranchChips";
import { ComposerFooter, composerHeader, useSimpleView } from "@/chat/ComposerFooter";
import { ModelChip } from "@/chat/ModelChip";
import { ChatHeader, type MenuEntry } from "@/chat/ChatHeader";
import { ThreadFindBar } from "@/chat/ThreadFindBar";
import { SessionChatTabs } from "@/chat/SessionChatTabs";
import { SandboxControl, SandboxErrorBanner, useSessionSandbox } from "@/chat/SandboxControl";
import { UsageButton } from "@/chat/UsageSheet";
import { useProposedPlans } from "@/chat/ProposedPlanCard";
import { BackgroundAgentsChip } from "@/chat/BackgroundAgentsChip";
import { QueuedMessagesPanel } from "@/chat/QueuedMessagesPanel";
import { ComposerTasksPanel } from "@/chat/ComposerTasksPanel";
import { RecapCard } from "@/chat/RecapCard";
import { GoalBanner } from "@/chat/GoalBanner";
import { PublishRecoveryBanner } from "@/chat/PublishRecoveryBanner";
import { SystemAlertRow } from "@/chat/SystemAlertRow";
import { useNow } from "@/ui/clock";
import { useMessageMenu } from "@/chat/MessageHoldMenu";
import { TurnChangesChip, useTurnRestore, type TurnChangesTarget } from "@/chat/TurnChangesChip";
import { UsageLimitRecoveryCard } from "@/chat/UsageLimitRecovery";
import { MentionMenu } from "@/chat/MentionMenu";
import { MessageFooter, type Sentiment } from "@/chat/MessageFooter";
import { type Quotes, useQuotes } from "@/chat/Quotes";
import { ComposerSuggestions } from "@/chat/ComposerSuggestions";
import { PendingReviewCommentChips } from "@/chat/PendingReviewCommentChips";
import { BackgroundProcessesChip } from "@/chat/BackgroundProcessesChip";
import { useSkillSuggestions } from "@/chat/useSkillSuggestions";
import { toReviewComment, usePendingLineComments } from "@/diff/prDiffStore";
import { useAttachments } from "@/chat/useAttachments";
import { type Chat, useChatModelPick } from "@/chat/useChatModelPick";
import { EvaTypingText, TypingIndicator } from "@/chat/TypingIndicator";
import { ThreadTurnStatus } from "@/chat/ThreadTurnStatus";
import { useDraftSync } from "@/chat/useDraftSync";
import { useTypingPresence } from "@/chat/useTypingPresence";
import { useMentionComposer } from "@/chat/useMentionComposer";
import { WEB_URL } from "@/config";
import { useSessionActions } from "@/sessions/useSessionActions";
import { textColor, useScheme } from "@/ui/theme";
import { useChatTranscript } from "@/chat/useChatTranscript";

type PendingQuestion = NonNullable<FunctionReturnType<typeof api.pendingQuestions.getActive>>;

const HEADER_HIDDEN_ACTIONS: ReadonlySet<SessionMenuAction> = new Set(["copyLink"]);

/**
 * One chat (session, quick task or project): the transcript with the web
 * message actions (a teammate's turn on the left with their avatar and first
 * name, as the web), the agent's question when it asks one, and the composer
 * (attachments, Stop beside Send while the agent works, the web `@` / `/`
 * picker) with the web footer: the live sandbox branch, the stash and the
 * chat's sticky model. The transcript is an inverted `ConversationList`
 * (newest first), so a chat opens at its newest message with no scroll, and a
 * long chat draws only the messages near the view. Back returns to where the
 * chat was opened from, or to the Inbox after a deep link.
 */
export default function ChatScreen() {
  const { target } = useLocalSearchParams<{ target: string }>();
  const router = useRouter();
  const scheme = useScheme();
  const chat = useQuery(api.chats.get, { target });
  const parentId = chat?.parentId;
  const transcript = useChatTranscript(parentId);
  const messages: ChatMessage[] | undefined = transcript.messages;
  const convex = useConvex();
  const turn = useQuery(api.turns.getChatStatus, parentId ? { entityId: parentId } : "skip");
  const chatQuestion = useQuery(api.pendingQuestions.getActive, parentId ? { entityId: parentId } : "skip");
  const sessionRow = useQuery(api.sessions.get, chat?.session ? { id: chat.session.id } : "skip");
  const feedbackRows = useQuery(api.feedback.listForChat, parentId ? { parentId } : "skip");
  const focused = useIsFocused();
  const appActive = useAppActive();
  const { newSinceAt } = useChatReadState({ parentId, active: focused && appActive });
  const me = useQuery(api.auth.me, {});
  const { recap, dismiss: dismissRecap } = useChatRecap({
    parentId,
    active: focused && appActive,
    messages: messages ?? [],
    currentUserId: me ?? undefined,
  });
  const sandbox = useSessionSandbox(chat?.session?.id);
  const runningChats = useQuery(api.turns.listSessionChatStatuses, chat?.session ? { sessionId: chat.session.id } : "skip");
  const queued = useQuery(api.queuedMessages.listByParent, parentId ? { parentId } : "skip");
  const threadTurn = useQuery(
    api.messages.openThreadTurn,
    parentId && chat?.project !== undefined ? { parentId } : "skip",
  );
  const pending = threadTurn ? null : chatQuestion;
  const teammateIds = otherUserIdsInChat(messages ?? [], me ?? undefined);
  const teammates = useQuery(api.users.getMany, teammateIds.length > 0 ? { ids: teammateIds } : "skip");
  const stop = useMutation(api.chats.stop);
  const startSession = useMutation(api.chats.start);
  const rate = useMutation(api.feedback.rateTurn);
  const send = useMutation(api.chats.send);
  const simpleView = useSimpleView();
  const sessionActions = useSessionActions({ onArchived: () => goBackOrReplace(router, "/sessions"), sessionId: chat?.session?.id });

  const liveReplyId = findStreamingTargetMessage(messages ?? [])?._id;
  const visible = visibleChatMessages(messages ?? [], simpleView).filter((message) =>
    message.isSystemAlert === true
      ? message.content.trim() !== ""
      : message.content.trim() !== "" ||
        (message.role === "assistant" && (message.activityLog || (message.media?.length ?? 0) > 0 || message.stopped === true)) ||
        (message.role === "user" && messageAttachments(message).length > 0) ||
        message._id === liveReplyId,
  );
  const { mineByMessageId: mine, agentReports } = groupChatFeedback(feedbackRows ?? [], me ?? undefined);
  const { cards, outputs } = useChatCards(parentId, visible, agentReports, transcript.hasOlder);
  const planAfter = useProposedPlans(chat, sessionRow?.planContent);
  const [seenRows] = useState(createSeenRows);
  const restore = useTurnRestore();
  const messageMenu = useMessageMenu(restore.request);
  const quotes = useQuotes();
  const [find, setFind] = useState<{ target: string; activeId: string | null } | null>(null);
  const findOpen = find !== null && find.target === target;
  const findActiveId = findOpen ? find.activeId : null;
  const requestRecap = useMutation(api.chatRecaps.requestFull);

  if (chat === undefined || chat === null) {
    return (
      <View className="flex-1">
        <RouterStackPageHeader title="Chat" />
        {chat === undefined ? (
          <CenteredSpinner label="Loading chat" />
        ) : (
          <EmptyState icon={IconMessageCircle} title="Chat not found" description="It was deleted, or you no longer have access." />
        )}
      </View>
    );
  }

  const working = turn !== undefined && turn !== null;
  const { canReply } = chat;
  const runningCount = runningChats?.length ?? 0;
  const waitingForSlot = !working && (queued?.length ?? 0) > 0 && runningCount >= MAX_PARALLEL_CHATS;
  const sandboxAwake = chat.session ? sandbox.isActive : chat.sandboxActive;
  const emptyTitle = sandboxAwake
    ? "No messages yet. Start the conversation!"
    : sandbox.isStopping
      ? SANDBOX_CHAT_COPY.stoppingTitle
      : sandbox.isToggling
        ? SANDBOX_CHAT_COPY.startingTitle
        : SANDBOX_CHAT_COPY.asleepTitle;
  const emptyDescription = sandboxAwake || sandbox.isToggling ? "" : SANDBOX_CHAT_COPY.asleepDescription;
  const closedReason = chat.archived
    ? archiveCopy(chat.archived).readOnly
    : chat.session
      ? getSessionReadOnlyMessage({ isArchived: chat.session.archived, prState: sessionRow?.prState })
      : undefined;
  const streamingEntityId = parentId && !threadTurn ? chatStreamingEntityId(parentId) : undefined;
  const dayStarts = findDayBoundaryIds(visible);
  const newBoundaryId = findNewMessageIds(visible, newSinceAt, me ?? undefined)[0];
  const bubbleGroups = findBubbleGroups(visible, {
    currentUserId: me ?? undefined,
    assistantBubbles: chat.project !== undefined,
    breaksBefore: newBoundaryId === undefined ? dayStarts : new Set([...dayStarts, newBoundaryId]),
  });
  const newestFirst = [...visible].reverse();
  const precedingUserTurns = buildPrecedingUserTurns(messages ?? []);
  const questions = pending ? parsePendingQuestion(pending.payload) : null;
  const savedRaw = visible[visible.length - 1]?.pendingQuestion;
  const savedQuestions = parsePendingQuestion(savedRaw);
  const savedQuestion = savedRaw && savedQuestions ? { raw: savedRaw, questions: savedQuestions } : null;
  const teammateNames = firstNameByUserId(teammates ?? []);
  const teammateById = new Map((teammates ?? []).map((user) => [user._id, user]));
  const newestMessage = messages?.[messages.length - 1];
  const webUrl = (path: string) => `${WEB_URL}${path}`;
  const sessionTarget = chat.session
    ? {
        sessionId: chat.session.id,
        title: chat.session.title,
        archived: chat.session.archived,
        webPath: chat.webPath,
        branchName: chat.intendedBranch,
        prUrl: chat.prUrl,
        prState: sessionRow?.prState,
        repoId: chat.repoId,
        hasUnpushedWork:
          sessionRow?.status === "active" &&
          ((sessionRow.sandboxGitSync?.uncommittedFiles ?? 0) > 0 || (sessionRow.sandboxGitSync?.unpushedCommits ?? 0) > 0),
      }
    : null;

  const handleStop = () => {
    stop({ target: chat.target }).catch(() => toast.error("Couldn't stop Eva"));
  };

  const forkPrefix = (messageId: string) =>
    transcript.hasOlder && parentId
      ? convex.query(api.messages.forkPrefixByParent, { parentId, throughMessageId: messageId })
      : Promise.resolve(
          collectForkPrefix(
            visible.map((message) => ({ id: message._id, role: message.role, content: message.content, isSystemAlert: message.isSystemAlert })),
            messageId,
          ),
        );
  const handleFork = async (messageId: string) => {
    try {
      const prefix = await forkPrefix(messageId);
      if (!prefix) return;
      const { sessionId } = await startSession({ repoId: chat.repoId, prompt: formatForkPrompt(prefix), title: forkThreadTitle(prefix) });
      router.push({ pathname: "/chat/[target]", params: { target: sessionId } });
    } catch {
      toast.error("Couldn't fork the chat");
    }
  };
  const forkFrom = chat.kind === "session" ? (messageId: string) => void handleFork(messageId) : undefined;
  const rateReply = (messageId: ChatMessage["_id"], sentiment: Sentiment | null) => {
    rate({ messageId, sentiment }).catch(() => toast.error("Couldn't save your rating"));
  };

  const session = chat.session;
  const turnFor = (message: ChatMessage): TurnChangesTarget | undefined => {
    const checkpoint = session && !simpleView ? turnCheckpoint(message) : null;
    return checkpoint && session
      ? { checkpoint, messageId: message._id, sessionId: session.id, repoId: chat.repoId, target, sandboxRunning: chat.sandboxActive }
      : undefined;
  };
  const changesFor = (message: ChatMessage) => {
    const turn = turnFor(message);
    return turn ? <TurnChangesChip turn={turn} /> : null;
  };
  const openWebChat = () => void Linking.openURL(webUrl(chat.webPath));
  const retryFor = (messageId: string) => {
    const prompt = precedingUserTurns.get(messageId);
    if (!canReply || !prompt) return undefined;
    return () => {
      send({ target: chat.target, message: prompt.content, attachmentStorageIds: prompt.attachmentStorageIds }).catch(() =>
        toast.error("Couldn't send your message"),
      );
    };
  };
  const canOpenThread = (message: { isSystemAlert?: boolean; content: string }) =>
    chat.project !== undefined && message.isSystemAlert !== true && message.content.trim() !== "";
  const openThread = (rootId: string) =>
    router.push({ pathname: "/chat/[target]/thread/[rootId]", params: { target, rootId } });
  const menuFor = (messageId: string) => {
    const message = visible.find((entry) => entry._id === messageId);
    if (!message) return { actions: [] };
    return messageMenu({
      text: message.content,
      link: webUrl(messageLinkHref(chat.webPath, message._id)),
      rating:
        message.role === "assistant"
          ? { sentiment: mine.get(message._id)?.sentiment, onRate: (next) => rateReply(message._id, next) }
          : undefined,
      onFork: forkFrom ? () => forkFrom(message._id) : undefined,
      onRetry: message.errorType !== undefined ? retryFor(message._id) : undefined,
      turn: turnFor(message),
      onSelectText:
        message.role === "assistant" && canReply && !pending && !savedQuestion && message.content.trim() !== ""
          ? () => quotes.select(message._id, message.content)
          : undefined,
      onReply: canOpenThread(message) ? () => openThread(message._id) : undefined,
    });
  };
  const findDocuments = collectThreadFindDocuments(
    visible.map((message) => ({ id: message._id, text: tokenizedToDisplayText(message.content), skip: message.isSystemAlert === true })),
  );
  const leadingMenu: MenuEntry[] = [{ label: "Find in chat", icon: IconSearch, onSelect: () => setFind({ target, activeId: null }) }];
  if (parentId && visible.length > 0) {
    leadingMenu.push({
      label: "Recap chat",
      icon: IconSparkles,
      onSelect: () => {
        requestRecap({ parentId }).catch(() => toast.error("Couldn't recap this chat"));
      },
    });
  }
  const panelReply =
    canReply && chat.sandboxActive
      ? (message: string) => {
          send({ target: chat.target, message }).catch(() => toast.error("Couldn't send your message"));
        }
      : undefined;

  return (
    <View className="flex-1">
      <ChatHeader
        repoId={chat.repoId}
        repoLabel={chat.repoLabel}
        title={chat.title}
        onBack={() => goBackOrReplace(router)}
        onOpenWeb={openWebChat}
        onCopyLink={() => void Clipboard.setStringAsync(webUrl(chat.webPath))}
        onStop={working ? handleStop : undefined}
        leadingItems={leadingMenu}
        usage={<UsageButton chat={chat} />}
        sandbox={<SandboxControl sandbox={sandbox} working={working} />}
        sessionMenu={
          sessionTarget
            ? {
                groups: sessionActions
                  .actionsFor(sessionTarget)
                  .map((group) => group.filter((action) => !HEADER_HIDDEN_ACTIONS.has(action))),
                onSelect: (action) => sessionActions.run(action, sessionTarget),
                itemFor: sessionActions.itemFor,
              }
            : undefined
        }
      />
      <SandboxErrorBanner sandbox={sandbox} />
      {chat.session ? <SessionChatTabs sessionId={chat.session.id} activeChatId={chat.session.chatId} archived={chat.session.archived} /> : null}
      {sessionActions.dialogs}
      <Conversation>
        {findOpen ? (
          <ThreadFindBar
            documents={findDocuments}
            rowIndex={(messageId) => newestFirst.findIndex((message) => message._id === messageId)}
            onActiveChange={(activeId) => setFind({ target, activeId })}
            onClose={() => setFind(null)}
          />
        ) : null}
        <SeenRowsContext.Provider value={seenRows}>
        <ConversationList
          inverted
          onViewableItemsChanged={seenRows.onViewableItemsChanged}
          data={newestFirst}
          keyExtractor={(message) => message._id}
          contentContainerClassName="px-0"
          ItemSeparatorComponent={MessageGap}
          onEndReached={transcript.loadOlder}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            transcript.isLoadingOlder ? (
              <View className="items-center py-3">
                <Spinner size="sm" accessibilityLabel="Loading older messages" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            messages === undefined ? (
              <CenteredSpinner label="Loading messages" />
            ) : messages.length === 0 ? (
              <ConversationEmptyState icon={IconMessageCircle} title={emptyTitle} description={emptyDescription} />
            ) : null
          }
          ListHeaderComponent={
            <>
              {recap && visible.length > 0 ? (
                <View className={`pt-3 ${THREAD_INSET}`}>
                  <RecapCard kind={recap.kind} text={recap.text} onDismiss={dismissRecap} />
                </View>
              ) : null}
              {working && questions === null && liveReplyId === undefined ? (
                <View className={`pt-3 ${THREAD_INSET}`}>
                  <Shimmer>Working…</Shimmer>
                </View>
              ) : null}
              {waitingForSlot ? (
                <View className={`pt-3 ${THREAD_INSET}`}>
                  <Shimmer>{`Waiting for a free slot — ${runningCount} of ${MAX_PARALLEL_CHATS} chats in this session are running.`}</Shimmer>
                </View>
              ) : null}
              {cards.trailing.length > 0 ? (
                <View className={`pt-3 ${THREAD_INSET}`}>
                  <InlineCards cards={cards.trailing} rowKey="trailing" onReply={panelReply} onOpenWebChat={openWebChat} />
                </View>
              ) : null}
              {outputs.trailing.length > 0 ? (
                <View className={`pt-2 ${THREAD_INSET}`}>
                  <TurnOutputs outputs={outputs.trailing} />
                </View>
              ) : null}
            </>
          }
          renderItem={({ item: message }) => {
            const fromTeammate = isOtherUserChatMessage(message, me ?? undefined);
            return (
              <ChatMessageRow
                message={message}
                dayStart={dayStarts.has(message._id)}
                newStart={message._id === newBoundaryId}
                findActive={message._id === findActiveId}
                fromTeammate={fromTeammate}
                evaBubble={chat.project !== undefined}
                joinsPrevious={bubbleGroups.joinsPrevious.has(message._id)}
                joinsNext={bubbleGroups.joinsNext.has(message._id)}
                senderName={
                  bubbleGroups.joinsPrevious.has(message._id)
                    ? undefined
                    : chat.project !== undefined && message.role === "assistant"
                      ? EVA_SENDER_NAME
                      : fromTeammate && message.userId
                        ? teammateNames.get(message.userId)
                        : undefined
                }
                teammate={fromTeammate && message.userId ? teammateById.get(message.userId) : undefined}
                live={message._id === liveReplyId ? streamingEntityId : undefined}
                turn={message.role === "assistant" ? precedingUserTurns.get(message._id) : undefined}
                menuFor={menuFor}
                cards={cards.byMessageId.get(message._id)}
                outputs={outputs.byMessageId.get(message._id)}
                after={planAfter(message._id)}
                changes={changesFor(message)}
                onPanelReply={panelReply}
                onRetryTurn={message.errorType !== undefined ? retryFor(message._id) : undefined}
                onOpenWebChat={openWebChat}
                onOpenThread={chat.project !== undefined ? openThread : undefined}
              />
            );
          }}
        />
      </SeenRowsContext.Provider>
        {restore.dialog}
        {quotes.sheet}
        <ConversationDock style={{ backgroundColor: EVA_THEME[scheme].background }}>
          {me ? (
          <ChatDock
            target={target}
            chat={chat}
            me={me}
            working={working}
            simpleView={simpleView}
            pending={pending}
            questions={questions}
            savedQuestion={savedQuestion}
            messagesNewestFirst={newestFirst}
            canReply={canReply}
            closedReason={closedReason}
            onStop={handleStop}
            banners={
              <>
                <GoalBanner chatId={chat.session?.chatId ?? chat.task?.sessionChatId ?? chat.project?.sessionChatId} target={chat.target} />
                {chat.session && canReply ? (
                  <PublishRecoveryBanner sessionId={chat.session.id} newest={newestMessage} isSandboxActive={chat.sandboxActive} />
                ) : null}
              </>
            }
            panels={
              <>
                {threadTurn ? (
                  <ThreadTurnStatus
                    preview={threadTurn.preview}
                    hasQuestion={threadTurn.hasQuestion}
                    onOpen={() => openThread(threadTurn.rootId)}
                  />
                ) : null}
                <ComposerTasksPanel streamingEntityId={streamingEntityId} turnId={liveReplyId} />
                <QueuedMessagesPanel parentId={parentId} isExecuting={working} isSandboxActive={chat.sandboxActive} />
              </>
            }
            usageLimitFailure={isUsageLimitFailure(newestMessage) ? newestMessage.content : undefined}
            quotes={quotes}
          />
          ) : null}
        </ConversationDock>
        <ConversationScrollButton label="Scroll to end" icon={IconChevronDown} showLabel insets={{ right: 10 }} />
      </Conversation>
    </View>
  );
}

function ChatDock({
  target,
  chat,
  me,
  working,
  simpleView,
  pending,
  questions,
  savedQuestion,
  messagesNewestFirst,
  canReply,
  closedReason,
  onStop,
  banners,
  panels,
  usageLimitFailure,
  quotes,
}: {
  target: string;
  chat: Chat;
  me: Id<"users">;
  working: boolean;
  simpleView: boolean;
  pending: PendingQuestion | null | undefined;
  questions: ParsedQuestion[] | null;
  savedQuestion: { raw: string; questions: ParsedQuestion[] } | null;
  messagesNewestFirst: ChatMessage[];
  canReply: boolean;
  closedReason: string | undefined;
  onStop: () => void;
  banners: ReactNode;
  panels: ReactNode;
  usageLimitFailure: string | undefined;
  quotes: Pick<Quotes, "items" | "remove" | "drop">;
}) {
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const send = useMutation(api.chats.send);
  const answer = useMutation(api.pendingQuestions.answer);
  const [answeredSaved, setAnsweredSaved] = useState<string | null>(null);
  const attachments = useAttachments();
  const draft = useDraftSync(
    chat.session ? { kind: "sessionChat", sessionId: chat.session.id, chatId: chat.session.chatId } : null,
  );
  const typing = useTypingPresence(chatTypingRoom(chat.parentId ?? target), me);
  const composer = useMentionComposer(
    chat.repoId,
    getAIModelProvider(normalizeAIModel(chat.model)),
    (tokenized) => {
      draft.save(tokenized);
      if (tokenized) typing.onActivity();
    },
    chat.project !== undefined ? [EVA_MENTION_ITEM] : [],
  );
  draft.pull(composer);
  const suggestions = useSkillSuggestions(composer.skills, composer.text);
  const modelPick = useChatModelPick(target, chat, me);
  const router = useRouter();
  const prNumber = chat.prUrl === undefined ? undefined : prNumberFromGithubUrl(chat.prUrl);
  const review = usePendingLineComments(chat.repoId === undefined || prNumber === undefined ? null : { repoId: chat.repoId, prNumber });

  const now = useNow(60_000);
  const usageLimitHeld = isHeldByUsageLimit(
    findUsageLimitHold(messagesNewestFirst, now),
    normalizeAIModel(chat.model),
    chat.providerAccountId ?? null,
  );
  const composerState = sandboxComposerState({
    isSandboxActive: chat.sandboxActive,
    isSwitchingAccount: modelPick.switching,
    isExecuting: working,
    isUsageLimitHeld: usageLimitHeld,
  });
  const placeholder = working
    ? "Add a follow-up..."
    : composerState.placeholder === SANDBOX_CHAT_COPY.activePlaceholder
      ? "Ask Eva anything..."
      : composerState.placeholder;

  const handleSend = (text: string) => {
    if (attachments.uploading) {
      toast.error("Wait for the attachments to upload");
      return;
    }
    if (modelPick.switching) {
      toast.error("Wait for the account switch");
      return;
    }
    const attachmentStorageIds = attachments.storageIds;
    const sentComments = review.comments;
    attachments.clear();
    typing.stopTyping();
    const sentQuotes = quotes.items;
    send({
      target: chat.target,
      message: appendReviewCommentsToPrompt(appendCitationsToPrompt(composer.tokenize(text), sentQuotes), sentComments.map(toReviewComment)),
      attachmentStorageIds,
    }).then(
      () => {
        quotes.drop(sentQuotes);
        for (const comment of sentComments) review.remove(comment.id);
      },
      () => toast.error("Couldn't send your message"),
    );
  };

  const questionDock = (key: string, asked: ParsedQuestion[], onSubmit: (answers: Record<string, string>) => Promise<void>) => (
    <View className="p-3 pr-[22px]" style={{ paddingBottom: insets.bottom + 12 }}>
      <ChoiceQuestion key={key} questions={asked} buttonWeight="semibold" onSubmit={onSubmit} />
    </View>
  );
  const saved = !pending && savedQuestion && savedQuestion.raw !== answeredSaved && canReply ? savedQuestion : null;

  return pending && questions ? (
    questionDock(pending.toolUseId, questions, async (answers) => {
      if (!chat.parentId) return;
      try {
        await answer({ entityId: chat.parentId, toolUseId: pending.toolUseId, answer: JSON.stringify(answers) });
      } catch {
        toast.error("Couldn't submit answer");
      }
    })
  ) : saved ? (
    questionDock(saved.raw, saved.questions, async (answers) => {
      setAnsweredSaved(saved.raw);
      try {
        await send({ target: chat.target, message: formatQuestionAnswers(saved.questions, answers), attachmentStorageIds: [] });
      } catch {
        setAnsweredSaved(null);
        toast.error("Couldn't send your answer");
      }
    })
  ) : canReply ? (
    <View className="pr-2.5">
      {banners}
      {usageLimitFailure !== undefined && modelPick.pick?.account && modelPick.switchAccount ? (
        <UsageLimitRecoveryCard
          chat={chat}
          failure={usageLimitFailure}
          accounts={modelPick.pick.account.accounts}
          switchAccount={modelPick.switchAccount}
          working={working}
        />
      ) : null}
      {panels}
      <View className="pl-3">
        <TypingIndicator users={typing.typingUsers} />
      </View>
      <ComposerSuggestions
        onPaste={() => void attachments.paste()}
        skills={suggestions.chips}
        onPickSkill={(item) => {
          composer.insertSkill(item);
          suggestions.dismiss(item.id);
        }}
      />
      <PromptInput
        layout="inline"
        shape="pill"
        value={composer.text}
        onChangeText={(next) => {
          composer.setText(next);
          suggestions.noteDraft(next);
        }}
        onSubmit={handleSend}
        menu={composer.menu ? <MentionMenu menu={composer.menu} onPick={composer.pick} onDismiss={composer.dismiss} /> : null}
        placeholder={placeholder}
        onPasteImages={attachments.pasteFiles}
        leading={
          <AttachButton attachments={attachments} />
        }
        header={composerHeader(
          attachments,
          composer,
          quotes,
          review.comments.length > 0 ? (
            <PendingReviewCommentChips
              comments={review.comments}
              onOpen={(file) => router.push({ pathname: "/chat/[target]/diff", params: { target, file } })}
              onRemove={review.remove}
            />
          ) : null,
        )}
        toolbar={working ? <PromptInputButton variant="destructive" icon={IconPlayerStop} label="Stop generating" onPress={onStop} /> : null}
        footer={
          <ComposerFooter
            repoId={chat.repoId}
            composer={composer}
            attachments={attachments}
            leading={
              chat.sandboxBranch && !simpleView ? (
                <SandboxBranchChip branch={chat.sandboxBranch} intendedBranch={chat.intendedBranch} />
              ) : undefined
            }
            status={
              <>
                <BackgroundAgentsChip
                  chatId={chat.session?.chatId ?? chat.task?.sessionChatId ?? chat.project?.sessionChatId}
                  readOnly={!canReply}
                />
                <BackgroundProcessesChip sessionId={chat.session?.id} />
              </>
            }
            model={modelPick.pick ? <ModelChip repoId={chat.repoId} {...modelPick.pick} /> : undefined}
          />
        }
      />
    </View>
  ) : (
    <View>
      <Text variant="muted" className="px-4 pb-8 pt-3 text-center" style={textColor(scheme, "muted")}>
        {closedReason ?? "This chat is closed."}
      </Text>
    </View>
  );
}

type ChatMessage = FunctionReturnType<typeof api.messages.listByParent>[number] & {
  media?: ResolvedMediaEntry[];
  attachments?: ResolvedMediaEntry[];
  attachmentUrls?: Array<string | null>;
};

function ChatMessageRow({
  message,
  dayStart,
  newStart,
  findActive,
  fromTeammate,
  evaBubble,
  joinsPrevious,
  joinsNext,
  senderName,
  teammate,
  live,
  turn,
  menuFor,
  cards,
  outputs,
  onPanelReply,
  onRetryTurn,
  onOpenWebChat,
  onOpenThread,
  after,
  changes,
}: {
  message: ChatMessage;
  dayStart: boolean;
  newStart: boolean;
  findActive: boolean;
  fromTeammate: boolean;
  evaBubble: boolean;
  joinsPrevious: boolean;
  joinsNext: boolean;
  senderName: string | undefined;
  teammate: ComponentProps<typeof TeammateBubble>["sender"];
  live: string | undefined;
  onRetryTurn?: () => void;
  turn: ComponentProps<typeof MessageFooter>["turn"];
  menuFor: (messageId: string) => MessageMenu;
  cards: readonly InlineCard[] | undefined;
  outputs: readonly TurnOutput[] | undefined;
  onPanelReply: ((message: string) => void) | undefined;
  onOpenWebChat: () => void;
  onOpenThread?: (rootId: string) => void;
  after?: ReactNode;
  changes?: ReactNode;
}) {
  const scheme = useScheme();
  const findBand = findActive ? { backgroundColor: withAlpha(EVA_THEME[scheme].primary, 0.1) } : undefined;
  if (message.isSystemAlert === true) {
    return (
      <View className={`gap-3 ${THREAD_INSET}`}>
        {dayStart ? <DayDivider timestamp={message.timestamp} /> : null}
        {newStart ? <NewDivider /> : null}
        <SystemAlertRow content={message.content} errorDetail={message.errorDetail} alertTone={message.alertTone} timestamp={message.timestamp} />
      </View>
    );
  }
  const isUser = message.role === "user";
  const failure = isUser
    ? null
    : turnErrorTitle({ errorType: message.errorType, turnModel: turn?.model, messageModel: message.model, providerLabel });
  const attachments = isUser ? messageAttachments(message) : [];
  const cardList =
    cards && cards.length > 0 ? (
      <InlineCards cards={cards} rowKey={message._id} onReply={onPanelReply} onOpenWebChat={onOpenWebChat} />
    ) : null;
  const tabbed = !isUser && cardList !== null && live === undefined && message.content.trim() !== "";
  const outputList = outputs && outputs.length > 0 ? <TurnOutputs outputs={outputs} /> : null;
  const userBody = (
    <>
      <UserAttachments attachments={attachments} />
      {message.content ? <UserMessageText content={message.content} /> : null}
    </>
  );
  const replyBody = isUser ? null : live && evaBubble ? (
    <EvaTypingText />
  ) : live ? (
    <LiveAssistantMessage streamingEntityId={live} messageId={message._id} />
  ) : (
    <AssistantMessage
      messageId={message._id}
      content={message.content}
      activityLog={message.activityLog}
      duration={message.finishedAt ? formatDuration(message.timestamp, message.finishedAt) : undefined}
      hideTrace={evaBubble}
      media={message.media}
      tabPanels={tabbed ? cardList : undefined}
      failure={failure ? { title: failure, onRetry: onRetryTurn } : undefined}
      stopped={message.stopped === true}
    />
  );
  const evaReply = evaBubble && !isUser;
  const threadControl =
    onOpenThread && (message.replyCount ?? 0) > 0 ? (
      <ThreadSummary replyCount={message.replyCount ?? 0} onPress={() => onOpenThread(message._id)} />
    ) : null;
  return (
              <View className={`gap-3 ${THREAD_INSET}${joinsPrevious ? " -mt-2" : ""}`} style={findBand}>
                {dayStart ? <DayDivider timestamp={message.timestamp} /> : null}
                {newStart ? <NewDivider /> : null}
                <Message
                  from={message.role}
                  className={message.role === "user" ? (evaBubble ? "max-w-[70%] gap-0.5" : "gap-0.5") : "max-w-full gap-0.5"}
                  style={fromTeammate || evaReply ? TEAMMATE_SIDE : undefined}
                  menu={() => menuFor(message._id)}
                >
                  {senderName ? <TeammateName name={senderName} /> : null}
                  {fromTeammate ? (
                    <TeammateBubble sender={teammate} joinsNext={joinsNext}>
                      {userBody}
                    </TeammateBubble>
                  ) : evaReply ? (
                    <EvaBubble joinsNext={joinsNext}>{replyBody}</EvaBubble>
                  ) : (
                    <MessageContent bubble="tint" className={isUser ? undefined : "px-1 py-2"}>
                      {isUser ? userBody : replyBody}
                    </MessageContent>
                  )}
                  {isUser && cardList ? <View className="mt-1 w-full">{cardList}</View> : null}
                  {outputList}
                  {!isUser && cardList && !tabbed ? <View className="mt-2">{cardList}</View> : null}
                  {changes ? <View className="mt-1 px-1">{changes}</View> : null}
                  {message.content.trim() !== "" && !joinsNext ? (
                    <MessageFooter
                      className={fromTeammate || evaReply ? TEAMMATE_FOOTER_INSET : undefined}
                      at={message.timestamp}
                      finishedAt={message.role === "assistant" ? message.finishedAt : undefined}
                      turn={turn}
                      leading={threadControl}
                    />
                  ) : threadControl ? (
                    <View className={fromTeammate || evaReply ? TEAMMATE_FOOTER_INSET : "self-end"}>{threadControl}</View>
                  ) : null}
                </Message>
                {after}
              </View>
  );
}

const THREAD_INSET = "pl-[22px] pr-8";

function MessageGap() {
  return <View className="h-3" />;
}
