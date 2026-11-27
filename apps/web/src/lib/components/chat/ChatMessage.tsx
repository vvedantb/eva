import { cn } from "@eva/ui";
import {
  CollapsibleUserMessageBody,
  formatModelDisplayLabel,
  Message as AIMessage,
  MessageContent,
  tokenTransition,
  ProviderIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Markdown,
  IconEva,
} from "@vvedantb/ui";
import { memo, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { CHAT_MARKDOWN_COMPONENTS } from "@/lib/components/chat/ChatMarkdownLink";
import {
  AgentSpawnCtaRow,
  deriveAgentSpawnSummary,
} from "@/lib/components/chat/_components/AgentSpawnCtaRow";
import { messageAttachments } from "@eva/shared";
import { formatClockTime } from "@eva/shared/dayLabel";
import { formatDuration } from "@eva/shared/duration";
import {
  findAIModelOption,
  getReasoningLevelLabel,
  type BackgroundAgentEntry,
  type Id,
} from "@eva/backend";
import { AgentMedia } from "@/lib/components/AgentMedia";
import { ReviewCommentMessage } from "@/lib/components/chat/ReviewCommentMessage";
import { ChatMessageActions } from "@/lib/components/chat/ChatMessageActions";
import type { ChatMessageActionItem } from "@/lib/components/chat/ChatMessageActions";
import { TurnFeedbackActions } from "@/lib/components/chat/feedback/TurnFeedbackActions";
import type { FeedbackSentiment } from "@eva/shared/chatFeedback";
import { ChatMessageContextMenu } from "@/lib/components/chat/ChatMessageContextMenu";
import {
  useTurnCheckpointActions,
  type TurnCheckpointContext,
} from "@/lib/components/chat/_components/useTurnCheckpointActions";
import {
  StreamingActivityDisplay,
  ActivityLogDisplay,
} from "@/lib/components/StreamingActivityDisplay";
import { SystemAlertMessage } from "@/lib/components/SystemAlertMessage";
import { UserMessageAttachments } from "@/lib/components/chat/imageAttachments";
import { EvaIcon } from "@/lib/components/EvaIcon";
import { EvaTypingLine } from "@/lib/components/chat/TypingIndicator";
import {
  IconGitFork,
  IconMessages,
  IconLink,
  IconPlayerStop,
} from "@tabler/icons-react";
import { copyMessageLink } from "@/lib/components/chat/messageLink";
import { UserMessageAvatar } from "@/lib/components/UserMessageAvatar";
import { tokenizedToDisplayText } from "@/lib/components/mentions";
import type {
  ChatBodyMessage,
  ChatRepo,
} from "@/lib/components/chat/chatBodyUtils";
import {
  collectQuestionSteps,
  getAssistantTurnState,
  stripErrorPrefix,
  turnErrorTitle as getTurnErrorTitle,
} from "@/lib/components/chat/chatBodyUtils";
import { AssistantQuestionCards } from "@/lib/components/chat/_components/AssistantQuestionCards";
import { ChatUiPanelTabs } from "@/lib/components/chat/generativeUi/ChatUiPanelTabs";
import { ScopeCheckChip } from "@/lib/components/chat/_components/ScopeCheckChip";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { TurnErrorNotice } from "@/lib/components/chat/TurnErrorNotice";
import { ThreadSummary } from "@/lib/components/chat/replies/ThreadSummary";
import { MessageToolbar } from "@/lib/components/chat/_components/MessageToolbar";

const EVA_ICON = <EvaIcon />;

function sideBubbleRadius(joinsNext: boolean): string {
  const r = "clamp(0.75rem, var(--radius), 1rem)";
  return joinsNext ? r : `${r} ${r} ${r} 0`;
}

function MessageModelIcon({
  model,
  reasoningLevel,
  credentialSourceLabel,
}: {
  model: string;
  reasoningLevel?: string;
  credentialSourceLabel?: string;
}) {
  const option = findAIModelOption(model);
  const modelLabel = formatModelDisplayLabel(option.provider, option.label);
  const effortLabel = reasoningLevel
    ? getReasoningLevelLabel(reasoningLevel)
    : null;
  const parts = [modelLabel];
  if (effortLabel) parts.push(effortLabel);
  if (credentialSourceLabel) parts.push(credentialSourceLabel);
  const tooltip = parts.join(" · ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground/70"
          aria-label={tooltip}
        >
          <ProviderIcon provider={option.provider} size={12} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

interface ChatMessageProps {
  message: ChatBodyMessage;
  animateIn?: boolean;
  repo?: ChatRepo;
  showTurnMeta?: boolean;
  showScopeCheck?: boolean;
  isOtherUser?: boolean;
  senderFirstName?: string;
  assistantBubble?: boolean;
  joinsNext?: boolean;
  isHandoffBoundary?: boolean;
  turnModel?: string;
  turnReasoningLevel?: string;
  turnCredentialSourceLabel?: string;
  streamingActivity?: string;
  streamingContent?: string;
  onOpenFile?: (path: string) => void;
  onViewDiff?: (repoRelativePath?: string) => void;
  onOpenAgentsTab?: () => void;
  backgroundAgents?: ReadonlyArray<BackgroundAgentEntry>;
  sandboxRunning?: boolean;
  turnCheckpoint?: TurnCheckpointContext;
  citeHighlight?: boolean;
  linkHighlight?: boolean;
  onFork?: (messageId: string) => void;
  onReply?: (messageId: string) => void;
  onRetryTurn?: (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
  ) => void;
  precedingUser?: {
    content: string;
    attachmentStorageIds?: Id<"_storage">[];
  };
  belowContent?: ReactNode;
  artifacts?: ReactNode;
  canRate?: boolean;
  feedbackSentiment?: FeedbackSentiment;
  feedbackComment?: string;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  animateIn = true,
  repo,
  showTurnMeta = true,
  showScopeCheck = false,
  isOtherUser = false,
  senderFirstName,
  assistantBubble = false,
  joinsNext = false,
  isHandoffBoundary = false,
  turnModel,
  turnReasoningLevel,
  turnCredentialSourceLabel,
  streamingActivity,
  streamingContent,
  onOpenFile,
  onViewDiff,
  onOpenAgentsTab,
  backgroundAgents,
  sandboxRunning,
  turnCheckpoint,
  citeHighlight = false,
  linkHighlight = false,
  onFork,
  onReply,
  onRetryTurn,
  precedingUser,
  belowContent,
  artifacts,
  canRate = false,
  feedbackSentiment,
  feedbackComment,
}: ChatMessageProps) {
  const checkpoint = useTurnCheckpointActions({
    message,
    context: turnCheckpoint,
    sandboxRunning: sandboxRunning === true,
  });
  if (message.isSystemAlert) {
    return (
      <SystemAlertMessage
        content={message.content ?? ""}
        errorDetail={message.errorDetail}
        alertTone={message.alertTone}
        timestamp={message.timestamp}
      />
    );
  }

  const turnState = getAssistantTurnState(message);
  const copySource = turnCopySource(message.content, streamingContent);
  const copyPlain = copySource ? tokenizedToDisplayText(copySource) : undefined;
  const userActions = [
    turnState.isStreamingPlaceholder ? undefined : buildLinkAction(message._id),
    buildForkAction(onFork, message._id),
    turnState.isStreamingPlaceholder
      ? undefined
      : buildReplyAction(onReply, message._id),
  ].filter((action): action is ChatMessageActionItem => action !== undefined);
  const rowActions = [...userActions, ...checkpoint.items];
  const toolbarMode = assistantBubble;
  const toolbar =
    toolbarMode && !turnState.isStreamingPlaceholder ? (
      <MessageToolbar
        onReply={onReply ? () => onReply(message._id) : undefined}
        copyText={copyPlain}
        menuItems={rowActions.filter((action) => action.key !== "reply")}
        time={
          message.role === "assistant" && message.finishedAt
            ? `${formatClockTime(message.finishedAt)} · ${formatDuration(message.timestamp, message.finishedAt)}`
            : formatClockTime(message.timestamp)
        }
        rating={
          message.role === "assistant" && canRate
            ? {
                messageId: message._id,
                sentiment: feedbackSentiment,
                comment: feedbackComment,
              }
            : undefined
        }
      />
    ) : null;
  const threadControl =
    onReply && (message.replyCount ?? 0) > 0 ? (
      <ThreadSummary
        replyCount={message.replyCount ?? 0}
        replierIds={message.replierIds ?? []}
        onOpen={() => onReply(message._id)}
      />
    ) : null;
  const underLine =
    threadControl && (toolbarMode || !showTurnMeta) ? threadControl : null;

  return (
    <>
      <ChatMessageContextMenu content={copySource} extraItems={rowActions}>
        <m.div
          data-message-id={message._id}
          initial={animateIn ? { opacity: 0, y: 10 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={tokenTransition.fast}
          className={cn(
            citeHighlight && "rounded-md ring-2 ring-primary/50",
            linkHighlight && "rounded-md t-anchor-flash",
          )}
        >
          <AIMessage
            from={message.role}
            className={
              isOtherUser ? "ml-0 mr-auto justify-start gap-1.5" : undefined
            }
          >
            {message.role === "user" ? (
              <UserTurn
                message={message}
                repo={repo}
                isOtherUser={isOtherUser}
                senderFirstName={senderFirstName}
                joinsNext={joinsNext}
                isHandoffBoundary={isHandoffBoundary}
                belowContent={belowContent}
                artifacts={artifacts}
                showTurnMeta={showTurnMeta && !toolbarMode}
                copyPlain={copyPlain}
                userActions={userActions}
                threadControl={threadControl}
                toolbar={toolbar}
              />
            ) : (
              <AssistantTurn
                message={message}
                turnState={turnState}
                showTurnMeta={showTurnMeta && !toolbarMode}
                showScopeCheck={showScopeCheck}
                bubble={assistantBubble}
                joinsNext={joinsNext}
                senderName={senderFirstName}
                turnModel={turnModel}
                turnReasoningLevel={turnReasoningLevel}
                turnCredentialSourceLabel={turnCredentialSourceLabel}
                streamingActivity={streamingActivity}
                streamingContent={streamingContent}
                onOpenFile={onOpenFile}
                onViewDiff={onViewDiff}
                onOpenAgentsTab={onOpenAgentsTab}
                backgroundAgents={backgroundAgents}
                sandboxRunning={sandboxRunning}
                onRetryTurn={onRetryTurn}
                precedingUser={precedingUser}
                belowContent={belowContent}
                artifacts={artifacts}
                copyPlain={copyPlain}
                rowActions={rowActions}
                threadControl={threadControl}
                toolbar={toolbar}
                canRate={canRate}
                feedbackSentiment={feedbackSentiment}
                feedbackComment={feedbackComment}
              />
            )}
          </AIMessage>
          {underLine ? (
            <div
              className={cn(
                "mt-1 flex flex-wrap items-center gap-2",
                message.role === "user" && !isOtherUser
                  ? "justify-end"
                  : "justify-start pl-6",
              )}
            >
              {underLine}
            </div>
          ) : null}
        </m.div>
      </ChatMessageContextMenu>
      {checkpoint.dialogs}
    </>
  );
});

function turnCopySource(content: string, streamingContent?: string): string {
  return content.trim().length > 0 ? content : (streamingContent ?? "");
}

function buildForkAction(
  onFork: ChatMessageProps["onFork"],
  messageId: ChatBodyMessage["_id"],
): ChatMessageActionItem | undefined {
  return onFork
    ? {
        key: "fork",
        label: "Fork from here",
        icon: <IconGitFork className="size-4" />,
        onClick: () => onFork(messageId),
      }
    : undefined;
}

function buildReplyAction(
  onReply: ChatMessageProps["onReply"],
  messageId: ChatBodyMessage["_id"],
): ChatMessageActionItem | undefined {
  return onReply
    ? {
        key: "reply",
        label: "Reply in thread",
        icon: <IconMessages className="size-4" />,
        onClick: () => onReply(messageId),
      }
    : undefined;
}

function buildLinkAction(
  messageId: ChatBodyMessage["_id"],
): ChatMessageActionItem {
  return {
    key: "copy-link",
    label: "Copy link",
    icon: <IconLink className="size-4" />,
    onClick: () => copyMessageLink(messageId),
  };
}

function UserTurn({
  message,
  repo,
  isOtherUser,
  senderFirstName,
  joinsNext,
  isHandoffBoundary,
  belowContent,
  artifacts,
  showTurnMeta,
  copyPlain,
  userActions,
  threadControl,
  toolbar,
}: {
  threadControl: ReactNode;
  toolbar?: ReactNode;
  joinsNext: boolean;
  message: ChatBodyMessage;
  repo?: ChatRepo;
  isOtherUser: boolean;
  senderFirstName?: string;
  isHandoffBoundary: boolean;
  belowContent?: ReactNode;
  artifacts?: ReactNode;
  showTurnMeta: boolean;
  copyPlain?: string;
  userActions: ChatMessageActionItem[];
}) {
  const isOrchestratorNotification = message.orchestratorNotification === true;
  const sentViaMcp = message.sentViaOrchestrator === true;
  const orchestratorTag = isOrchestratorNotification
    ? "agent update"
    : sentViaMcp
      ? "via MCP"
      : undefined;

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5",
        isOtherUser ? "items-start" : "items-end",
      )}
    >
      {isOtherUser && senderFirstName ? (
        <span
          data-pii
          className={cn(
            "text-2xs font-medium text-muted-foreground",
            // Avatar (16) + gap (8) + bubble px-3 (12) → align with bubble text
            "pl-9",
          )}
        >
          {senderFirstName}
        </span>
      ) : null}
      {orchestratorTag ? (
        <span
          className={cn(
            "rounded-md bg-muted px-1.5 py-0.5 text-3xs font-medium leading-none text-muted-foreground",
            isOtherUser ? "ml-9" : undefined,
          )}
        >
          {orchestratorTag}
        </span>
      ) : null}
      <UserTurnBubble
        message={message}
        repo={repo}
        isOtherUser={isOtherUser}
        joinsNext={joinsNext}
        isMcpProvenance={isOrchestratorNotification || sentViaMcp}
        toolbar={toolbar}
      />
      {isHandoffBoundary && message.model !== undefined ? (
        <HandoffModelChip
          model={message.model}
          className={isOtherUser ? "ml-6" : undefined}
        />
      ) : null}
      {belowContent ? (
        <div className="mt-1 flex w-full flex-col gap-2">{belowContent}</div>
      ) : null}
      {artifacts ? (
        <div className="mt-1 flex w-full flex-col gap-2">{artifacts}</div>
      ) : null}
      {showTurnMeta ? (
        <UserMessageMeta
          align={isOtherUser ? "start" : "end"}
          copyPlain={copyPlain}
          actions={userActions}
          timestamp={message.timestamp}
          threadControl={threadControl}
          className={isOtherUser ? "pl-6" : undefined}
        />
      ) : null}
    </div>
  );
}

function UserTurnBubble({
  message,
  repo,
  isOtherUser,
  joinsNext,
  isMcpProvenance,
  toolbar,
}: {
  message: ChatBodyMessage;
  repo?: ChatRepo;
  isOtherUser: boolean;
  joinsNext: boolean;
  isMcpProvenance: boolean;
  /** The coordinator chat's floating toolbar, on the bubble's top-right. */
  toolbar?: ReactNode;
}) {
  // min-w-0 stops the default `min-width: auto` on this flex item from letting
  // one unbreakable token (a JWT, a long URL) stretch the bubble past the
  // message column.
  const bubble = (
    <div className="flex min-w-0 max-w-full items-end gap-2">
      {isOtherUser ? (
        <div className="size-4 shrink-0">
          {joinsNext ? null : <UserMessageAvatar userId={message.userId} />}
        </div>
      ) : null}
      <MessageContent
        className={cn(
          "group px-3 py-2 text-foreground",
          isOtherUser
            ? "bg-secondary group-[.is-user]:ml-0 group-[.is-user]:bg-secondary"
            : isMcpProvenance
              ? // Not typed in the Eva composer — drop it a tone
                // step off the accent bubble.
                "rounded-surface bg-muted group-[.is-user]:bg-muted"
              : "rounded-surface bg-primary/10 group-[.is-user]:bg-primary/10",
        )}
        style={
          isOtherUser ? { borderRadius: sideBubbleRadius(joinsNext) } : undefined
        }
      >
        <UserMessageBody message={message} repo={repo} />
      </MessageContent>
    </div>
  );
  return toolbar ? (
    <BubbleWithToolbar toolbar={toolbar} className={COORDINATOR_BUBBLE_MAX_WIDTH}>
      {bubble}
    </BubbleWithToolbar>
  ) : (
    bubble
  );
}

/** How wide a coordinator chat bubble may grow (Eva, you and teammates). */
const COORDINATOR_BUBBLE_MAX_WIDTH = "max-w-[70%]";

/**
 * The coordinator chat's bubble frame: the floating toolbar sits on its
 * top-right corner and carries the time (the footer row is gone there).
 */
function BubbleWithToolbar({
  toolbar,
  className = "max-w-full",
  children,
}: {
  toolbar: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      {children}
      {toolbar}
    </div>
  );
}

interface AssistantTurnProps {
  message: ChatBodyMessage;
  /** "Eva" over the first bubble of a run of her replies (the coordinator chat). */
  senderName?: string;
  turnState: ReturnType<typeof getAssistantTurnState>;
  showTurnMeta: boolean;
  showScopeCheck: boolean;
  bubble: boolean;
  joinsNext: boolean;
  turnModel?: string;
  turnReasoningLevel?: string;
  turnCredentialSourceLabel?: string;
  streamingActivity?: string;
  streamingContent?: string;
  onOpenFile?: (path: string) => void;
  onViewDiff?: (repoRelativePath?: string) => void;
  onOpenAgentsTab?: () => void;
  backgroundAgents?: ReadonlyArray<BackgroundAgentEntry>;
  sandboxRunning?: boolean;
  onRetryTurn?: ChatMessageProps["onRetryTurn"];
  precedingUser?: ChatMessageProps["precedingUser"];
  belowContent?: ReactNode;
  artifacts?: ReactNode;
  copyPlain?: string;
  rowActions: ChatMessageActionItem[];
  /** "N replies", always visible in the footer row. */
  threadControl: ReactNode;
  /** The coordinator chat's floating toolbar, on the bubble's top-right. */
  toolbar?: ReactNode;
  canRate: boolean;
  feedbackSentiment?: FeedbackSentiment;
  feedbackComment?: string;
}

function AssistantTurn({
  message,
  turnState,
  showTurnMeta,
  showScopeCheck,
  bubble,
  joinsNext,
  senderName,
  turnModel,
  turnReasoningLevel,
  turnCredentialSourceLabel,
  streamingActivity,
  streamingContent,
  onOpenFile,
  onViewDiff,
  onOpenAgentsTab,
  backgroundAgents,
  sandboxRunning,
  onRetryTurn,
  precedingUser,
  belowContent,
  artifacts,
  copyPlain,
  rowActions,
  threadControl,
  toolbar,
  canRate,
  feedbackSentiment,
  feedbackComment,
}: AssistantTurnProps) {
  const simpleView = useSimpleView();
  const turnErrorTitle = getTurnErrorTitle({
    errorType: message.errorType,
    turnModel,
    messageModel: message.model,
  });
  // A panel and the prose that introduced it are two renderings of one answer,
  // so the panel takes the slot and the prose moves behind a tab. Needs real
  // prose to switch to, and a failed turn shows its error notice instead.
  const panelTabs =
    belowContent !== undefined &&
    turnErrorTitle === null &&
    message.content.trim().length > 0;

  return (
    <>
      <AssistantTurnContent
        bubble={bubble}
        joinsNext={joinsNext}
        senderName={senderName}
        toolbar={toolbar}
        message={message}
        turnState={turnState}
        streamingActivity={streamingActivity}
        streamingContent={streamingContent}
        onOpenFile={onOpenFile}
        onOpenAgentsTab={onOpenAgentsTab}
        backgroundAgents={backgroundAgents}
        sandboxRunning={sandboxRunning}
        onRetryTurn={onRetryTurn}
        precedingUser={precedingUser}
        belowContent={belowContent}
        turnErrorTitle={turnErrorTitle}
        panelTabs={panelTabs}
      />
      <BubbleIndent bubble={bubble}>
        {artifacts ? (
          <div className="mt-1 flex flex-col gap-2">{artifacts}</div>
        ) : null}
        {/* Sits above `belowContent` so agent-composed panels keep
            their promised slot directly over the meta row. Shown in
            simple view too: the verdict is a safety signal, and simple
            view hiding it is exactly the reader who needs it. The hover card's per-hunk rows only
            link out when the diff surface exists — simple view bounces
            away from that tab, so they degrade to plain rows there. */}
        {showScopeCheck && message.scopeCheck ? (
          <div className="mt-1">
            <ScopeCheckChip
              check={message.scopeCheck}
              {...(!simpleView && onViewDiff ? { onViewDiff } : {})}
            />
          </div>
        ) : null}
        {/* Only the panels the tab strip did not claim — a still-
            streaming or failed turn has no prose to trade places with. */}
        {belowContent && !panelTabs ? (
          <div className="mt-2 flex flex-col gap-2">{belowContent}</div>
        ) : null}
        {showTurnMeta ? (
          <AssistantTurnMeta
            message={message}
            turnModel={turnModel}
            turnReasoningLevel={turnReasoningLevel}
            turnCredentialSourceLabel={turnCredentialSourceLabel}
            copyPlain={copyPlain}
            rowActions={rowActions}
            threadControl={threadControl}
            canRate={canRate && !turnState.isStreamingPlaceholder}
            feedbackSentiment={feedbackSentiment}
            feedbackComment={feedbackComment}
          />
        ) : null}
      </BubbleIndent>
    </>
  );
}

/** Lines the rows under a bubbled reply up with the bubble, past Eva's mark. */
function BubbleIndent({
  bubble,
  children,
}: {
  bubble: boolean;
  children: ReactNode;
}) {
  return bubble ? (
    <div className="flex flex-col pl-6">{children}</div>
  ) : (
    <>{children}</>
  );
}

/**
 * Streaming and settled bodies stay one ternary of fragments in one component
 * so the rows they share by position (sub-agent CTA, question cards) keep
 * their state when the turn settles.
 */
function AssistantTurnContent({
  message,
  turnState,
  streamingActivity,
  streamingContent,
  onOpenFile,
  onOpenAgentsTab,
  backgroundAgents,
  sandboxRunning,
  onRetryTurn,
  precedingUser,
  belowContent,
  turnErrorTitle,
  panelTabs,
  bubble,
  joinsNext,
  senderName,
  toolbar,
}: Omit<
  AssistantTurnProps,
  | "showTurnMeta"
  | "showScopeCheck"
  | "turnModel"
  | "turnReasoningLevel"
  | "turnCredentialSourceLabel"
  | "artifacts"
  | "copyPlain"
  | "rowActions"
  | "threadControl"
  | "canRate"
  | "feedbackSentiment"
  | "feedbackComment"
> & {
  turnErrorTitle: string | null;
  panelTabs: boolean;
}) {
  const simpleView = useSimpleView();
  const { isStreamingPlaceholder, questionSteps } = turnState;
  // While the turn is live the settled activityLog is not written yet, so the
  // just-answered question comes off the streaming payload instead — that is
  // what makes the record appear the moment the user submits.
  const streamingSteps = isStreamingPlaceholder
    ? (parseActivitySteps(streamingActivity) ?? [])
    : [];
  const streamingQuestionSteps = collectQuestionSteps(streamingSteps);
  // The timeline shows the live text between the steps, in order. Simple view
  // has no timeline, and older callbacks send no response steps, so the
  // joined text block stays for them.
  const streamingTextIsInline =
    !simpleView && streamingSteps.some((step) => step.type === "response");

  const mediaEntries = message.media ?? [];

  // Only surfaces with an Agents tab get the doorway to it.
  const agentSpawn = !onOpenAgentsTab
    ? null
    : deriveAgentSpawnSummary({
        activityLog: message.activityLog,
        streamingActivity,
        backgroundAgents,
        sandboxRunning,
      });
  const agentSpawnRow =
    agentSpawn && onOpenAgentsTab ? (
      <AgentSpawnCtaRow summary={agentSpawn} onOpen={onOpenAgentsTab} />
    ) : null;

  const content = (
    <MessageContent
      className={cn(
        "py-2",
        // The teammate bubble, mirrored onto Eva's side.
        // `group-[.is-assistant]:w-fit` outranks the kit's own
        // `group-[.is-assistant]:w-full`; a plain `w-fit` loses to it.
        bubble
          ? "min-w-0 bg-secondary px-3 text-foreground group-[.is-assistant]:w-fit"
          : "px-1",
      )}
      style={bubble ? { borderRadius: sideBubbleRadius(joinsNext) } : undefined}
    >
      {isStreamingPlaceholder && bubble ? (
        // The coordinator chats like a person: dots while it works, the steps
        // only on the finished message. A blocking question still shows.
        <>
          <EvaTypingLine />
          <AssistantQuestionCards steps={streamingQuestionSteps} />
        </>
      ) : isStreamingPlaceholder ? (
        <>
          <StreamingActivityDisplay
            activity={streamingActivity}
            name="Eva"
            startedAt={message.timestamp}
            onOpenFile={onOpenFile}
          />
          {agentSpawnRow}
          <AssistantQuestionCards steps={streamingQuestionSteps} />
          {streamingContent && !streamingTextIsInline ? (
            <div data-assistant-cite-source={message._id}>
              <Markdown
                className="mt-2"
                mode="streaming"
                components={CHAT_MARKDOWN_COMPONENTS}
              >
                {streamingContent}
              </Markdown>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {/* The coordinator chats like a person: its bubble is the reply
              only, with no "Worked for" steps. */}
          {message.activityLog && !bubble && (
            <ActivityLogDisplay
              activityLog={message.activityLog}
              messageId={message._id}
              name="Eva"
              icon={EVA_ICON}
              startedAt={message.timestamp}
              finishedAt={message.finishedAt}
              finalText={message.content}
              onOpenFile={onOpenFile}
            />
          )}
          {agentSpawnRow}
          <AssistantQuestionCards steps={questionSteps} />
          <AssistantTurnOutcome
            message={message}
            turnErrorTitle={turnErrorTitle}
            panelTabs={panelTabs}
            belowContent={belowContent}
            onRetryTurn={onRetryTurn}
            precedingUser={precedingUser}
          />
          <AgentMedia entries={mediaEntries} />
        </>
      )}
    </MessageContent>
  );

  return bubble ? (
    <div
      className={cn(
        "flex min-w-0 flex-col items-start gap-0.5",
        COORDINATOR_BUBBLE_MAX_WIDTH,
      )}
    >
      {senderName ? (
        // As a teammate's name: avatar (16) + gap (8) + bubble px-3 (12).
        <span className="pl-9 text-2xs font-medium text-muted-foreground">
          {senderName}
        </span>
      ) : null}
      <div className="flex min-w-0 max-w-full items-end gap-2">
        {/* The rail's Eva mark. */}
        <div className="size-4 shrink-0 text-foreground">
          {joinsNext ? null : <IconEva size={16} />}
        </div>
        {toolbar ? (
          <BubbleWithToolbar toolbar={toolbar}>{content}</BubbleWithToolbar>
        ) : (
          content
        )}
      </div>
    </div>
  ) : (
    content
  );
}

/** Settled reply: the error notice for a failed turn, else the prose (or panel tabs). */
function AssistantTurnOutcome({
  message,
  turnErrorTitle,
  panelTabs,
  belowContent,
  onRetryTurn,
  precedingUser,
}: {
  message: ChatBodyMessage;
  turnErrorTitle: string | null;
  panelTabs: boolean;
  belowContent?: ReactNode;
  onRetryTurn?: ChatMessageProps["onRetryTurn"];
  precedingUser?: ChatMessageProps["precedingUser"];
}) {
  /* wrap-anywhere: without it a long unbreakable token is silently clipped by
     MessageContent's overflow-hidden. */
  // Settled text: "static" skips Streamdown's streaming pass (repair of
  // unclosed syntax plus a post-mount transition re-render), which on a long
  // chat re-rendered every reply at once about two seconds after opening.
  const turnProse = (
    <Markdown mode="static" components={CHAT_MARKDOWN_COMPONENTS}>
      {message.content}
    </Markdown>
  );
  // Retrying means re-sending the prompt this turn answered, so it needs the
  // turn before it; a failure with nothing above it has nothing to repeat.
  const retryAction =
    onRetryTurn && precedingUser
      ? {
          label: "Retry",
          onClick: () =>
            onRetryTurn(
              precedingUser.content,
              precedingUser.attachmentStorageIds,
            ),
        }
      : null;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {turnErrorTitle !== null ? (
        <m.div
          key="turn-error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={tokenTransition.fast}
        >
          <TurnErrorNotice
            title={turnErrorTitle}
            detail={stripErrorPrefix(message.content)}
            {...(retryAction ? { action: retryAction } : {})}
          />
        </m.div>
      ) : (
        <m.div
          key="turn-content"
          data-assistant-cite-source={message._id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={tokenTransition.fast}
        >
          {panelTabs ? (
            <ChatUiPanelTabs panel={belowContent} text={turnProse} />
          ) : (
            turnProse
          )}
          {/* A stopped turn can hold no text at all; without this it reads as
              an empty reply rather than a turn that was cut short. */}
          {message.stopped ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <IconPlayerStop size={12} />
              Stopped
            </p>
          ) : null}
        </m.div>
      )}
    </AnimatePresence>
  );
}

function AssistantTurnMeta({
  message,
  turnModel,
  turnReasoningLevel,
  turnCredentialSourceLabel,
  copyPlain,
  rowActions,
  threadControl,
  canRate,
  feedbackSentiment,
  feedbackComment,
}: {
  message: ChatBodyMessage;
  turnModel?: string;
  turnReasoningLevel?: string;
  turnCredentialSourceLabel?: string;
  copyPlain?: string;
  rowActions: ChatMessageActionItem[];
  /** "N replies": always visible, while the rest of the row reveals on hover. */
  threadControl: ReactNode;
  /** False while the reply still streams: nothing to rate yet. */
  canRate: boolean;
  feedbackSentiment?: FeedbackSentiment;
  feedbackComment?: string;
}) {
  if (!(turnModel || copyPlain || rowActions.length > 0 || threadControl)) {
    return null;
  }
  return (
    <div className="mt-0.5 flex items-center gap-2">
      {threadControl}
      <div className="reveal-on-hover transition-opacity flex items-center gap-2">
        {turnModel ? (
          <MessageModelIcon
            model={turnModel}
            reasoningLevel={turnReasoningLevel}
            credentialSourceLabel={turnCredentialSourceLabel}
          />
        ) : null}
        {copyPlain || rowActions.length > 0 ? (
          <>
            <ChatMessageActions
              copyText={copyPlain}
              actions={rowActions}
              className="ml-0.5"
              revealOnHover={false}
            />
            {canRate ? (
              <TurnFeedbackActions
                messageId={message._id}
                sentiment={feedbackSentiment}
                comment={feedbackComment}
              />
            ) : null}
            {message.finishedAt && message.timestamp ? (
              <span className="text-2xs tabular-nums text-muted-foreground/60">
                {/* The turn's clock time is when Eva finished, not
                    when it started — the duration next to it already
                    says how long the reply took. */}
                {formatClockTime(message.finishedAt)} ·{" "}
                {formatDuration(message.timestamp, message.finishedAt)}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function UserMessageBody({
  message,
  repo,
}: {
  message: ChatBodyMessage;
  repo?: ChatRepo;
}) {
  return (
    <>
      <UserMessageAttachments attachments={messageAttachments(message)} />
      {message.content ? (
        <CollapsibleUserMessageBody text={message.content}>
          <ReviewCommentMessage text={message.content} repo={repo} />
        </CollapsibleUserMessageBody>
      ) : null}
    </>
  );
}

/**
 * Provider mark under the user turn that switched providers — the quiet twin of
 * the "Handed off from X to Y" alert row. Matches the `orchestratorTag` chip
 * above the bubble so both provenance tags read as one family.
 */
function HandoffModelChip({
  model,
  className,
}: {
  model: string;
  className?: string;
}) {
  const option = findAIModelOption(model);
  return (
    <m.span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-3xs font-medium leading-none text-muted-foreground",
        className,
      )}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tokenTransition.fast}
    >
      <ProviderIcon provider={option.provider} size={10} />
      {formatModelDisplayLabel(option.provider, option.label)}
    </m.span>
  );
}

function UserMessageMeta({
  align,
  copyPlain,
  actions = [],
  timestamp,
  threadControl,
  className,
}: {
  align: "start" | "end";
  copyPlain?: string;
  actions?: ChatMessageActionItem[];
  timestamp?: number;
  /** "N replies": always visible, while the rest of the row reveals on hover. */
  threadControl?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        align === "start" ? "justify-start" : "justify-end",
        className,
      )}
    >
      {threadControl}
      <div className="reveal-on-hover transition-opacity flex items-center gap-3">
        {copyPlain || actions.length > 0 ? (
          <ChatMessageActions
            copyText={copyPlain}
            actions={actions}
            revealOnHover={false}
          />
        ) : null}
        {timestamp ? (
          <span className="text-2xs text-muted-foreground/60">
            {formatClockTime(timestamp)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
