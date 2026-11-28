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
        rootId={message._id}
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
  toolbar?: ReactNode;
}) {
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
              ?
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

const COORDINATOR_BUBBLE_MAX_WIDTH = "max-w-[70%]";

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
  turnState: ReturnType<typeof getAssistantTurnState>;
  showTurnMeta: boolean;
  showScopeCheck: boolean;
  bubble: boolean;
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
  threadControl: ReactNode;
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
  const panelTabs =
    belowContent !== undefined &&
    turnErrorTitle === null &&
    message.content.trim().length > 0;

  return (
    <>
      <AssistantTurnContent
        bubble={bubble}
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
      {artifacts ? (
        <div className="mt-1 flex flex-col gap-2">{artifacts}</div>
      ) : null}
      {showScopeCheck && message.scopeCheck ? (
        <div className="mt-1">
          <ScopeCheckChip
            check={message.scopeCheck}
            {...(!simpleView && onViewDiff ? { onViewDiff } : {})}
          />
        </div>
      ) : null}
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
    </>
  );
}

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
  const streamingSteps = isStreamingPlaceholder
    ? (parseActivitySteps(streamingActivity) ?? [])
    : [];
  const streamingQuestionSteps = collectQuestionSteps(streamingSteps);
  const streamingTextIsInline =
    !simpleView && streamingSteps.some((step) => step.type === "response");

  const mediaEntries = message.media ?? [];

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
      className="px-1 py-2"
    >
      {isStreamingPlaceholder && bubble ? (
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
          {simpleView ? (
            <AssistantQuestionCards steps={streamingQuestionSteps} />
          ) : null}
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
          {message.activityLog && !bubble && (
            <ActivityLogDisplay
              activityLog={message.activityLog}
              messageId={message._id}
              name="Eva"
              icon={EVA_ICON}
              startedAt={message.timestamp}
              finishedAt={message.finishedAt}
              onOpenFile={onOpenFile}
            />
          )}
          {agentSpawnRow}
          {bubble || simpleView ? (
            <AssistantQuestionCards steps={questionSteps} />
          ) : null}
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
    <div className="w-full min-w-0">
      {toolbar ? (
        <BubbleWithToolbar toolbar={toolbar}>{content}</BubbleWithToolbar>
      ) : (
        content
      )}
    </div>
  ) : (
    content
  );
}

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
  const turnProse = (
    <Markdown mode="static" components={CHAT_MARKDOWN_COMPONENTS}>
      {message.content}
    </Markdown>
  );
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
  threadControl: ReactNode;
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
