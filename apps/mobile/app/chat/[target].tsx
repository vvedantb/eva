import { api, DEFAULT_AI_MODEL } from "@eva/backend";
import { parsePendingQuestion } from "@eva/shared/pendingQuestion";
import { IconExternalLink, IconMessageCircle } from "@tabler/icons-react-native";
import {
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
import { CenteredSpinner, EmptyState, HeaderIconButton, Text } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, View } from "react-native";
import { AssistantMessage } from "@/chat/AssistantMessage";
import { QuestionDock } from "@/chat/QuestionDock";
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
  const messages = useQuery(api.messages.listByParent, parentId ? { parentId } : "skip");
  const turn = useQuery(api.turns.getChatStatus, parentId ? { entityId: parentId } : "skip");
  const pending = useQuery(api.pendingQuestions.getActive, parentId ? { entityId: parentId } : "skip");
  const enqueue = useMutation(api.sessionWorkflow.enqueueMessage);
  const answer = useMutation(api.pendingQuestions.answer);

  if (chat === undefined) return <CenteredSpinner label="Loading chat" />;
  if (chat === null) {
    return (
      <View className="flex-1">
        <StackPageHeader title="Chat" onBack={() => router.back()} />
        <EmptyState icon={IconMessageCircle} title="Chat not found" description="It was deleted, or you no longer have access." />
      </View>
    );
  }

  const working = turn !== undefined && turn !== null;
  const questions = pending ? parsePendingQuestion(pending.payload) : null;
  const replyChatId = chat.replyChatId;

  const handleSend = (text: string) => {
    if (!replyChatId) return;
    enqueue({ chatId: replyChatId, message: text, model: chat.model ?? DEFAULT_AI_MODEL }).catch(() => {
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
          <HeaderIconButton label="Open on web" onPress={() => void Linking.openURL(`${WEB_URL}${chat.webPath}`)}>
            <IconExternalLink size={20} color={textColor(scheme).color} />
          </HeaderIconButton>
        }
      />
      <Conversation>
        <ConversationContent>
          {messages === undefined ? (
            <CenteredSpinner label="Loading messages" />
          ) : messages.length === 0 ? (
            <ConversationEmptyState icon={IconMessageCircle} title="No messages yet" />
          ) : (
            messages
              .filter(
                (message) =>
                  message.isSystemAlert !== true &&
                  (message.content.trim() !== "" || (message.role === "assistant" && message.activityLog)),
              )
              .map((message) => (
                <Message key={message._id} from={message.role}>
                  <MessageContent>
                    {message.role === "user" ? (
                      message.content
                    ) : (
                      <AssistantMessage content={message.content} activityLog={message.activityLog} />
                    )}
                  </MessageContent>
                </Message>
              ))
          )}
          {working && questions === null ? <Shimmer>Working…</Shimmer> : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {pending && questions ? (
        <QuestionDock
          key={pending.toolUseId}
          questions={questions}
          onSubmit={async (answers) => {
            try {
              await answer({ entityId: chat.parentId, toolUseId: pending.toolUseId, answer: JSON.stringify(answers) });
            } catch {
              toast.error("Couldn't submit answer");
            }
          }}
        />
      ) : replyChatId ? (
        // Always "ready": a send during a turn queues behind it, as on the web.
        <PromptInput onSubmit={handleSend} placeholder={working ? "Add a follow-up..." : "Message Eva"} />
      ) : (
        <Text variant="muted" className="px-4 pb-8 pt-3 text-center" style={textColor(scheme, "muted")}>
          Reply to this chat on the web.
        </Text>
      )}
    </View>
  );
}
