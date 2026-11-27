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
  // Read while it is on screen (this screen focused, the app in front), as the web marks its open chat;
  // `newSinceAt` places the "NEW" divider above the first reply you had not seen.
  const focused = useIsFocused();
  const appActive = useAppActive();
  const { newSinceAt } = useChatReadState({ parentId, active: focused && appActive });
  const me = useQuery(api.auth.me, {});
  // "Since you've been gone", as the web: written when you return after a long absence, under the newest message.
  const { recap, dismiss: dismissRecap } = useChatRecap({
    parentId,
    active: focused && appActive,
    messages: messages ?? [],
    currentUserId: me ?? undefined,
  });
  // A session chat's sandbox: the header wakes or sleeps it, and a failed wake shows under the header.
  const sandbox = useSessionSandbox(chat?.session?.id);
  // The session's running chats and this chat's queue: a send parked while every run slot is taken.
  const runningChats = useQuery(api.turns.listSessionChatStatuses, chat?.session ? { sessionId: chat.session.id } : "skip");
  const queued = useQuery(api.queuedMessages.listByParent, parentId ? { parentId } : "skip");
  // Eva's open turn answers in a reply thread: no running state here, a status line opens the thread.
  const threadTurn = useQuery(
    api.messages.openThreadTurn,
    parentId && chat?.project !== undefined ? { parentId } : "skip",
  );
  // A thread turn's question is answered in its thread screen, not here.
  const pending = threadTurn ? null : chatQuestion;
  // A teammate's turn shows their avatar and first name, from the same lookup as the web `ChatBody`.
  const teammateIds = otherUserIdsInChat(messages ?? [], me ?? undefined);
  const teammates = useQuery(api.users.getMany, teammateIds.length > 0 ? { ids: teammateIds } : "skip");
  const stop = useMutation(api.chats.stop);
  const startSession = useMutation(api.chats.start);
  const rate = useMutation(api.feedback.rateTurn);
  const send = useMutation(api.chats.send);
  const simpleView = useSimpleView();
  // The web leaves a session's page once it is archived; the phone goes back (to Sessions after a deep link).
  const sessionActions = useSessionActions({ onArchived: () => goBackOrReplace(router, "/sessions"), sessionId: chat?.session?.id });

  // The oldest unfinished reply owns the chat's streaming row, as the web (turns run in order).
  const liveReplyId = findStreamingTargetMessage(messages ?? [])?._id;
  // A user message with only attachments still shows, as the web; so does a reply with only captures.
  // System rows draw as the web: never the sandbox start and stop rows, none at all in simple view.
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
  // The agent's proposed plans, each under the message that proposed it (session chats only, as the web).
  const planAfter = useProposedPlans(chat, sessionRow?.planContent);
  // Rows seen on screen, so an agent page mounts its WebView only once its row shows.
  const [seenRows] = useState(createSeenRows);
  // The restore confirm a held reply's Restore opens, and the hold menus (the kit `Message` `menu`).
  const restore = useTurnRestore();
  const messageMenu = useMessageMenu(restore.request);
  // Quotes from replies ("Select text", then "Quote"), waiting for the next send.
  const quotes = useQuotes();
  // "Find in chat" (the web `ThreadFindBar`): the bar under the header while open, and the message of its active match.
  // Kept per chat: a tab switch to another chat of the session (the same screen) closes it.
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
  // Queued here while the session's run slots are all taken: the server parked the send (the web `isWaitingForSlot`).
  const runningCount = runningChats?.length ?? 0;
  const waitingForSlot = !working && (queued?.length ?? 0) > 0 && runningCount >= MAX_PARALLEL_CHATS;
  // The web empty state follows the sandbox: awake, waking, going to sleep, or asleep (a send wakes it).
  const sandboxAwake = chat.session ? sandbox.isActive : chat.sandboxActive;
  const emptyTitle = sandboxAwake
    ? "No messages yet. Start the conversation!"
    : sandbox.isStopping
      ? SANDBOX_CHAT_COPY.stoppingTitle
      : sandbox.isToggling
        ? SANDBOX_CHAT_COPY.startingTitle
        : SANDBOX_CHAT_COPY.asleepTitle;
  // Waking or sleeping is the whole story; awake, the web line teaches desktop drop, so the phone keeps the title.
  const emptyDescription = sandboxAwake || sandbox.isToggling ? "" : SANDBOX_CHAT_COPY.asleepDescription;
  // Why a closed chat takes no message: its task or project is archived, or its session's PR merged or closed, or it was archived (the web banner).
  const closedReason = chat.archived
    ? archiveCopy(chat.archived).readOnly
    : chat.session
      ? getSessionReadOnlyMessage({ isArchived: chat.session.archived, prState: sessionRow?.prState })
      : undefined;
  const streamingEntityId = parentId && !threadTurn ? chatStreamingEntityId(parentId) : undefined;
  const dayStarts = findDayBoundaryIds(visible);
  const newBoundaryId = findNewMessageIds(visible, newSinceAt, me ?? undefined)[0];
  // Runs of one sender's bubbles, as the web: the coordinator's Eva bubbles, yours and a teammate's.
  const bubbleGroups = findBubbleGroups(visible, {
    currentUserId: me ?? undefined,
    assistantBubbles: chat.project !== undefined,
    breaksBefore: newBoundaryId === undefined ? dayStarts : new Set([...dayStarts, newBoundaryId]),
  });
  // The inverted transcript draws its first row at the bottom. A copy, as `toReversed` is missing in some Hermes release builds.
  const newestFirst = [...visible].reverse();
  // The user turn before each reply holds the model it ran on (the footer mark), as the web.
  const precedingUserTurns = buildPrecedingUserTurns(messages ?? []);
  const questions = pending ? parsePendingQuestion(pending.payload) : null;
  // A question the agent saved on its last reply, as the web: it stays after the turn (and the sandbox)
  // stops, and its answer goes as a chat message, which wakes the sandbox.
  const savedRaw = visible[visible.length - 1]?.pendingQuestion;
  const savedQuestions = parsePendingQuestion(savedRaw);
  const savedQuestion = savedRaw && savedQuestions ? { raw: savedRaw, questions: savedQuestions } : null;
  const teammateNames = firstNameByUserId(teammates ?? []);
  const teammateById = new Map((teammates ?? []).map((user) => [user._id, user]));
  // The web recovery card reads every message, so a later system alert also hides it.
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

  // The transcript a fork carries. With history above the loaded rows, the
  // server builds it, as the web does. (Outside the try below: the React
  // Compiler cannot compile a conditional inside a try.)
  const forkPrefix = (messageId: string) =>
    transcript.hasOlder && parentId
      ? convex.query(api.messages.forkPrefixByParent, { parentId, throughMessageId: messageId })
      : Promise.resolve(
          collectForkPrefix(
            visible.map((message) => ({ id: message._id, role: message.role, content: message.content, isSystemAlert: message.isSystemAlert })),
            messageId,
          ),
        );
  // Fork: a new session that starts from the transcript up to this message, as the web.
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
  // One function each for every row (see `ChatMessageRow`).
  const forkFrom = chat.kind === "session" ? (messageId: string) => void handleFork(messageId) : undefined;
  const rateReply = (messageId: ChatMessage["_id"], sentiment: Sentiment | null) => {
    rate({ messageId, sentiment }).catch(() => toast.error("Couldn't save your rating"));
  };

  // A session reply that changed code: its Changes chip (Diff this turn, Restore), as the web's
  // turn checkpoint actions, which simple view hides.
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
  // A panel button sends its text as a message, as the web: withheld on a closed
  // chat and on one whose sandbox is asleep, which disables the buttons.
  // Retry on a failed turn re-sends the prompt that turn answered, attachments included, as the web.
  const retryFor = (messageId: string) => {
    const prompt = precedingUserTurns.get(messageId);
    if (!canReply || !prompt) return undefined;
    return () => {
      send({ target: chat.target, message: prompt.content, attachmentStorageIds: prompt.attachmentStorageIds }).catch(() =>
        toast.error("Couldn't send your message"),
      );
    };
  };
  // Reply threads, in the project coordinator chat only (the web `replyThreads`).
  const canOpenThread = (message: { isSystemAlert?: boolean; content: string }) =>
    chat.project !== undefined && message.isSystemAlert !== true && message.content.trim() !== "";
  const openThread = (rootId: string) =>
    router.push({ pathname: "/chat/[target]/thread/[rootId]", params: { target, rootId } });
  // The message footer's actions, behind a press and hold (user choice): built when a message is held.
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
      // Eva's replies only, as the web cites them (`<cited_assistant>`); the composer must be there to take it,
      // so not while a question card stands in its place.
      onSelectText:
        message.role === "assistant" && canReply && !pending && !savedQuestion && message.content.trim() !== ""
          ? () => quotes.select(message._id, message.content)
          : undefined,
      onReply: canOpenThread(message) ? () => openThread(message._id) : undefined,
    });
  };
  // What Find searches, as the web: each message's text as it reads (mention tokens as names), no system rows.
  const findDocuments = collectThreadFindDocuments(
    visible.map((message) => ({ id: message._id, text: tokenizedToDisplayText(message.content), skip: message.isSystemAlert === true })),
  );
  const leadingMenu: MenuEntry[] = [{ label: "Find in chat", icon: IconSearch, onSelect: () => setFind({ target, activeId: null }) }];
  // The web "Recap chat": a recap of the whole chat, as the "Recap" card under the newest message.
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
          // The side padding is in each row: Android flips an inverted list on both axes, which would swap it here.
          contentContainerClassName="px-0"
          // Web: messages `gap-3`.
          ItemSeparatorComponent={MessageGap}
          // Inverted, the end is the top: the next page of older history as the reader nears it.
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
            // Inverted, the header is the bottom, under the newest message.
            <>
              {recap && visible.length > 0 ? (
                <View className={`pt-3 ${THREAD_INSET}`}>
                  <RecapCard kind={recap.kind} text={recap.text} onDismiss={dismissRecap} />
                </View>
              ) : null}
              {/* The live reply shows its own status; this covers a turn whose reply is not written yet. */}
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
              {/* Cards and outputs with no row at or before them sit after the last message, as the web. */}
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
          // Plain values and stable handlers, so a message that did not change keeps its output
          // when the list draws a new batch or the screen re-renders.
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
                  // One name over a run of one sender's bubbles: a teammate's first name, or "Eva" over her coordinator replies.
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
                // Only a failed turn gets one, so the rest keep their props (the web `onRetryTurn`).
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
        {/* The composer or the question card: the scroll button rides 16 above it, as the web's `bottom-4` over the dock. */}
        {/* Solid: the keyboard lifts the dock over the transcript, which must not show through it. */}
        <ConversationDock style={{ backgroundColor: EVA_THEME[scheme].background }}>
          {/* Once the person is known: the typing presence heartbeat needs their id. */}
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
                {/* Not gated by simple view, as the web: the user set this goal and can clear it. */}
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
        {/* Centred on the thread, which sits 10 left of the screen's centre, as the web panel. */}
        <ConversationScrollButton label="Scroll to end" icon={IconChevronDown} showLabel insets={{ right: 10 }} />
      </Conversation>
    </View>
  );
}

/**
 * The chat's dock: the agent's question card, the composer or "This chat is
 * closed". It owns the draft, the attachments and the model pick, so a
 * keystroke redraws the dock only, not the transcript above it. It stays
 * mounted while the chat is open, so a draft outlives a question card. The
 * banners and the tasks and queue panels sit on the composer, as the web; the
 * screen builds them, so a keystroke here does not redraw them either.
 */
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
  /** The last reply's saved question (`messages.pendingQuestion`), when no blocking one is open. */
  savedQuestion: { raw: string; questions: ParsedQuestion[] } | null;
  /** The transcript, newest first: a usage limit the newest turn hit holds sends until the reset. */
  messagesNewestFirst: ChatMessage[];
  /** The chat takes a message (`chat.canReply`). */
  canReply: boolean;
  /** Why the chat is closed (an archived task or project, `getSessionReadOnlyMessage`), in place of "This chat is closed." */
  closedReason: string | undefined;
  onStop: () => void;
  /** The `/goal` and publish recovery banners, above the usage-limit card, as the web `SandboxChatPreInput`. */
  banners: ReactNode;
  /** The live tasks, then the queued messages, flush on the composer only (not over a question card), as the web dock. */
  panels: ReactNode;
  /** The newest reply's text while it is a usage-limit failure: the retry card shows above the composer. */
  usageLimitFailure: string | undefined;
  /** Quotes from replies: chips over the field, sent after the prompt. */
  quotes: Pick<Quotes, "items" | "remove" | "drop">;
}) {
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const send = useMutation(api.chats.send);
  const answer = useMutation(api.pendingQuestions.answer);
  // The saved question just answered: its card hides before the answer's message arrives.
  const [answeredSaved, setAnsweredSaved] = useState<string | null>(null);
  const attachments = useAttachments();
  // The `/` list follows the chat's model provider, as the web composer.
  // The draft is kept on the server, as the web composer: it survives closing the app and follows you between devices.
  const draft = useDraftSync(
    chat.session ? { kind: "sessionChat", sessionId: chat.session.id, chatId: chat.session.chatId } : null,
  );
  // "Someone is typing", as the web chat composer: the room is the session chat (`parentId`), as the web's;
  // before a task or project chats it has none, so this chat's own target stands in.
  const typing = useTypingPresence(chatTypingRoom(chat.parentId ?? target), me);
  const composer = useMentionComposer(
    chat.repoId,
    getAIModelProvider(normalizeAIModel(chat.model)),
    (tokenized) => {
      draft.save(tokenized);
      if (tokenized) typing.onActivity();
    },
    // The coordinator chat: `@Eva` says a message is for her (`chatMessageRoute`).
    chat.project !== undefined ? [EVA_MENTION_ITEM] : [],
  );
  draft.pull(composer);
  const suggestions = useSkillSuggestions(composer.skills, composer.text);
  const modelPick = useChatModelPick(target, chat, me);
  const router = useRouter();
  // The diff comments drafted on this chat's pull request: chips on the composer, sent with the next prompt.
  const prNumber = chat.prUrl === undefined ? undefined : prNumberFromGithubUrl(chat.prUrl);
  const review = usePendingLineComments(chat.repoId === undefined || prNumber === undefined ? null : { repoId: chat.repoId, prNumber });

  // The web composer's placeholder: asleep, a send wakes Eva up; mid-turn, a follow-up; held by a usage
  // limit, sends queue until just after the reset (the server holds them on the same model and account).
  // The clock ticks once a minute, here only, so the hold lifts at the reset without redrawing the chat.
  const now = useNow(60_000);
  const usageLimitHeld = isHeldByUsageLimit(
    findUsageLimitHold(messagesNewestFirst, now),
    normalizeAIModel(chat.model),
    chat.providerAccountId ?? null,
  );
  // Awake, the web's "Ask Eva anything... / for skills · @ to mention" would wrap the one-row pill
  // (a native field cannot ellipsise its placeholder), so the phone keeps the first part.
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
    // The web composer is locked while the new account's daemon starts.
    if (modelPick.switching) {
      toast.error("Wait for the account switch");
      return;
    }
    const attachmentStorageIds = attachments.storageIds;
    // As the web: the comments go as `<review_comment>` blocks and leave the chips once the send lands.
    const sentComments = review.comments;
    attachments.clear();
    typing.stopTyping();
    // The quotes, then the review comments, go after the prompt, as the web
    // (`ChatBody`, then `useChatSend`); each leaves only once the send lands, so a retry keeps them.
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

  // The web dock: p-3 around the card, in place of the composer, and the thread's 10 more on the right.
  // Over the bottom inset, as the composer: the dock rises with the keyboard (its "Other..." field) less that inset.
  const questionDock = (key: string, asked: ParsedQuestion[], onSubmit: (answers: Record<string, string>) => Promise<void>) => (
    <View className="p-3 pr-[22px]" style={{ paddingBottom: insets.bottom + 12 }}>
      <ChoiceQuestion key={key} questions={asked} buttonWeight="semibold" onSubmit={onSubmit} />
    </View>
  );
  // A blocking question wins: it holds the turn open and its answer resumes the run.
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
      // Hidden at once, as the web, until the reply moves on.
      setAnsweredSaved(saved.raw);
      try {
        await send({ target: chat.target, message: formatQuestionAnswers(saved.questions, answers), attachmentStorageIds: [] });
      } catch {
        setAnsweredSaved(null);
        toast.error("Couldn't send your answer");
      }
    })
  ) : canReply ? (
    // Eva's web pill composer, the + on the muted fill, 10 more in on the right as the
    // thread. Send stays ready during a turn (a send queues behind it) and Stop sits beside
    // it, as `stopMode="alongside"`.
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
        // The web stop beside send: red (`variant="destructive"`), the outline stop icon.
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

/**
 * A transcript message as `messages.listByParent` returns it. The query's
 * validator adds the resolved captures and attachments, which its handler's
 * inferred type drops, so they are named here as the web `ChatBodyMessage` does.
 */
type ChatMessage = FunctionReturnType<typeof api.messages.listByParent>[number] & {
  media?: ResolvedMediaEntry[];
  attachments?: ResolvedMediaEntry[];
  attachmentUrls?: Array<string | null>;
};

/**
 * One transcript message: its day divider, bubble or reply, and footer. Its
 * own component with plain values and handlers that take the message id, so
 * the React Compiler keeps an unchanged message's output when the inverted
 * list draws a new batch or the screen re-renders.
 */
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
  /** The first reply you had not seen: the "NEW" divider goes above it. */
  newStart: boolean;
  /** The message of Find's active match: a tinted band marks it. */
  findActive: boolean;
  fromTeammate: boolean;
  /** The project coordinator chat: Eva's replies sit in a bubble with her mark (the web `assistantBubbles`). */
  evaBubble: boolean;
  /** This row continues the run of one sender's bubbles above it: it sits 4 under it, not 12. */
  joinsPrevious: boolean;
  /** The run goes on below: the avatar and the footer wait for its last bubble. */
  joinsNext: boolean;
  senderName: string | undefined;
  teammate: ComponentProps<typeof TeammateBubble>["sender"];
  /** The streaming row's entity id while this is the live reply. */
  live: string | undefined;
  /** Re-sends the prompt a failed turn answered; set only on a failed turn that can be retried. */
  onRetryTurn?: () => void;
  turn: ComponentProps<typeof MessageFooter>["turn"];
  /** A press and hold on the message opens its menu (thumbs, copy, link, fork, retry, the turn's changes). */
  menuFor: (messageId: string) => MessageMenu;
  /** The agent's cards placed under this message (`render_ui`, `render_html`). */
  cards: readonly InlineCard[] | undefined;
  /** The artifacts and reports placed under this message. */
  outputs: readonly TurnOutput[] | undefined;
  /** Sends a panel button's text; undefined disables the buttons. */
  onPanelReply: ((message: string) => void) | undefined;
  onOpenWebChat: () => void;
  /** The coordinator chat: opens a message's reply thread ("N replies"). */
  onOpenThread?: (rootId: string) => void;
  /** Under the whole message, as the web `afterMessage`: a proposed plan's card. */
  after?: ReactNode;
  /** A reply that changed code: its Changes chip, over the footer. */
  changes?: ReactNode;
}) {
  const scheme = useScheme();
  // Find's active match: the message on a primary tint, as the web paints its active match.
  const findBand = findActive ? { backgroundColor: withAlpha(EVA_THEME[scheme].primary, 0.1) } : undefined;
  // A system row (a handoff, a refusal): the web divider, with its detail behind a link.
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
  // A failed turn's title ("This turn failed", "Claude usage limit reached"), or null for a reply.
  const failure = isUser
    ? null
    : turnErrorTitle({ errorType: message.errorType, turnModel: turn?.model, messageModel: message.model, providerLabel });
  const attachments = isUser ? messageAttachments(message) : [];
  const cardList =
    cards && cards.length > 0 ? (
      <InlineCards cards={cards} rowKey={message._id} onReply={onPanelReply} onOpenWebChat={onOpenWebChat} />
    ) : null;
  // The web `panelTabs`: a settled reply with prose trades places with its cards.
  const tabbed = !isUser && cardList !== null && live === undefined && message.content.trim() !== "";
  const outputList = outputs && outputs.length > 0 ? <TurnOutputs outputs={outputs} /> : null;
  // The user turn: attachments above the text, as the web.
  const userBody = (
    <>
      <UserAttachments attachments={attachments} />
      {message.content ? <UserMessageText content={message.content} /> : null}
    </>
  );
  // The coordinator chats like a person: "Eva is typing…" while it works, then the reply only.
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
  // The coordinator chat: Eva's reply in a bubble on the left, as a teammate's.
  const evaReply = evaBubble && !isUser;
  // "N replies" in the footer line, always shown (the web footer's thread control).
  const threadControl =
    onOpenThread && (message.replyCount ?? 0) > 0 ? (
      <ThreadSummary replyCount={message.replyCount ?? 0} onPress={() => onOpenThread(message._id)} />
    ) : null;
  return (
              <View className={`gap-3 ${THREAD_INSET}${joinsPrevious ? " -mt-2" : ""}`} style={findBand}>
                {dayStart ? <DayDivider timestamp={message.timestamp} /> : null}
                {newStart ? <NewDivider /> : null}
                {/* Web: parts `gap-0.5`; a reply is full width, a user message at most 95%. */}
                {/* A press and hold opens the message's menu (user choice, as iMessage): the kit `Message`
                    lifts it over the chat, with the thumbs above it and the actions below it. */}
                <Message
                  from={message.role}
                  // The coordinator chat caps every person's bubble at 70%, as the web (Eva's is capped in `EvaBubble`).
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
                    // Eva's web chat tints the user bubble (bg-primary/10), not the solid default. A reply is `px-1 py-2`.
                    // The web user text is markdown in `text-sm` (14 / 20), its tokens as chips.
                    <MessageContent bubble="tint" className={isUser ? undefined : "px-1 py-2"}>
                      {isUser ? userBody : replyBody}
                    </MessageContent>
                  )}
                  {/* The web user turn: its cards, then its outputs. A reply: outputs, then the cards the tabs did not take. */}
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
                    // A grouped bubble has no footer: the replies keep their own line.
                    <View className={fromTeammate || evaReply ? TEAMMATE_FOOTER_INSET : "self-end"}>{threadControl}</View>
                  ) : null}
                </Message>
                {after}
              </View>
  );
}

/** The web thread at 390: the panel (10 in on the left, 20 on the right) and the column's `p-3`. */
const THREAD_INSET = "pl-[22px] pr-8";

/** The web `gap-3` between two messages. */
function MessageGap() {
  return <View className="h-3" />;
}
