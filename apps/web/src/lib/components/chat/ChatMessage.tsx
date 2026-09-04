import {
  cn,
  formatModelDisplayLabel,
  Message as AIMessage,
  MessageContent,
  MessageResponse,
  motionFast,
  ProviderIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@eva/ui";
import { memo } from "react";
import { m } from "motion/react";
import {
  AgentSpawnCtaRow,
  deriveAgentSpawnSummary,
} from "@/lib/components/chat/_components/AgentSpawnCtaRow";
import dayjs from "@eva/shared/dates";
import { formatDuration } from "@eva/shared/duration";
import {
  findAIModelOption,
  getReasoningLevelLabel,
  type BackgroundAgentEntry,
} from "@eva/backend";
import { VideoPreview } from "@/lib/components/MediaPreview";
import { ImageGalleryPreview } from "@/lib/components/MediaGallery";
import { ReviewCommentMessage } from "@/lib/components/chat/ReviewCommentMessage";
import { CollapsibleUserMessageBody } from "@/lib/components/chat/CollapsibleUserMessageBody";
import { ChatMessageActions } from "@/lib/components/chat/ChatMessageActions";
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
import { ChangedFilesCard } from "@/lib/components/chat/ChangedFilesCard";
import { EvaIcon } from "@/lib/components/EvaIcon";
import { UserMessageAvatar } from "@/lib/components/UserMessageAvatar";
import { tokenizedToDisplayText } from "@/lib/components/mentions";
import type { ChatBodyMessage } from "@/lib/components/chat/chatBodyUtils";
import {
  getAssistantTurnState,
  stripErrorPrefix,
} from "@/lib/components/chat/chatBodyUtils";
import { TurnErrorNotice } from "@/lib/components/chat/TurnErrorNotice";

const EVA_ICON = <EvaIcon />;

/** Squares the bottom-left corner against a teammate's side avatar. */
function otherUserBubbleRadius(): string {
  const r = "clamp(0.75rem, var(--radius), 1.25rem)";
  return `${r} ${r} ${r} 0`;
}

/** Provider mark under an assistant turn; tooltip lists model, effort, account. */
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
  repoBasePath: string;
  isLatestAssistantTurn: boolean;
  /** False in simple view, which hides diff surfaces entirely. */
  showChangedFiles?: boolean;
  changedFilesExpanded?: boolean;
  onChangedFilesExpandedChange: (messageId: string, expanded: boolean) => void;
  /** True when this user turn belongs to a teammate (left-aligned). */
  isOtherUser?: boolean;
  /** First name shown above teammate bubbles. */
  senderFirstName?: string;
  /** This user turn switches to a different model provider. */
  isHandoffBoundary?: boolean;
  /**
   * Preceding user turn's model snapshot — shown under the assistant reply
   * (model lives on the user message at send/dequeue time).
   */
  turnModel?: string;
  turnReasoningLevel?: string;
  /** "Team" or the selected userProviderAccounts label/first name. */
  turnCredentialSourceLabel?: string;
  streamingActivity?: string;
  streamingContent?: string;
  onOpenFile?: (path: string) => void;
  onViewDiff?: (repoRelativePath?: string) => void;
  /**
   * Opens the Agents sandbox tab. Undefined on surfaces without one (tasks,
   * projects), which also suppresses the sub-agent CTA row entirely.
   */
  onOpenAgentsTab?: () => void;
  /** Entity-wide sub-agent lifecycle entries; narrowed to this turn's spawns. */
  backgroundAgents?: ReadonlyArray<BackgroundAgentEntry>;
  sandboxRunning?: boolean;
  /**
   * Sessions only: enables "Diff this turn" / "Restore to before this turn"
   * on assistant turns that carry checkpoint shas.
   */
  turnCheckpoint?: TurnCheckpointContext;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  repoBasePath,
  isLatestAssistantTurn,
  showChangedFiles = true,
  changedFilesExpanded,
  onChangedFilesExpandedChange,
  isOtherUser = false,
  senderFirstName,
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
        timestamp={message.timestamp}
      />
    );
  }

  const { isStreamingPlaceholder, changedFiles } =
    getAssistantTurnState(message);

  const copySource =
    message.content.trim().length > 0
      ? message.content
      : (streamingContent ?? "");
  const copyPlain = copySource ? tokenizedToDisplayText(copySource) : undefined;

  // Two MCP provenances, never both on one row: a child chat shows the turns
  // posted from outside the composer, Eva shows the wake-ups its children fired.
  const isOrchestratorNotification = message.orchestratorNotification === true;
  const sentViaMcp = message.sentViaOrchestrator === true;
  const orchestratorTag = isOrchestratorNotification
    ? "agent update"
    : sentViaMcp
      ? "via MCP"
      : undefined;

  // Videos render as inline players; images collapse into one Twitter-style
  // grid + lightbox so a screenshot-heavy turn is not a long vertical stack.
  const mediaEntries = message.media ?? [];
  const videoMedia = mediaEntries.flatMap((entry) =>
    entry.url && entry.contentType?.startsWith("video/")
      ? [{ url: entry.url }]
      : [],
  );
  const imageMedia = mediaEntries.flatMap((entry) =>
    entry.url && !entry.contentType?.startsWith("video/")
      ? [{ url: entry.url }]
      : [],
  );

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

  return (
    <>
      <ChatMessageContextMenu
        content={copySource}
        extraItems={checkpoint.items}
      >
        <m.div
          data-message-id={message._id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionFast}
        >
          <AIMessage
            from={message.role}
            className={
              isOtherUser ? "ml-0 mr-auto justify-start gap-1.5" : undefined
            }
          >
            {message.role === "user" ? (
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
                      "text-[11px] font-medium text-muted-foreground",
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
                      "rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground",
                      isOtherUser ? "ml-9" : undefined,
                    )}
                  >
                    {orchestratorTag}
                  </span>
                ) : null}
                {/* min-w-0 stops the default `min-width: auto` on this flex item
                  from letting one unbreakable token (a JWT, a long URL) stretch
                  the bubble past the message column. */}
                <div className="flex min-w-0 max-w-full items-end gap-2">
                  {isOtherUser ? (
                    <div className="shrink-0">
                      <UserMessageAvatar userId={message.userId} />
                    </div>
                  ) : null}
                  <MessageContent
                    className={cn(
                      "group px-3 py-2 text-foreground",
                      isOtherUser
                        ? "bg-secondary group-[.is-user]:ml-0 group-[.is-user]:bg-secondary"
                        : isOrchestratorNotification || sentViaMcp
                          ? // Not typed in the Eva composer — drop it a tone
                            // step off the accent bubble.
                            "rounded-surface bg-muted group-[.is-user]:bg-muted"
                          : "rounded-surface bg-primary/10 group-[.is-user]:bg-primary/10",
                    )}
                    style={
                      isOtherUser
                        ? { borderRadius: otherUserBubbleRadius() }
                        : undefined
                    }
                  >
                    <UserMessageBody
                      message={message}
                      repoBasePath={repoBasePath}
                    />
                  </MessageContent>
                </div>
                {isHandoffBoundary && message.model !== undefined ? (
                  <HandoffModelChip
                    model={message.model}
                    className={isOtherUser ? "ml-6" : undefined}
                  />
                ) : null}
                <UserMessageMeta
                  align={isOtherUser ? "start" : "end"}
                  copyPlain={copyPlain}
                  timestamp={message.timestamp}
                  className={isOtherUser ? "pl-6" : undefined}
                />
              </div>
            ) : (
              <>
                <MessageContent className="px-1 py-2">
                  {isStreamingPlaceholder ? (
                    <>
                      <StreamingActivityDisplay
                        activity={streamingActivity}
                        name="Eva"
                        startedAt={message.timestamp}
                        onOpenFile={onOpenFile}
                      />
                      {agentSpawnRow}
                      {streamingContent ? (
                        <MessageResponse className="prose prose-sm dark:prose-invert max-w-none mt-2 wrap-anywhere">
                          {streamingContent}
                        </MessageResponse>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {message.activityLog && (
                        <ActivityLogDisplay
                          activityLog={message.activityLog}
                          name="Eva"
                          icon={EVA_ICON}
                          startedAt={message.timestamp}
                          finishedAt={message.finishedAt}
                          finalText={message.content}
                          onOpenFile={onOpenFile}
                        />
                      )}
                      {agentSpawnRow}
                      {message.errorType === "rate_limit" ? (
                        // A limit failure is not a reply: as markdown it read
                        // as Eva answering "Error: …" in body copy.
                        <TurnErrorNotice
                          title="Claude usage limit reached"
                          detail={stripErrorPrefix(message.content)}
                        />
                      ) : (
                        /* wrap-anywhere: without it a long unbreakable token is
                          silently clipped by MessageContent's overflow-hidden. */
                        <MessageResponse className="prose prose-sm dark:prose-invert max-w-none wrap-anywhere">
                          {message.content}
                        </MessageResponse>
                      )}
                      {showChangedFiles && changedFiles.length > 0 ? (
                        <ChangedFilesCard
                          files={changedFiles}
                          isLatestAssistantTurn={isLatestAssistantTurn}
                          expanded={changedFilesExpanded}
                          onExpandedChange={(nextExpanded) =>
                            onChangedFilesExpandedChange(
                              message._id,
                              nextExpanded,
                            )
                          }
                          onOpenFile={onOpenFile}
                          onViewDiff={onViewDiff}
                        />
                      ) : null}
                      {videoMedia.map((entry, index) => (
                        // Capped to the same width `ImageGalleryPreview` uses, so
                        // a video and a screenshot in the same reply line up
                        // instead of the video spanning the whole pane.
                        <VideoPreview
                          key={index}
                          url={entry.url}
                          className="max-w-lg"
                        />
                      ))}
                      {imageMedia.length > 0 ? (
                        <ImageGalleryPreview images={imageMedia} />
                      ) : null}
                    </>
                  )}
                </MessageContent>
                {turnModel || copyPlain || checkpoint.items.length > 0 ? (
                  <div className="reveal-on-hover transition-opacity mt-0.5 flex items-center gap-2">
                    {turnModel ? (
                      <MessageModelIcon
                        model={turnModel}
                        reasoningLevel={turnReasoningLevel}
                        credentialSourceLabel={turnCredentialSourceLabel}
                      />
                    ) : null}
                    {copyPlain || checkpoint.items.length > 0 ? (
                      <>
                        <ChatMessageActions
                          copyText={copyPlain}
                          actions={checkpoint.items}
                          className="ml-0.5"
                          revealOnHover={false}
                        />
                        {message.finishedAt && message.timestamp ? (
                          <span className="text-[11px] tabular-nums text-muted-foreground/60">
                            {dayjs(message.timestamp).format("h:mm A")} ·{" "}
                            {formatDuration(
                              message.timestamp,
                              message.finishedAt,
                            )}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </AIMessage>
        </m.div>
      </ChatMessageContextMenu>
      {checkpoint.dialogs}
    </>
  );
});

function UserMessageBody({
  message,
  repoBasePath,
}: {
  message: ChatBodyMessage;
  repoBasePath: string;
}) {
  return (
    <>
      <UserMessageAttachments
        attachments={
          message.attachments ??
          message.attachmentUrls?.map((url) => ({
            url,
            contentType: url ? "image/*" : null,
          }))
        }
      />
      {message.content ? (
        <CollapsibleUserMessageBody text={message.content}>
          <ReviewCommentMessage
            text={message.content}
            repoBasePath={repoBasePath}
          />
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
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground",
        className,
      )}
    >
      <ProviderIcon provider={option.provider} size={10} />
      {formatModelDisplayLabel(option.provider, option.label)}
    </span>
  );
}

function UserMessageMeta({
  align,
  copyPlain,
  timestamp,
  className,
}: {
  align: "start" | "end";
  copyPlain?: string;
  timestamp?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "reveal-on-hover transition-opacity flex items-center gap-3",
        align === "start" ? "justify-start" : "justify-end",
        className,
      )}
    >
      {copyPlain ? (
        <ChatMessageActions copyText={copyPlain} revealOnHover={false} />
      ) : null}
      {timestamp ? (
        <span className="text-[11px] text-muted-foreground/60">
          {dayjs(timestamp).format("h:mm A")}
        </span>
      ) : null}
    </div>
  );
}
