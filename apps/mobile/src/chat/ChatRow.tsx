import type { api } from "@eva/backend";
import { messageAttachments, type ResolvedMediaEntry } from "@eva/shared";
import { formatDuration } from "@eva/shared/duration";
import { Message, MessageContent } from "@vvedantb/native-ui/ai";
import type { FunctionReturnType } from "convex/server";
import { memo } from "react";
import { View } from "react-native";
import { AssistantMessage, LiveAssistantMessage } from "./AssistantMessage";
import { InlineCards, TurnOutputs, type InlineCard, type TurnOutput } from "./cards/ChatCards";
import { DayDivider } from "./DayDivider";
import { UserAttachments } from "./media/UserAttachments";
import { UserMessageText } from "./MentionChip";
import { MessageFooter, type Sentiment } from "./MessageFooter";
import { TEAMMATE_FOOTER_INSET, TEAMMATE_SIDE, TeammateBubble, TeammateName } from "./TeammateTurn";

/**
 * A transcript message as `messages.listByParent` returns it. The query's
 * validator adds the resolved captures and attachments, which its handler's
 * inferred type drops, so they are named here as the web `ChatBodyMessage` does.
 */
export type ChatMessageRow = FunctionReturnType<typeof api.messages.listByParent>[number] & {
  media?: ResolvedMediaEntry[];
  attachments?: ResolvedMediaEntry[];
  attachmentUrls?: Array<string | null>;
};

export type ChatRowProps = {
  message: ChatMessageRow;
  /** The first message of its day: the day divider goes above it. */
  dayStart: boolean;
  /** A teammate's turn: on the left with their avatar and first name, as the web. */
  fromTeammate: boolean;
  senderName?: string;
  sender?: { firstName?: string; lastName?: string; fullName?: string };
  /** Set on the reply of the running turn: it draws from this streaming row. */
  liveStreamingEntityId?: string;
  isLatestReply: boolean;
  onOpenDiff?: (path: string | undefined) => void;
  /** The message's web permalink. */
  link: string;
  onFork?: (messageId: string) => void;
  /** Agent replies: the user turn before it, which holds the model it ran on. */
  turn?: { model?: string; reasoningLevel?: string; credentialSourceLabel?: string };
  sentiment?: Sentiment;
  onRate: (messageId: ChatMessageRow["_id"], sentiment: Sentiment | null) => void;
  /** The agent's cards placed under this message (`render_ui`, `render_html`). */
  cards?: readonly InlineCard[];
  /** The artifacts and reports placed under this message. */
  outputs?: readonly TurnOutput[];
  /** Sends a panel button's text; undefined disables the buttons. */
  onPanelReply?: (message: string) => void;
  onOpenWebChat: () => void;
};

/**
 * One transcript row, as the web `ChatMessage`: the day divider, then the
 * user bubble (attachments above the text) or the agent reply (trace, prose,
 * changed files, captures), its artifacts and reports, its agent-composed
 * cards (behind the reply's "UI" tab when it has prose, as the web), and the
 * footer. Memoised: the screen's other queries (the turn status, the open
 * question) redraw the list, and a row redraws only when its own props change.
 */
export const ChatRow = memo(function ChatRow({
  message,
  dayStart,
  fromTeammate,
  senderName,
  sender,
  liveStreamingEntityId,
  isLatestReply,
  onOpenDiff,
  link,
  onFork,
  turn,
  sentiment,
  onRate,
  cards,
  outputs,
  onPanelReply,
  onOpenWebChat,
}: ChatRowProps) {
  const isUser = message.role === "user";
  const isReply = message.role === "assistant";
  const attachments = isUser ? messageAttachments(message) : [];
  const cardList =
    cards && cards.length > 0 ? (
      <InlineCards cards={cards} rowKey={message._id} onReply={onPanelReply} onOpenWebChat={onOpenWebChat} />
    ) : null;
  // The web `panelTabs`: a settled reply with prose trades places with its cards.
  const tabbed = !isUser && cardList !== null && liveStreamingEntityId === undefined && message.content.trim() !== "";
  const outputList = outputs && outputs.length > 0 ? <TurnOutputs outputs={outputs} /> : null;
  const userBody = (
    <>
      <UserAttachments attachments={attachments} />
      {message.content ? <UserMessageText content={message.content} /> : null}
    </>
  );

  return (
    <View className="gap-3 pl-[22px] pr-8">
      {dayStart ? <DayDivider timestamp={message.timestamp} /> : null}
      {/* Web: parts `gap-0.5`; a reply is full width, a user message at most 95%. */}
      <Message from={message.role} className={isUser ? "gap-0.5" : "max-w-full gap-0.5"} style={fromTeammate ? TEAMMATE_SIDE : undefined}>
        {senderName ? <TeammateName name={senderName} /> : null}
        {fromTeammate ? (
          <TeammateBubble sender={sender}>{userBody}</TeammateBubble>
        ) : (
          // Eva's web chat tints the user bubble (bg-primary/10), not the solid default. A reply is `px-1 py-2`.
          <MessageContent bubble="tint" className={isUser ? undefined : "px-1 py-2"}>
            {isUser ? (
              // The web user text is markdown in `text-sm` (14 / 20), its tokens as chips.
              userBody
            ) : liveStreamingEntityId ? (
              <LiveAssistantMessage streamingEntityId={liveStreamingEntityId} messageId={message._id} />
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
            finishedAt={isReply ? message.finishedAt : undefined}
            link={link}
            onFork={onFork ? () => onFork(message._id) : undefined}
            turn={isReply ? turn : undefined}
            rating={isReply ? { sentiment, onRate: (next) => onRate(message._id, next) } : undefined}
          />
        ) : null}
      </Message>
    </View>
  );
});
