import { cn } from "@eva/ui";
import {
  ChatDayDivider,
  ChatJumpRail,
  ChatLastTurn,
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  buildChatJumpRailTicks,
  tokenTransition,
} from "@vvedantb/ui";
import { findNewMessageIds, useChatRecap } from "@eva/shared/chatReadState";
import { GenerativeUiPanel } from "@vvedantb/ui/generative-ui";
import {
  ChatEmptyState,
  ChatTranscriptLoading,
} from "@/lib/components/chat/_components/ChatTranscriptStates";
import { AnimatePresence, m } from "motion/react";
import { ChatNewDivider } from "@/lib/components/chat/_components/ChatNewDivider";
import { ChatRecapCard } from "@/lib/components/chat/_components/ChatRecapCard";
import { ChatNewMessagesPill } from "@/lib/components/chat/_components/ChatNewMessagesPill";
import { ChatBottomPin } from "@/lib/components/chat/_components/ChatBottomPin";
import {
  ChatEarlierTurnsLoader,
  type TranscriptScrollAnchor,
} from "@/lib/components/chat/_components/ChatEarlierTurnsLoader";
import { useSeenOnce } from "@/lib/components/chat/useSeenOnce";
import {
  ChatComposer,
  type ChatModelPicker,
  type LocalChatDraft,
} from "@/lib/components/chat/ChatComposer";
import { ChatMessage } from "@/lib/components/chat/ChatMessage";
import { AssistantCiteToolbar } from "@/lib/components/chat/AssistantCiteToolbar";
import { PendingCitationChips } from "@/lib/components/chat/PendingCitationChips";
import { PendingSnapshotChips } from "@/lib/components/chat/PendingSnapshotChips";
import { PendingWebMcpChips } from "@/lib/components/chat/PendingWebMcpChips";
import { PendingPullRequestChips } from "@/lib/components/chat/PendingPullRequestChips";
import { appendPullRequestsToPrompt } from "@/lib/components/chat/pullRequestContext";
import { ThreadFindBar } from "@/lib/components/chat/ThreadFindBar";
import {
  collectThreadFindDocuments,
  findThreadMatches,
} from "@/lib/components/chat/threadFind";
import { MessageForkDialog } from "@/lib/components/chat/MessageForkDialog";
import {
  EVA_SENDER_NAME,
  canForkMessage,
  collectForkPrefix,
  forkThreadTitle,
  formatForkPrompt,
  placeChatUiPanels,
  SANDBOX_CHAT_COPY,
} from "@eva/shared";
import { tokenizedToDisplayText } from "@/lib/components/mentions";
import { appendCitationsToPrompt } from "@eva/shared/assistantCitation";
import { appendSnapshotsToPrompt } from "@/lib/components/sandbox/previewSnapshot";
import { appendWebMcpToPrompt } from "@/lib/components/sandbox/previewWebMcp";
import {
  PendingCitationsProvider,
  usePendingCitations,
} from "@/lib/contexts/PendingCitationsContext";
import { usePendingPreviewSnapshots } from "@/lib/contexts/PendingPreviewSnapshotsContext";
import { usePendingWebMcp } from "@/lib/contexts/PendingWebMcpContext";
import {
  PendingPullRequestsProvider,
  usePendingPullRequests,
} from "@/lib/contexts/PendingPullRequestsContext";
import type { TurnCheckpointContext } from "@/lib/components/chat/_components/useTurnCheckpointActions";
import { ChatQuestionDock } from "@/lib/components/chat/ChatQuestionDock";
import { useAgentReplyChime } from "@/lib/components/chat/useAgentReplyChime";
import { useChatReadState } from "@/lib/components/chat/useChatReadState";
import { ChatHtmlFrame } from "@/lib/components/chat/generativeHtml/ChatHtmlFrame";
import { EnvVarRequestCard } from "@/lib/components/chat/_components/EnvVarRequestCard";
import { SessionProposalCard } from "@/lib/components/chat/_components/SessionProposalCard";
import { ChatArtifactCard } from "@/lib/components/artifacts/ChatArtifactCard";
import { AgentFeedbackCard } from "@/lib/components/chat/feedback/AgentFeedbackCard";
import { groupChatFeedback } from "@eva/shared/chatFeedback";
import {
  startTransition,
  useDeferredValue,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useHeldQuery } from "@/lib/hooks/useHeldQuery";
import type { TranscriptReach } from "@/lib/hooks/useChatTranscript";
import {
  api,
  type BackgroundAgentEntry,
  type Doc,
  type Id,
} from "@eva/backend";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import type { ChatDraftSeed } from "@/lib/components/chat/useChatDraftSeed";
import {
  buildMessageHistory,
  buildPrecedingUserTurns,
  type ChatParentId,
  findHandoffBoundaryIds,
  findLastUserMessageIndex,
  findBubbleGroups,
  findStreamingTargetMessage,
  findTurnWindowStart,
  firstNameByUserId,
  isOtherUserChatMessage,
  otherUserIdsInChat,
  TRANSCRIPT_TURN_WINDOW,
  visibleChatMessages,
  type ChatBodyMessage,
  type ChatBodyQueuedMessage,
  type ChatHeldFollowUp,
  type ChatRepo,
} from "@/lib/components/chat/chatBodyUtils";
import { findDayBoundaryIds } from "@eva/shared/dayLabel";
import { parsePendingQuestion } from "@eva/shared/pendingQuestion";

import {
  ChatMessageScroll,
  useLinkedMessageId,
} from "@/lib/components/chat/messageLink";

/**
 * Extra context ChatBody hands its surface's send handler. The prompt the
 * handler receives has the pending citation / preview-snapshot / WebMCP blocks
 * appended to it, so a failure cannot offer it back to the user to re-edit —
 * `draftContent` is the text they actually typed, and is what the failure toast
 * restores.
 */
export interface ChatSendOptions {
  draftContent?: string;
}

interface TranscriptWindow {
  key: string;
  firstId: string | undefined;
  anchor?: TranscriptScrollAnchor;
  scrollTo?: { messageId: string };
}

const FIND_SEARCH_DELAY_MS = 350;

interface InlineCard {
  _id: string;
  messageId?: string;
  createdAt: number;
  card:
    | { kind: "panel"; spec: string }
    | { kind: "html"; render: Doc<"chatHtmlRenders"> }
    | { kind: "envVarRequest"; request: Doc<"envVarRequests"> }
    | { kind: "sessionProposal"; proposal: Doc<"sessionProposals"> };
}

interface ChatBodyProps {
  repo?: ChatRepo;
  conversationId: string;
  chatParentId?: ChatParentId;
  isRouteActive?: boolean;
  messages: ChatBodyMessage[];
  isLoadingMessages?: boolean;
  hasOlderHistory?: boolean;
  onLoadOlderHistory?: () => void;
  onReachHistory?: (target: TranscriptReach) => void;
  isReachingHistory?: boolean;
  queuedMessages: ChatBodyQueuedMessage[];
  queueLabel?: string;
  heldFollowUps?: ChatHeldFollowUp[];
  streamingActivity?: string;
  streamingContent?: string;
  streamingPendingQuestion?: string;
  blockingQuestion?: { toolUseId: string; payload: string };
  onAnswerBlockingQuestion?: (
    toolUseId: string,
    answers: Record<string, string>,
  ) => Promise<void>;
  isExecuting: boolean;
  isInputDisabled: boolean;
  isArchived?: boolean;
  placeholder: string;
  emptyStateTitle: string;
  emptyStateDescription?: string;
  disabledReason?: string;
  onStartSandbox?: () => void;
  modelPicker?: ChatModelPicker;
  onSend: (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
    options?: ChatSendOptions,
  ) => Promise<void>;
  onCancel: () => Promise<void>;
  preInputContent?: React.ReactNode;
  composerChips?: React.ReactNode;
  transcriptTail?: React.ReactNode;
  underCardLeading?: React.ReactNode;
  draft?: ChatDraftSeed;
  localDraft?: LocalChatDraft;
  isDraftLoading?: boolean;
  onOpenFile?: (path: string) => void;
  onViewDiff?: (repoRelativePath?: string) => void;
  hasPendingContext?: boolean;
  onOpenAgentsTab?: () => void;
  backgroundAgents?: ReadonlyArray<BackgroundAgentEntry>;
  sandboxRunning?: boolean;
  turnCheckpoint?: TurnCheckpointContext;
  allowEmptySubmit?: boolean;
  afterMessage?: (messageId: string) => ReactNode;
  onForkTranscript?: (input: {
    throughMessageId: string;
    title: string;
    prompt: string;
  }) => Promise<void>;
  hideJumpRail?: boolean;
  assistantBubbles?: boolean;
  onOpenThread?: (messageId: string) => void;
}

export function ChatBody(props: ChatBodyProps) {
  return (
    <PendingCitationsProvider>
      <PendingPullRequestsProvider>
        <ChatBodyInner {...props} />
      </PendingPullRequestsProvider>
    </PendingCitationsProvider>
  );
}

function ChatBodyInner({
  repo,
  conversationId,
  chatParentId,
  isRouteActive = true,
  messages,
  isLoadingMessages = false,
  hasOlderHistory = false,
  onLoadOlderHistory,
  onReachHistory,
  isReachingHistory = false,
  queuedMessages,
  queueLabel,
  heldFollowUps,
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
  modelPicker,
  onSend,
  onCancel,
  preInputContent,
  composerChips,
  transcriptTail,
  underCardLeading,
  draft,
  localDraft,
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
  hideJumpRail = false,
  assistantBubbles = false,
  onOpenThread,
}: ChatBodyProps) {
  const citations = usePendingCitations();
  const snapshots = usePendingPreviewSnapshots();
  const webmcp = usePendingWebMcp();
  const pullRequests = usePendingPullRequests();
  const sendWithPendingContext = async (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
  ) => {
    const sentCitations = citations?.items ?? [];
    const sentSnapshots = snapshots?.items ?? [];
    const sentWebMcp = webmcp?.items ?? [];
    const sentPullRequests = pullRequests?.items ?? [];
    const withCitations = appendCitationsToPrompt(content, sentCitations);
    const withPullRequests = appendPullRequestsToPrompt(
      withCitations,
      sentPullRequests,
    );
    const withSnapshots = appendSnapshotsToPrompt(
      withPullRequests,
      sentSnapshots.map((item) => item.snapshot),
    );
    const withWebMcp = appendWebMcpToPrompt(
      withSnapshots,
      sentWebMcp.map((item) => item.discovery),
    );
    void onSend(withWebMcp, attachmentStorageIds, {
      draftContent: content,
    }).then(
      () => {
        for (const citation of sentCitations) citations?.remove(citation.id);
        for (const item of sentSnapshots) snapshots?.remove(item.id);
        for (const item of sentWebMcp) webmcp?.remove(item.id);
        for (const pr of sentPullRequests) pullRequests?.remove(pr.url);
      },
      () => {},
    );
  };
  const hasComposerContext =
    (hasPendingContext ?? false) ||
    (citations?.items.length ?? 0) > 0 ||
    (snapshots?.items.length ?? 0) > 0 ||
    (webmcp?.items.length ?? 0) > 0 ||
    (pullRequests?.items.length ?? 0) > 0;
  const simpleView = useSimpleView();
  const displayMessages = visibleChatMessages(messages, simpleView);
  const showScopeCheck =
    useQuery(api.auth.getExperimentalFlags)?.scopeCheck === true;

  const lastMessageId = messages.at(-1)?._id;
  const predictionTarget =
    chatParentId && isRouteActive && !isExecuting && lastMessageId
      ? { parentId: chatParentId, lastMessageId }
      : undefined;

  const backlogReady = useDeferredValue(displayMessages.length > 0, false);
  const rowsAnimateIn = useDeferredValue(!isLoadingMessages, false);
  const userMessages = useHeldQuery(
    api.messages.listUserMessagesByParent,
    chatParentId && isRouteActive ? { parentId: chatParentId } : "skip",
  );
  const firstLoadedAt = displayMessages[0]?._creationTime;
  const unloadedUserMessages =
    hasOlderHistory && userMessages && firstLoadedAt !== undefined
      ? userMessages
          .filter((message) => message._creationTime < firstLoadedAt)
          .map(
            (
              message,
            ): Pick<
              ChatBodyMessage,
              "_id" | "role" | "content" | "isSystemAlert"
            > => ({ ...message, role: "user" }),
          )
      : [];
  const jumpRailTicks = buildChatJumpRailTicks(
    [...unloadedUserMessages, ...displayMessages].map((message) => ({
      id: message._id,
      role: message.role,
      content: message.content,
      isSystemAlert: message.isSystemAlert,
    })),
  );

  const deferredStreamingActivity = useDeferredValue(streamingActivity);

  const lastMessage = displayMessages[displayMessages.length - 1];
  const streamingTarget = findStreamingTargetMessage(displayMessages);
  const streamingTargetId = streamingTarget?._id;
  const messageGap = assistantBubbles ? "gap-5" : "gap-3";

  const [dismissedQuestionKey, setDismissedQuestionKey] = useState<
    string | null
  >(null);
  const [isAnsweringQuestion, setIsAnsweringQuestion] = useState(false);
  const [forkThroughId, setForkThroughId] = useState<string | null>(null);
  const serverForkPrefix = useQuery(
    api.messages.forkPrefixByParent,
    forkThroughId !== null && hasOlderHistory && chatParentId
      ? { parentId: chatParentId, throughMessageId: forkThroughId }
      : "skip",
  );
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
  const blockingQuestions = blockingQuestion
    ? parsePendingQuestion(blockingQuestion.payload)
    : null;
  const dockedQuestions = blockingQuestions ?? activePendingQuestion;

  const handleQuestionAnswer = async (answer: string) => {
    if (pendingQuestionRaw) {
      setDismissedQuestionKey(pendingQuestionRaw);
    }
    setIsAnsweringQuestion(true);
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

  const messageHistory = buildMessageHistory([
    ...unloadedUserMessages,
    ...displayMessages,
  ]);

  const lastUserMessageIndex = findLastUserMessageIndex(displayMessages);

  const handoffBoundaryIds = findHandoffBoundaryIds(displayMessages);
  const dayBoundaryIds = findDayBoundaryIds(displayMessages);
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
  const { newSinceAt } = useChatReadState({
    parentId: chatParentId,
    active: isRouteActive,
  });
  const newMessageIds = findNewMessageIds(
    displayMessages,
    newSinceAt,
    currentUserId,
  );
  const newBoundaryId = newMessageIds[0];
  const bubbleGroups = findBubbleGroups(displayMessages, {
    currentUserId: currentUserId ?? undefined,
    assistantBubbles,
    breaksBefore:
      newBoundaryId === undefined
        ? dayBoundaryIds
        : new Set([...dayBoundaryIds, newBoundaryId]),
  });
  // "Since you've been gone": the server writes it when you return after a
  // long absence; it sits under the newest message, where the chat opens.
  const { recap, dismiss: dismissRecap } = useChatRecap({
    parentId: chatParentId,
    active: isRouteActive,
    messages: displayMessages,
    currentUserId,
  });
  const recapCard =
    recap && repo && displayMessages.length > 0 ? (
      <ChatRecapCard
        kind={recap.kind}
        text={recap.text}
        repo={repo}
        onDismiss={dismissRecap}
      />
    ) : null;
  // Seen state lives here, not in the divider: the pill is a sibling and needs
  // it. It is keyed by the boundary id, so a new boundary starts unseen.
  const newDivider = useSeenOnce(newBoundaryId);

  // A long chat renders only its last TRANSCRIPT_TURN_WINDOW turns; older ones
  // load as the reader scrolls up (ChatEarlierTurnsLoader). Committing every
  // turn made opening a 450-message chat block for 1–2 s, and every row is
  // work on each streamed token. The window is pinned to its first row and
  // only grows: new turns append below it, so nothing above the reader ever
  // unmounts mid-read. It also grows to hold the NEW divider, a jump-rail
  // target and the first find match, which all need their row in the DOM.
  const windowKey = chatParentId ?? conversationId;
  const [transcriptWindow, setTranscriptWindow] = useState<TranscriptWindow>({
    key: windowKey,
    firstId: undefined,
  });
  const ownWindow =
    transcriptWindow.key === windowKey ? transcriptWindow : undefined;
  const pinnedIndex =
    ownWindow?.firstId === undefined
      ? -1
      : displayMessages.findIndex(
          (message) => message._id === ownWindow.firstId,
        );
  const newBoundaryIndex =
    newBoundaryId === undefined
      ? -1
      : displayMessages.findIndex((message) => message._id === newBoundaryId);
  // An unknown pin (an optimistic row that took its server id) falls back to
  // the default window.
  const baseWindowStart =
    pinnedIndex >= 0
      ? pinnedIndex
      : findTurnWindowStart(displayMessages, TRANSCRIPT_TURN_WINDOW);
  // A shared message link (`?message=<id>`) opens the chat at that message.
  // Only the chat on screen follows it: hidden cached shells read the same URL.
  const linkedParam = useLinkedMessageId();
  const linkedIndex =
    linkedParam === null || !isRouteActive
      ? -1
      : displayMessages.findIndex((message) => message._id === linkedParam);
  const linkedMessageId =
    linkedIndex >= 0 ? displayMessages[linkedIndex]?._id : undefined;
  const windowStart = Math.min(
    baseWindowStart,
    ...[
      newBoundaryIndex,
      // The linked row's whole turn, so it does not open mid-turn.
      linkedIndex >= 0
        ? findTurnWindowStart(displayMessages, 1, linkedIndex + 1)
        : -1,
    ].filter((index) => index >= 0),
  );
  const windowFirstId = displayMessages[windowStart]?._id;
  // Pinning during render is React's "adjust state when a prop changes"
  // pattern: it re-renders before commit, and settles once the pin matches.
  if (windowFirstId !== undefined && ownWindow?.firstId !== windowFirstId) {
    setTranscriptWindow({
      ...ownWindow,
      key: windowKey,
      firstId: windowFirstId,
    });
  }

  /** Grows the window up to `index`, when that row is above it. */
  const extendWindowTo = (
    index: number,
    extra: Pick<TranscriptWindow, "anchor" | "scrollTo">,
  ) => {
    const firstId = displayMessages[index]?._id;
    if (firstId === undefined || index >= windowStart) return;
    setTranscriptWindow({ key: windowKey, firstId, ...extra });
  };

  const loadEarlierTurns = (anchor: TranscriptScrollAnchor | undefined) => {
    // Transition priority: a batch of heavy turns must not freeze the scroll
    // that asked for it.
    startTransition(() => {
      extendWindowTo(
        findTurnWindowStart(
          displayMessages,
          TRANSCRIPT_TURN_WINDOW,
          windowStart,
        ),
        { anchor },
      );
    });
  };

  // A rail tick or a find query can aim above the loaded history. The chat
  // asks for the history, and the jump completes in the render that has the
  // row (or gives up once nothing older is left).
  const [pendingJump, setPendingJump] = useState<
    { kind: "message"; messageId: string } | { kind: "find"; query: string }
  >();

  // Rail ticks are user rows: the window starts at the tick's own turn.
  const revealMessage = (messageId: string) => {
    const index = displayMessages.findIndex(
      (message) => message._id === messageId,
    );
    if (index < 0) {
      if (!hasOlderHistory || !onReachHistory) return;
      setPendingJump({ kind: "message", messageId });
      onReachHistory({ messageId });
      return;
    }
    startTransition(() => {
      extendWindowTo(index, { scrollTo: { messageId } });
    });
  };

  /** The window start that puts the first match of `query` in the DOM. */
  const firstFindMatchStart = (query: string) => {
    const first = findThreadMatches(findDocuments, query)[0];
    if (!first) return -1;
    const index = displayMessages.findIndex(
      (message) => message._id === first.messageId,
    );
    return index < 0 ? -1 : findTurnWindowStart(displayMessages, 1, index + 1);
  };

  // Typing pauses before the server search: each prefix ("a", "au", "aut")
  // would otherwise load history down to its own oldest match.
  const findSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [findJumpKey, setFindJumpKey] = useState(0);

  // Urgent, in the bar's own input event: the rows must be in the DOM by the
  // time the bar's deferred query paints and jumps, which counts DOM matches.
  // Every match lies at or below the first one, so its turn is enough. Older
  // history is searched on the server, and loaded down to its oldest match.
  const revealFirstFindMatch = (query: string) => {
    extendWindowTo(firstFindMatchStart(query), {});
    if (findSearchTimer.current !== null) clearTimeout(findSearchTimer.current);
    findSearchTimer.current = null;
    if (!hasOlderHistory || !onReachHistory || query.trim().length === 0) {
      return;
    }
    findSearchTimer.current = setTimeout(() => {
      findSearchTimer.current = null;
      setPendingJump({ kind: "find", query });
      onReachHistory({ search: query });
    }, FIND_SEARCH_DELAY_MS);
  };

  if (pendingJump?.kind === "message") {
    const index = displayMessages.findIndex(
      (message) => message._id === pendingJump.messageId,
    );
    if (index >= 0) {
      setPendingJump(undefined);
      extendWindowTo(index, { scrollTo: { messageId: pendingJump.messageId } });
    } else if (!isReachingHistory) {
      setPendingJump(undefined);
    }
  } else if (pendingJump?.kind === "find" && !isReachingHistory) {
    setPendingJump(undefined);
    extendWindowTo(firstFindMatchStart(pendingJump.query), {});
    setFindJumpKey(findJumpKey + 1);
  }

  const jumpToNewDivider = () => {
    newDivider.element?.scrollIntoView({ behavior: "smooth", block: "center" });
    newDivider.markSeen();
  };

  // Agent-posted inline cards: composed panels (`render_ui`), HTML pages
  // (`render_html`) and secret requests (`request_env_var`). One query each
  // per chat covers all three surfaces, since every one of them renders
  // through this component.
  const chatUiPanels = useQuery(
    api.chatUi.listByParent,
    chatParentId ? { parentId: chatParentId } : "skip",
  );
  const htmlRenders = useQuery(
    api.chatHtml.listByParent,
    chatParentId ? { parentId: chatParentId } : "skip",
  );
  const envVarRequests = useQuery(
    api.envVarRequests.listByParent,
    chatParentId ? { parentId: chatParentId } : "skip",
  );
  const sessionProposals = useQuery(
    api.sessionProposals.listByParent,
    chatParentId ? { parentId: chatParentId } : "skip",
  );
  const panelPlacement = placeChatUiPanels(
    [
      ...(chatUiPanels ?? []).map(
        (panel): InlineCard => ({
          _id: panel._id,
          messageId: panel.messageId,
          createdAt: panel.createdAt,
          card: { kind: "panel", spec: panel.spec },
        }),
      ),
      ...(htmlRenders ?? []).map(
        (render): InlineCard => ({
          _id: render._id,
          messageId: render.messageId,
          createdAt: render.createdAt,
          card: { kind: "html", render },
        }),
      ),
      ...(envVarRequests ?? []).map(
        (request): InlineCard => ({
          _id: request._id,
          messageId: request.messageId,
          createdAt: request.createdAt,
          card: { kind: "envVarRequest", request },
        }),
      ),
      ...(sessionProposals ?? []).map(
        (proposal): InlineCard => ({
          _id: proposal._id,
          messageId: proposal.messageId,
          createdAt: proposal.createdAt,
          card: { kind: "sessionProposal", proposal },
        }),
      ),
    ],
    displayMessages,
    hasOlderHistory,
  );

  // Artifacts saved in this chat (`create_artifact`) and the agent's
  // `submit_feedback` reports. Placed by the same rule as the cards above, but
  // kept apart: they sit with the turn's output and never trade places with
  // its prose behind a tab.
  const chatArtifacts = useQuery(
    api.artifacts.listForChat,
    chatParentId ? { parentId: chatParentId } : "skip",
  );
  // Thumbs on turns and the agent's reports.
  const chatFeedback = useQuery(
    api.feedback.listForChat,
    chatParentId ? { parentId: chatParentId } : "skip",
  );
  const feedback = groupChatFeedback(chatFeedback ?? [], currentUserId);
  const turnOutputPlacement = placeChatUiPanels(
    [
      ...(chatArtifacts ?? []).map((artifact) => ({
        _id: artifact._id,
        messageId: artifact.messageId,
        createdAt: artifact.createdAt,
        node: <ChatArtifactCard key={artifact._id} artifact={artifact} />,
      })),
      ...feedback.agentReports.map((report) => ({
        _id: report._id,
        messageId: report.messageId,
        createdAt: report.createdAt,
        node: <AgentFeedbackCard key={report._id} feedback={report} />,
      })),
    ],
    displayMessages,
    hasOlderHistory,
  );
  const renderTurnOutput = (messageId: string) => {
    const outputs = turnOutputPlacement.byMessageId.get(messageId);
    return outputs ? outputs.map((output) => output.node) : undefined;
  };

  const otherUserIds = otherUserIdsInChat(displayMessages, currentUserId);
  const users = useQuery(
    api.users.getMany,
    otherUserIds.length > 0 ? { ids: otherUserIds } : "skip",
  );
  const firstNames = firstNameByUserId(users ?? []);

  // Retry re-sends the failed turn's prompt through the normal send path. It is
  // withheld while a turn is running (the send would only queue behind it) and
  // on a read-only chat, which has no composer at all.
  const handleRetryTurn =
    isArchived || isExecuting
      ? undefined
      : (content: string, attachmentStorageIds?: Id<"_storage">[]) => {
          // `onSend` rejects on a failed send so the composer can keep the
          // pending chips. The surface has already toasted by then, so swallow
          // it here rather than leaving an unhandled rejection.
          void onSend(content, attachmentStorageIds).catch(() => {});
        };

  // A panel button sends its text through the normal send path, so it queues
  // behind a running turn exactly as a typed message would. Withheld on a
  // read-only chat and on one whose sandbox is asleep, which is what renders
  // the panel's buttons disabled instead of inert.
  const handlePanelReply =
    isArchived || isInputDisabled
      ? undefined
      : (message: string) => {
          // See `handleRetryTurn`: the rejection is already surfaced as a toast.
          void onSend(message).catch(() => {});
        };

  // Undefined rather than an empty array: the caller slots this into a wrapper
  // that must not render (and take margin) when the turn has no panels.
  const renderChatUiPanels = (panels: typeof panelPlacement.trailing) =>
    panels.length === 0
      ? undefined
      : panels.map(({ _id, card }) => {
          switch (card.kind) {
            case "panel":
              return (
                <GenerativeUiPanel
                  key={_id}
                  spec={card.spec}
                  onReply={handlePanelReply}
                  data-testid="chat-ui-panel"
                />
              );
            case "html":
              return <ChatHtmlFrame key={_id} render={card.render} />;
            case "envVarRequest":
              return (
                <EnvVarRequestCard
                  key={_id}
                  request={card.request}
                  onReply={handlePanelReply}
                />
              );
            case "sessionProposal":
              return (
                <SessionProposalCard
                  key={_id}
                  proposal={card.proposal}
                  basePath={repo?.basePath}
                  onReply={handlePanelReply}
                />
              );
          }
        });

  /**
   * Every prop handed to a row must keep its identity across ChatBody renders.
   * `ChatMessage` is memoised, and switching sessions re-renders ChatBody (the
   * cached shells flip `isRouteActive`); one unstable prop re-renders all rows.
   *
   * `isBacklog` marks a row the chat opened already scrolled past, which skips
   * its enter animation: nothing arrived, and 80 simultaneous enter animations
   * is the most expensive part of committing a long transcript.
   *
   * (`content-visibility: auto` on these rows was tried and reverted — no
   * intrinsic-size estimate fits a chat turn, so the scroll height grew from
   * 19k to 36k px as the user scrolled up through them.)
   */
  const precedingUserTurns = buildPrecedingUserTurns(displayMessages);

  const renderMessage = (message: ChatBodyMessage, isBacklog = false) => {
    const isStreamingTarget = message._id === streamingTargetId;
    const isOtherUser = isOtherUserChatMessage(message, currentUserId);
    const joinsPrevious = bubbleGroups.joinsPrevious.has(message._id);
    const joinsNext = bubbleGroups.joinsNext.has(message._id);
    // One name over a run of one sender's bubbles: a teammate's first name,
    // or "Eva" over her replies in the coordinator chat.
    const senderFirstName = joinsPrevious
      ? undefined
      : assistantBubbles && message.role === "assistant"
        ? EVA_SENDER_NAME
        : isOtherUser && message.userId
          ? firstNames.get(message.userId)
          : undefined;
    const precedingUser = precedingUserTurns.get(message._id);

    return (
      <div
        key={message._id}
        // A run of one sender's bubbles sits 4px apart, not 12 (20 in the
        // coordinator chat, whose hover toolbar sits on a bubble's top edge).
        className={cn(
          "flex flex-col gap-3",
          joinsPrevious && (assistantBubbles ? "-mt-4" : "-mt-2"),
        )}
      >
        {dayBoundaryIds.has(message._id) ? (
          <ChatDayDivider timestamp={message.timestamp} />
        ) : null}
        {message._id === newBoundaryId ? (
          <ChatNewDivider ref={newDivider.ref} />
        ) : null}
        <ChatMessage
          message={message}
          animateIn={!isBacklog && rowsAnimateIn}
          repo={repo}
          // The run's action row sits under its last bubble only.
          showTurnMeta={!simpleView && !joinsNext}
          joinsNext={joinsNext}
          showScopeCheck={showScopeCheck}
          isOtherUser={isOtherUser}
          senderFirstName={senderFirstName}
          assistantBubble={assistantBubbles}
          isHandoffBoundary={handoffBoundaryIds.has(message._id)}
          turnModel={precedingUser?.model}
          turnReasoningLevel={precedingUser?.reasoningLevel}
          turnCredentialSourceLabel={precedingUser?.credentialSourceLabel}
          streamingActivity={
            isStreamingTarget ? deferredStreamingActivity : undefined
          }
          streamingContent={isStreamingTarget ? streamingContent : undefined}
          onOpenFile={onOpenFile}
          onViewDiff={onViewDiff}
          onOpenAgentsTab={simpleView ? undefined : onOpenAgentsTab}
          backgroundAgents={backgroundAgents}
          sandboxRunning={sandboxRunning}
          turnCheckpoint={simpleView ? undefined : turnCheckpoint}
          // Only a failed turn shows Retry. `handleRetryTurn` changes with
          // `onSend`, so handing it to every row re-rendered the transcript.
          onRetryTurn={
            message.errorType !== undefined ? handleRetryTurn : undefined
          }
          precedingUser={precedingUser}
          citeHighlight={citations?.highlightedMessageId === message._id}
          linkHighlight={message._id === linkedMessageId}
          onFork={
            onForkTranscript && canForkMessage(message)
              ? setForkThroughId
              : undefined
          }
          // System alerts and empty rows have nothing to reply to.
          onReply={
            onOpenThread && canForkMessage(message) ? onOpenThread : undefined
          }
          belowContent={renderChatUiPanels(
            panelPlacement.byMessageId.get(message._id) ?? [],
          )}
          artifacts={renderTurnOutput(message._id)}
          canRate={chatParentId !== undefined && message.role === "assistant"}
          feedbackSentiment={
            feedback.mineByMessageId.get(message._id)?.sentiment
          }
          feedbackComment={feedback.mineByMessageId.get(message._id)?.comment}
        />
        {afterMessage?.(message._id)}
      </div>
    );
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-chat-pane="">
      <ThreadFindBar
        documents={findDocuments}
        onQueryChange={revealFirstFindMatch}
        jumpKey={findJumpKey}
        scopeKey={windowFirstId}
      />
      <Conversation
        className="flex-1 min-h-0"
        // Only a live reply glides down. Any other growth — loading skeleton
        // to transcript, the deferred backlog, late markdown — snaps, so an
        // opened chat lands at the bottom instead of animating from the top.
        resize={streamingTargetId ? "smooth" : "instant"}
      >
        <ConversationContent
          className={cn("p-3 max-w-3xl mx-auto w-full", messageGap)}
          // No native scroll anchoring: ChatEarlierTurnsLoader holds the
          // reader's place itself, and two corrections would add up.
          // Until the backlog commits, the content is only the last turn: the
          // thumb filled the whole track, then jumped to the bottom when the
          // older turns landed. A transparent thumb keeps the gutter's width.
          scrollClassName={
            displayMessages.length > 0 && !backlogReady
              ? "[container-type:size] [overflow-anchor:none] [scrollbar-color:transparent_transparent]"
              : "[container-type:size] [overflow-anchor:none]"
          }
        >
          {displayMessages.length === 0 ? (
            transcriptTail ? (
              // Bottom-anchored like a live last turn, so the tail sits in the
              // same spot above the composer whether or not messages exist.
              <div className="flex min-h-[calc(100cqh-1.5rem)] flex-col justify-end">
                {transcriptTail}
              </div>
            ) : isLoadingMessages ? (
              <ChatTranscriptLoading />
            ) : (
              <ChatEmptyState
                title={emptyStateTitle}
                description={emptyStateDescription}
                {...(onStartSandbox
                  ? {
                      action: {
                        label: SANDBOX_CHAT_COPY.wakeAction,
                        onClick: onStartSandbox,
                      },
                    }
                  : {})}
              />
            )
          ) : lastUserMessageIndex < 0 ? (
            displayMessages.map((message) => renderMessage(message))
          ) : (
            <>
              {backlogReady &&
              (windowStart > 0 ||
                ownWindow?.anchor !== undefined ||
                hasOlderHistory) ? (
                <ChatEarlierTurnsLoader
                  // A landed history step changes the first row: the fresh
                  // marker observes again and now grows the window over it.
                  key={`${windowFirstId}:${displayMessages[0]?._id}`}
                  anchor={ownWindow?.anchor}
                  // Only the chat on screen grows its window: a hidden cached
                  // shell has no reader scrolling up. Rendered rows run out
                  // before loaded ones do; then the next history step loads.
                  onReach={
                    !isRouteActive
                      ? undefined
                      : windowStart > 0
                        ? loadEarlierTurns
                        : hasOlderHistory
                          ? onLoadOlderHistory
                          : undefined
                  }
                />
              ) : null}
              {backlogReady
                ? displayMessages
                    .slice(windowStart, lastUserMessageIndex)
                    .map((message) => renderMessage(message, true))
                : null}
              <ChatLastTurn>
                {/* The kit's last turn spaces its rows 12px; this keeps the
                    chat's own message gap there too. */}
                <div className={cn("flex flex-col", messageGap)}>
                  {displayMessages
                    .slice(lastUserMessageIndex)
                    .map((message) => renderMessage(message))}
                  {/* Inside the last turn, which pads to the viewport height:
                      after it, the card would sit a screen below the reply. */}
                  {recapCard}
                </div>
              </ChatLastTurn>
            </>
          )}
          {/* No last turn (no user message yet): the recap follows the rows. */}
          {lastUserMessageIndex < 0 ? recapCard : null}
          {displayMessages.length > 0 ? transcriptTail : null}
          {renderChatUiPanels(panelPlacement.trailing)}
          {turnOutputPlacement.trailing.map((output) => output.node)}
        </ConversationContent>
        {newBoundaryId ? (
          <ChatNewMessagesPill
            key={newBoundaryId}
            count={newMessageIds.length}
            visible={newDivider.status === "above"}
            onJump={jumpToNewDivider}
          />
        ) : null}
        <ConversationScrollButton resetKey={conversationId} />
        {/* A reply glides only once the chat has opened: the rows it opens
            with land at the bottom without a scroll. */}
        <ChatBottomPin
          glide={streamingTargetId !== undefined && rowsAnimateIn}
        />
        {/* Mounted with the backlog, so a linked row above the last turn is
            already in the DOM when this scrolls to it. */}
        {backlogReady && linkedMessageId !== undefined ? (
          <ChatMessageScroll
            key={linkedMessageId}
            messageId={linkedMessageId}
            block="center"
          />
        ) : null}
        {/* A rail jump: mounts in the commit that renders its row. */}
        {ownWindow?.scrollTo ? (
          <ChatMessageScroll
            key={ownWindow.scrollTo.messageId}
            messageId={ownWindow.scrollTo.messageId}
            block="start"
            smooth
          />
        ) : null}
        {/* Mounted with the backlog: the rail resolves its ticks by querying
            `[data-message-id]` from an effect keyed on the (memoised) tick
            array, so binding it before those rows exist would observe nothing
            and never retry. */}
        {backlogReady && !hideJumpRail ? (
          <ChatJumpRail
            messages={jumpRailTicks}
            renderedFromId={windowFirstId}
            onRevealMessage={revealMessage}
            formatPreview={tokenizedToDisplayText}
          />
        ) : null}
        {isArchived ? null : (
          <AssistantCiteToolbar chatParentId={chatParentId} />
        )}
      </Conversation>
      {isArchived ? null : (
        <AnimatePresence mode="wait" initial={false}>
          {dockedQuestions ? (
            <m.div
              key="question-dock"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={tokenTransition.base}
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
              transition={tokenTransition.base}
            >
              <ChatComposer
                repo={repo}
                mentionEva={assistantBubbles}
                conversationId={conversationId}
                queuedMessages={queuedMessages}
                queueLabel={queueLabel}
                heldFollowUps={heldFollowUps}
                messageHistory={messageHistory}
                isExecuting={isExecuting}
                isInputDisabled={isInputDisabled}
                disabledReason={disabledReason}
                onStartSandbox={onStartSandbox}
                placeholder={placeholder}
                modelPicker={modelPicker}
                onSend={sendWithPendingContext}
                onCancel={onCancel}
                preInputContent={
                  <>
                    <PendingCitationChips />
                    <PendingSnapshotChips />
                    <PendingWebMcpChips />
                    <PendingPullRequestChips />
                    {preInputContent}
                  </>
                }
                statusChips={composerChips}
                streamingActivity={deferredStreamingActivity}
                streamingTurnId={streamingTargetId}
                underCardLeading={underCardLeading}
                draft={draft}
                localDraft={localDraft}
                isDraftLoading={isDraftLoading}
                hasPendingContext={hasComposerContext}
                allowEmptySubmit={allowEmptySubmit}
                predictionTarget={predictionTarget}
              />
            </m.div>
          )}
        </AnimatePresence>
      )}
      <MessageForkDialog
        prefix={
          forkThroughId === null
            ? null
            : hasOlderHistory && chatParentId
              ? (serverForkPrefix ?? null)
              : collectForkPrefix(
                  displayMessages.map((message) => ({
                    id: message._id,
                    role: message.role,
                    content: message.content,
                    isSystemAlert: message.isSystemAlert,
                  })),
                  forkThroughId,
                )
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
