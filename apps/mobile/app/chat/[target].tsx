import { api, DEFAULT_AI_MODEL } from "@eva/backend";
import { parsePendingQuestion } from "@eva/shared/pendingQuestion";
import {
  IconExternalLink,
  IconMessageCircle,
} from "@tabler/icons-react-native";
import {
  ChoiceQuestion,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
  Message,
  MessageContent,
  PromptInput,
  Shimmer,
} from "@vvedantb/native-ui/ai";
import { StackPageHeader } from "@vvedantb/native-ui/layout";
import {
  CenteredSpinner,
  EmptyState,
  HeaderIconButton,
  Text,
} from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Fragment } from "react";
import { Linking, View } from "react-native";
import { findDayBoundaryIds } from "@eva/shared/dayLabel";
import { AssistantMessage } from "@/chat/AssistantMessage";
import { DayDivider } from "@/chat/DayDivider";
import { MessageFooter } from "@/chat/MessageFooter";
import { WEB_URL } from "@/config";
import { textColor, useScheme } from "@/ui/theme";

/**
 * One chat: transcript, the agent's question when it asks one, and a reply
 * box for session chats. Quick tasks and projects are read-only in v1: their
 * idle send path is not a plain enqueue, so "Open on web" covers replies.
 */
export default function ChatScreen() {
  const { target } = useLocalSearchParams<{ target: string }>();
  const router = useRouter();
  const scheme = useScheme();
  const chat = useQuery(api.mobile.getChat, { target });
  const parentId = chat?.parentId;
  const messages = useQuery(
    api.messages.listByParent,
    parentId ? { parentId } : "skip",
  );
  const turn = useQuery(
    api.turns.getChatStatus,
    parentId ? { entityId: parentId } : "skip",
  );
  const pending = useQuery(
    api.pendingQuestions.getActive,
    parentId ? { entityId: parentId } : "skip",
  );
  const enqueue = useMutation(api.sessionWorkflow.enqueueMessage);
  const answer = useMutation(api.pendingQuestions.answer);

  if (chat === undefined) return <CenteredSpinner label="Loading chat" />;
  if (chat === null) {
    return (
      <View className="flex-1">
        <StackPageHeader title="Chat" onBack={() => router.back()} />
        <EmptyState
          icon={IconMessageCircle}
          title="Chat not found"
          description="It was deleted, or you no longer have access."
        />
      </View>
    );
  }

  const working = turn !== undefined && turn !== null;
  const visible = (messages ?? []).filter(
    (message) =>
      message.isSystemAlert !== true &&
      (message.content.trim() !== "" ||
        (message.role === "assistant" && message.activityLog)),
  );
  const dayStarts = findDayBoundaryIds(visible);
  const questions = pending ? parsePendingQuestion(pending.payload) : null;
  const replyChatId = chat.replyChatId;

  const handleSend = (text: string) => {
    if (!replyChatId) return;
    enqueue({
      chatId: replyChatId,
      message: text,
      model: chat.model ?? DEFAULT_AI_MODEL,
    }).catch(() => {
      toast.error("Couldn't send your message");
    });
  };

  return (
    <View className="flex-1">
      <StackPageHeader
        title={chat.title}
        description={chat.repoLabel}
        onBack={() => router.back()}
        headerRight={
          <HeaderIconButton
            label="Open on web"
            onPress={() => void Linking.openURL(`${WEB_URL}${chat.webPath}`)}
          >
            <IconExternalLink size={20} color={textColor(scheme).color} />
          </HeaderIconButton>
        }
      />
      <Conversation>
        <ConversationContent>
          {messages === undefined ? (
            <CenteredSpinner label="Loading messages" />
          ) : messages.length === 0 ? (
            <ConversationEmptyState
              icon={IconMessageCircle}
              title="No messages yet"
            />
          ) : (
            visible.map((message) => (
              <Fragment key={message._id}>
                {dayStarts.has(message._id) ? (
                  <DayDivider timestamp={message.timestamp} />
                ) : null}
                <Message from={message.role}>
                  {/* Eva's web chat tints the user bubble (bg-primary/10), not the solid default. */}
                  <MessageContent bubble="tint">
                    {message.role === "user" ? (
                      message.content
                    ) : (
                      <AssistantMessage
                        messageId={message._id}
                        content={message.content}
                        activityLog={message.activityLog}
                        seconds={
                          message.finishedAt
                            ? (message.finishedAt - message.timestamp) / 1000
                            : undefined
                        }
                      />
                    )}
                  </MessageContent>
                  {message.content.trim() !== "" ? (
                    <MessageFooter
                      text={message.content}
                      at={message.timestamp}
                      finishedAt={
                        message.role === "assistant"
                          ? message.finishedAt
                          : undefined
                      }
                    />
                  ) : null}
                </Message>
              </Fragment>
            ))
          )}
          {working && questions === null ? <Shimmer>Working…</Shimmer> : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {pending && questions ? (
        // The web dock: p-3 around the card, in place of the composer.
        <View className="p-3">
          <ChoiceQuestion
            key={pending.toolUseId}
            questions={questions}
            onSubmit={async (answers) => {
              try {
                await answer({
                  entityId: chat.parentId,
                  toolUseId: pending.toolUseId,
                  answer: JSON.stringify(answers),
                });
              } catch {
                toast.error("Couldn't submit answer");
              }
            }}
          />
        </View>
      ) : replyChatId ? (
        // Always "ready": a send during a turn queues behind it, as on the web.
        <PromptInput
          // Eva's web composer is the one-row pill (`Composer layout="inline"`).
          layout="inline"
          onSubmit={handleSend}
          placeholder={working ? "Add a follow-up..." : "Ask Eva anything..."}
        />
      ) : (
        <Text
          variant="muted"
          className="px-4 pb-8 pt-3 text-center"
          style={textColor(scheme, "muted")}
        >
          Reply to this chat on the web.
        </Text>
      )}
    </View>
  );
}
