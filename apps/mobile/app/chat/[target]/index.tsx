import { api, getAIModelProvider, normalizeAIModel, type Id } from "@eva/backend";
import { groupChatFeedback } from "@eva/shared/chatFeedback";
import { findDayBoundaryIds } from "@eva/shared/dayLabel";
import {
  buildPrecedingUserTurns,
  chatStreamingEntityId,
  collectForkPrefix,
  findStreamingTargetMessage,
  firstNameByUserId,
  forkThreadTitle,
  formatForkPrompt,
  isOtherUserChatMessage,
  messageAttachments,
  type ResolvedMediaEntry,
  otherUserIdsInChat,
  SANDBOX_CHAT_COPY,
  sandboxComposerState,
  type SessionMenuAction,
  toRepoRelativePath,
} from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { messageLinkHref } from "@eva/shared/messageLink";
import { type ParsedQuestion, parsePendingQuestion } from "@eva/shared/pendingQuestion";
import { IconChevronDown, IconMessageCircle, IconPlayerStopFilled } from "@tabler/icons-react-native";
import {
  ChoiceQuestion,
  Conversation,
  ConversationEmptyState,
  ConversationDock,
  ConversationList,
  ConversationScrollButton,
  Message,
  MessageContent,
  PromptInput,
  PromptInputButton,
  Shimmer,
} from "@vvedantb/native-ui/ai";
import { goBackOrReplace, RouterStackPageHeader } from "@vvedantb/native-ui/expo-router";
import { CenteredSpinner, EmptyState, Spinner, Text } from "@vvedantb/native-ui/primitives";
import { tokens } from "@vvedantb/native-ui/theme";
import { toast } from "@vvedantb/native-ui/toast";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AttachButton } from "@/chat/AttachButton";
import { formatDuration } from "@eva/shared/duration";
import { AssistantMessage, LiveAssistantMessage } from "@/chat/AssistantMessage";
import { DayDivider } from "@/chat/DayDivider";
import { UserMessageText } from "@/chat/MentionChip";
import { TEAMMATE_FOOTER_INSET, TEAMMATE_SIDE, TeammateBubble, TeammateName } from "@/chat/TeammateTurn";
import { InlineCards, TurnOutputs, useChatCards, type InlineCard, type TurnOutput } from "@/chat/cards/ChatCards";
import { UserAttachments } from "@/chat/media/UserAttachments";
import { createSeenRows, SeenRowsContext } from "@/chat/cards/seenRows";
import { SandboxBranchChip } from "@/chat/BranchChips";
import { ComposerFooter, ComposerHeader, useSimpleView } from "@/chat/ComposerFooter";
import { ModelChip } from "@/chat/ModelChip";
import { ChatHeader } from "@/chat/ChatHeader";
import { QueuedMessagesPanel } from "@/chat/QueuedMessagesPanel";
import { MentionMenu } from "@/chat/MentionMenu";
import { MessageFooter, type Sentiment } from "@/chat/MessageFooter";
import { useAttachments } from "@/chat/useAttachments";
import { type Chat, useChatModelPick } from "@/chat/useChatModelPick";
import { useMentionComposer } from "@/chat/useMentionComposer";
import { WEB_URL } from "@/config";
import { useSessionActions } from "@/sessions/useSessionActions";
import { textColor, useScheme } from "@/ui/theme";
import { useChatTranscript } from "@/chat/useChatTranscript";

/** The agent's open question in the chat (`pendingQuestions.getActive`). */
type PendingQuestion = NonNullable<FunctionReturnType<typeof api.pendingQuestions.getActive>>;

/** The session actions the chat header ⋯ adds; it has Copy link of its own. */
// The header has its own Copy link (every chat kind), so the session's is left out.
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
  // The web's load plan: newest 30, live after that, older pages as the reader scrolls up.
  const transcript = useChatTranscript(parentId);
  const messages: ChatMessage[] | undefined = transcript.messages;
  const convex = useConvex();
  const turn = useQuery(api.turns.getChatStatus, parentId ? { entityId: parentId } : "skip");
  const pending = useQuery(api.pendingQuestions.getActive, parentId ? { entityId: parentId } : "skip");
  const feedbackRows = useQuery(api.feedback.listForChat, parentId ? { parentId } : "skip");
  const me = useQuery(api.auth.me, {});
  // A teammate's turn shows their avatar and first name, from the same lookup as the web `ChatBody`.
  const teammateIds = otherUserIdsInChat(messages ?? [], me ?? undefined);
  const teammates = useQuery(api.users.getMany, teammateIds.length > 0 ? { ids: teammateIds } : "skip");
  const stop = useMutation(api.chats.stop);
  const startSession = useMutation(api.chats.start);
  const rate = useMutation(api.feedback.rateTurn);
  const send = useMutation(api.chats.send);
  const simpleView = useSimpleView();
  // The web leaves a session's page once it is archived; the phone goes back (to Sessions after a deep link).
  const sessionActions = useSessionActions({ onArchived: () => goBackOrReplace(router, "/sessions") });

  // The oldest unfinished reply owns the chat's streaming row, as the web (turns run in order).
  const liveReplyId = findStreamingTargetMessage(messages ?? [])?._id;
  // A user message with only attachments still shows, as the web; so does a reply with only captures.
  const visible = (messages ?? []).filter(
    (message) =>
      message.isSystemAlert !== true &&
      (message.content.trim() !== "" ||
        (message.role === "assistant" && (message.activityLog || (message.media?.length ?? 0) > 0)) ||
        (message.role === "user" && messageAttachments(message).length > 0) ||
        message._id === liveReplyId),
  );
  const { mineByMessageId: mine, agentReports } = groupChatFeedback(feedbackRows ?? [], me ?? undefined);
  const { cards, outputs } = useChatCards(parentId, visible, agentReports);
  // Rows seen on screen, so an agent page mounts its WebView only once its row shows.
  const [seenRows] = useState(createSeenRows);

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
  const streamingEntityId = parentId ? chatStreamingEntityId(parentId) : undefined;
  const dayStarts = findDayBoundaryIds(visible);
  // The inverted transcript draws its first row at the bottom. A copy, as `toReversed` is missing in some Hermes release builds.
  const newestFirst = [...visible].reverse();
  // The user turn before each reply holds the model it ran on (the footer mark), as the web.
  const precedingUserTurns = buildPrecedingUserTurns(messages ?? []);
  const questions = pending ? parsePendingQuestion(pending.payload) : null;
  const teammateNames = firstNameByUserId(teammates ?? []);
  const teammateById = new Map((teammates ?? []).map((user) => [user._id, user]));
  const latestReplyId = visible.findLast((message) => message.role === "assistant")?._id;
  // A changed file opens the PR diff, as the web Review pane; simple view has no card, as the web.
  const openDiff = simpleView
    ? undefined
    : (path: string | undefined) =>
        router.push({ pathname: "/chat/[target]/diff", params: path ? { target, file: toRepoRelativePath(path) } : { target } });
  const webUrl = (path: string) => `${WEB_URL}${path}`;
  const sessionTarget = chat.session
    ? {
        sessionId: chat.session.id,
        title: chat.session.title,
        archived: chat.session.archived,
        webPath: chat.webPath,
        branchName: chat.intendedBranch,
        prUrl: chat.prUrl,
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

  const openWebChat = () => void Linking.openURL(webUrl(chat.webPath));
  // A panel button sends its text as a message, as the web: withheld on a closed
  // chat and on one whose sandbox is asleep, which disables the buttons.
  const panelReply =
    chat.canReply && chat.sandboxActive
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
        sessionMenu={
          sessionTarget
            ? {
                groups: sessionActions
                  .actionsFor(sessionTarget)
                  .map((group) => group.filter((action) => !HEADER_HIDDEN_ACTIONS.has(action))),
                onSelect: (action) => sessionActions.run(action, sessionTarget),
              }
            : undefined
        }
      />
      {sessionActions.dialogs}
      <Conversation>
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
              <ConversationEmptyState icon={IconMessageCircle} title="No messages yet" />
            ) : null
          }
          ListHeaderComponent={
            // Inverted, the header is the bottom, under the newest message.
            <>
              {/* The live reply shows its own status; this covers a turn whose reply is not written yet. */}
              {working && questions === null && liveReplyId === undefined ? (
                <View className={`pt-3 ${THREAD_INSET}`}>
                  <Shimmer>Working…</Shimmer>
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
                fromTeammate={fromTeammate}
                senderName={fromTeammate && message.userId ? teammateNames.get(message.userId) : undefined}
                teammate={fromTeammate && message.userId ? teammateById.get(message.userId) : undefined}
                live={message._id === liveReplyId ? streamingEntityId : undefined}
                isLatestReply={message._id === latestReplyId}
                link={webUrl(messageLinkHref(chat.webPath, message._id))}
                turn={message.role === "assistant" ? precedingUserTurns.get(message._id) : undefined}
                sentiment={mine.get(message._id)?.sentiment}
                onOpenDiff={openDiff}
                onFork={forkFrom}
                onRate={rateReply}
                cards={cards.byMessageId.get(message._id)}
                outputs={outputs.byMessageId.get(message._id)}
                onPanelReply={panelReply}
                onOpenWebChat={openWebChat}
              />
            );
          }}
        />
      </SeenRowsContext.Provider>
        {/* The composer or the question card: the scroll button rides 16 above it, as the web's `bottom-4` over the dock. */}
        {/* Solid: the keyboard lifts the dock over the transcript, which must not show through it. */}
        <ConversationDock style={{ backgroundColor: EVA_THEME[scheme].background }}>
          <ChatDock
            target={target}
            chat={chat}
            me={me}
            working={working}
            simpleView={simpleView}
            pending={pending}
            questions={questions}
            onStop={handleStop}
            queue={<QueuedMessagesPanel parentId={parentId} isExecuting={working} isSandboxActive={chat.sandboxActive} />}
          />
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
 * queue panel sits on the composer, as the web; the screen builds it, so a
 * keystroke here does not redraw it either.
 */
function ChatDock({
  target,
  chat,
  me,
  working,
  simpleView,
  pending,
  questions,
  onStop,
  queue,
}: {
  target: string;
  chat: Chat;
  me: Id<"users"> | undefined;
  working: boolean;
  simpleView: boolean;
  pending: PendingQuestion | null | undefined;
  questions: ParsedQuestion[] | null;
  onStop: () => void;
  /** The queued messages, above the composer only (not over a question card), as the web. */
  queue: ReactNode;
}) {
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const send = useMutation(api.chats.send);
  const answer = useMutation(api.pendingQuestions.answer);
  const attachments = useAttachments();
  // The `/` list follows the chat's model provider, as the web composer.
  const composer = useMentionComposer(chat.repoId, getAIModelProvider(normalizeAIModel(chat.model)));
  const modelPick = useChatModelPick(target, chat, me);

  // The web composer's placeholder: asleep, a send wakes Eva up; mid-turn, a follow-up.
  // The phone has no usage-limit hold yet (the web's needs a ticking clock), so that line never shows.
  // Awake, the web's "Ask Eva anything... / for skills · @ to mention" would wrap the one-row pill
  // (a native field cannot ellipsise its placeholder), so the phone keeps the first part.
  const composerState = sandboxComposerState({
    isSandboxActive: chat.sandboxActive,
    isSwitchingAccount: modelPick.switching,
    isExecuting: working,
    isUsageLimitHeld: false,
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
    attachments.clear();
    send({ target: chat.target, message: composer.tokenize(text), attachmentStorageIds }).catch(() => {
      toast.error("Couldn't send your message");
    });
  };

  return pending && questions ? (
    // The web dock: p-3 around the card, in place of the composer, and the thread's 10 more on the right.
    // Over the bottom inset, as the composer: the dock rises with the keyboard (its "Other..." field) less that inset.
    <View className="p-3 pr-[22px]" style={{ paddingBottom: insets.bottom + 12 }}>
      <ChoiceQuestion
        key={pending.toolUseId}
        questions={questions}
        buttonWeight="semibold"
        onSubmit={async (answers) => {
          if (!chat.parentId) return;
          try {
            await answer({ entityId: chat.parentId, toolUseId: pending.toolUseId, answer: JSON.stringify(answers) });
          } catch {
            toast.error("Couldn't submit answer");
          }
        }}
      />
    </View>
  ) : chat.canReply ? (
    // Eva's web pill composer, the + on the muted fill, 10 more in on the right as the
    // thread. Send stays ready during a turn (a send queues behind it) and Stop sits beside
    // it, as `stopMode="alongside"`.
    <View className="pr-2.5">
      {queue}
      <PromptInput
        layout="inline"
        shape="pill"
        value={composer.text}
        onChangeText={composer.setText}
        onSubmit={handleSend}
        menu={composer.menu ? <MentionMenu menu={composer.menu} onPick={composer.pick} onDismiss={composer.dismiss} /> : null}
        placeholder={placeholder}
        leading={
          <AttachButton onPress={() => void attachments.pick()} />
        }
        header={<ComposerHeader attachments={attachments} composer={composer} />}
        toolbar={working ? <PromptInputButton icon={IconPlayerStopFilled} label="Stop generating" onPress={onStop} /> : null}
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
            model={modelPick.pick ? <ModelChip repoId={chat.repoId} {...modelPick.pick} /> : undefined}
          />
        }
      />
    </View>
  ) : (
    <Text variant="muted" className="px-4 pb-8 pt-3 text-center" style={textColor(scheme, "muted")}>
      This chat is closed.
    </Text>
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
  fromTeammate,
  senderName,
  teammate,
  live,
  isLatestReply,
  link,
  turn,
  sentiment,
  onOpenDiff,
  onFork,
  onRate,
  cards,
  outputs,
  onPanelReply,
  onOpenWebChat,
}: {
  message: ChatMessage;
  dayStart: boolean;
  fromTeammate: boolean;
  senderName: string | undefined;
  teammate: ComponentProps<typeof TeammateBubble>["sender"];
  /** The streaming row's entity id while this is the live reply. */
  live: string | undefined;
  isLatestReply: boolean;
  link: string;
  turn: ComponentProps<typeof MessageFooter>["turn"];
  sentiment: Sentiment | undefined;
  onOpenDiff: ComponentProps<typeof AssistantMessage>["onOpenDiff"];
  onFork: ((messageId: string) => void) | undefined;
  onRate: (messageId: ChatMessage["_id"], sentiment: Sentiment | null) => void;
  /** The agent's cards placed under this message (`render_ui`, `render_html`). */
  cards: readonly InlineCard[] | undefined;
  /** The artifacts and reports placed under this message. */
  outputs: readonly TurnOutput[] | undefined;
  /** Sends a panel button's text; undefined disables the buttons. */
  onPanelReply: ((message: string) => void) | undefined;
  onOpenWebChat: () => void;
}) {
  const isUser = message.role === "user";
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
  return (
              <View className={`gap-3 ${THREAD_INSET}`}>
                {dayStart ? <DayDivider timestamp={message.timestamp} /> : null}
                {/* Web: parts `gap-0.5`; a reply is full width, a user message at most 95%. */}
                <Message
                  from={message.role}
                  className={message.role === "user" ? "gap-0.5" : "max-w-full gap-0.5"}
                  style={fromTeammate ? TEAMMATE_SIDE : undefined}
                >
                  {senderName ? <TeammateName name={senderName} /> : null}
                  {fromTeammate ? (
                    <TeammateBubble sender={teammate}>{userBody}</TeammateBubble>
                  ) : (
                    // Eva's web chat tints the user bubble (bg-primary/10), not the solid default. A reply is `px-1 py-2`.
                    <MessageContent bubble="tint" className={message.role === "user" ? undefined : "px-1 py-2"}>
                      {isUser ? (
                        // The web user text is markdown in `text-sm` (14 / 20), its tokens as chips.
                        userBody
                      ) : live ? (
                        <LiveAssistantMessage streamingEntityId={live} messageId={message._id} />
                      ) : (
                        <AssistantMessage
                          messageId={message._id}
                          content={message.content}
                          activityLog={message.activityLog}
                          duration={message.finishedAt ? formatDuration(message.timestamp, message.finishedAt) : undefined}
                          isLatestAssistantTurn={isLatestReply}
                          onOpenDiff={onOpenDiff}
                          media={message.media}
                          tabPanels={tabbed ? cardList : undefined}
                        />
                      )}
                    </MessageContent>
                  )}
                  {/* The web user turn: its cards, then its outputs. A reply: outputs, then the cards the tabs did not take. */}
                  {isUser && cardList ? <View className="mt-1 w-full">{cardList}</View> : null}
                  {outputList}
                  {!isUser && cardList && !tabbed ? <View className="mt-2">{cardList}</View> : null}
                  {message.content.trim() !== "" ? (
                    <MessageFooter
                      className={fromTeammate ? TEAMMATE_FOOTER_INSET : undefined}
                      text={message.content}
                      at={message.timestamp}
                      finishedAt={message.role === "assistant" ? message.finishedAt : undefined}
                      link={link}
                      onFork={onFork ? () => onFork(message._id) : undefined}
                      turn={turn}
                      rating={
                        message.role === "assistant"
                          ? {
                              sentiment,
                              onRate: (next) => onRate(message._id, next),
                            }
                          : undefined
                      }
                    />
                  ) : null}
                </Message>
              </View>
  );
}

/** The web thread at 390: the panel (10 in on the left, 20 on the right) and the column's `p-3`. */
const THREAD_INSET = "pl-[22px] pr-8";

/** The web `gap-3` between two messages. */
function MessageGap() {
  return <View className="h-3" />;
}
