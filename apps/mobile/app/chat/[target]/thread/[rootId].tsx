import { api, DEFAULT_AI_MODEL } from "@eva/backend";
import { formatDuration } from "@eva/shared/duration";
import {
  chatStreamingEntityId,
  EVA_MENTION_ITEM,
  findStreamingTargetMessage,
  threadAnswerContent,
  threadPendingQuestion,
} from "@eva/shared";
import { formatQuestionAnswers, parsePendingQuestion } from "@eva/shared/pendingQuestion";
import { findNewMessageIds, useThreadReadState } from "@eva/shared/chatReadState";
import { ChoiceQuestion, MessageContent, PromptInput } from "@vvedantb/native-ui/ai";
import { RouterStackPageHeader } from "@vvedantb/native-ui/expo-router";
import { CenteredSpinner, EmptyState, KeyboardAvoidingView } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { IconMessages } from "@tabler/icons-react-native";
import { useMutation, useQuery } from "convex/react";
import { useIsFocused, useLocalSearchParams } from "expo-router";
import { Fragment, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AssistantMessage, LiveAssistantMessage } from "@/chat/AssistantMessage";
import { MentionMenu } from "@/chat/MentionMenu";
import { UserMessageText } from "@/chat/MentionChip";
import { EvaReply, TEAMMATE_SIDE, TeammateBubble, TeammateName } from "@/chat/TeammateTurn";
import { useMentionComposer } from "@/chat/useMentionComposer";
import { NewDivider } from "@/chat/DayDivider";
import { ThreadFollowButton } from "@/chat/ThreadFollowButton";
import { useAppActive } from "@/ui/appState";

/**
 * A reply thread in the project coordinator chat, as the web `ReplyThreadView`:
 * the message on top, its replies below in the chat's bubbles, and a composer
 * (people, data and @Eva). Pushed from "N replies" or the hold menu's Reply.
 */
export default function ReplyThreadScreen() {
  const { target, rootId } = useLocalSearchParams<{ target: string; rootId: string }>();
  const insets = useSafeAreaInsets();
  const chat = useQuery(api.chats.get, { target });
  const thread = useQuery(api.messages.listReplies, { rootId });
  const me = useQuery(api.auth.me, {});
  const users = useQuery(api.users.listAll, {});
  const addReply = useMutation(api.sessionWorkflow.addReply);
  const answerBlocking = useMutation(api.pendingQuestions.answer);
  // Eva's question from a turn in this thread is answered here, not in the chat (the web `ThreadDock`).
  const parentId = chat?.parentId;
  const threadTurn = useQuery(api.messages.openThreadTurn, parentId ? { parentId } : "skip");
  const isTurnThread = threadTurn?.rootId === rootId;
  const blocking = useQuery(api.pendingQuestions.getActive, parentId && isTurnThread ? { entityId: parentId } : "skip");
  const streaming = useQuery(
    api.streaming.get,
    parentId && isTurnThread ? { entityId: chatStreamingEntityId(parentId) } : "skip",
  );
  // The saved question just answered: hidden until Eva's reply moves on.
  const [answeredSaved, setAnsweredSaved] = useState<string | null>(null);
  const composer = useMentionComposer(chat?.repoId, undefined, undefined, [EVA_MENTION_ITEM]);
  const [sending, setSending] = useState(false);
  // Read while on screen (as the chat): a "New" line above the first reply you had not seen.
  const focused = useIsFocused();
  const appActive = useAppActive();
  const { state: readState, newSinceAt } = useThreadReadState({ rootId, active: focused && appActive });

  const header = (
    <RouterStackPageHeader
      title="Replies"
      fallbackHref={{ pathname: "/chat/[target]", params: { target } }}
      headerRight={<ThreadFollowButton rootId={rootId} state={readState} />}
    />
  );
  if (thread === undefined || chat === undefined) {
    return (
      <View className="flex-1">
        {header}
        <CenteredSpinner label="Loading thread" />
      </View>
    );
  }
  if (thread === null || chat === null) {
    return (
      <View className="flex-1">
        {header}
        <EmptyState icon={IconMessages} title="This message is gone." />
      </View>
    );
  }

  // Eva's turn in this thread streams on the chat's row, as a turn of the chat itself.
  const liveId = findStreamingTargetMessage(thread.replies)?._id;
  const firstNewId = findNewMessageIds(thread.replies, newSinceAt, me ?? undefined)[0];
  const streamingEntityId = chat.parentId ? chatStreamingEntityId(chat.parentId) : undefined;

  const blockingQuestions = blocking ? parsePendingQuestion(blocking.payload) : null;
  const savedRaw = threadPendingQuestion({
    isTurnThread,
    streamingQuestion: streaming?.pendingQuestion,
    replies: thread.replies,
  });
  const savedQuestions = savedRaw !== undefined && savedRaw !== answeredSaved ? parsePendingQuestion(savedRaw) : null;

  const send = (text: string) => {
    const content = composer.tokenize(text).trim();
    if (!content || sending) return;
    setSending(true);
    addReply({ rootId, content, model: chat.model ?? DEFAULT_AI_MODEL })
      .then(() => composer.setText(""))
      .catch(() => toast.error("Couldn't post the reply"))
      .finally(() => setSending(false));
  };

  // One row of the thread: Eva's bubble, yours, or a teammate's.
  const replyBubble = (message: (typeof thread.replies)[number]) => {
    if (message.role === "assistant") {
      return (
        // Full width, as in the main chat (#1538).
        <View>
          <EvaReply>
            {message._id === liveId && streamingEntityId ? (
              <LiveAssistantMessage streamingEntityId={streamingEntityId} messageId={message._id} />
            ) : (
              <AssistantMessage
                messageId={message._id}
                content={message.content}
                activityLog={message.activityLog}
                duration={message.finishedAt ? formatDuration(message.timestamp, message.finishedAt) : undefined}
                hideTrace
              />
            )}
          </EvaReply>
        </View>
      );
    }
    const mine = message.userId !== undefined && message.userId === me;
    if (mine) {
      return (
        <View className="self-end" style={{ maxWidth: "95%" }}>
          <MessageContent bubble="tint">
            <UserMessageText content={message.content} />
          </MessageContent>
        </View>
      );
    }
    const sender = users?.find((user) => user._id === message.userId);
    return (
      <View style={TEAMMATE_SIDE}>
        {sender?.firstName ? <TeammateName name={sender.firstName} /> : null}
        <TeammateBubble sender={sender} joinsNext={false}>
          <UserMessageText content={message.content} />
        </TeammateBubble>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }}>
      {header}
      <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 py-3">
        {[thread.root, ...thread.replies].map((message) => (
          <Fragment key={message._id}>
            {message._id === firstNewId ? <NewDivider /> : null}
            {replyBubble(message)}
          </Fragment>
        ))}
      </ScrollView>
      {/* The chat's question dock: a blocking question wins and resumes her turn; a saved one goes as an @Eva reply. */}
      {blocking && blockingQuestions ? (
        <View className="p-3" style={{ paddingBottom: insets.bottom + 12 }}>
          <ChoiceQuestion
            key={blocking.toolUseId}
            questions={blockingQuestions}
            buttonWeight="semibold"
            onSubmit={async (answers) => {
              if (!parentId) return;
              try {
                await answerBlocking({ entityId: parentId, toolUseId: blocking.toolUseId, answer: JSON.stringify(answers) });
              } catch {
                toast.error("Couldn't submit answer");
              }
            }}
          />
        </View>
      ) : savedRaw !== undefined && savedQuestions ? (
        <View className="p-3" style={{ paddingBottom: insets.bottom + 12 }}>
          <ChoiceQuestion
            key={savedRaw}
            questions={savedQuestions}
            buttonWeight="semibold"
            onSubmit={async (answers) => {
              setAnsweredSaved(savedRaw);
              try {
                await addReply({
                  rootId,
                  content: threadAnswerContent(formatQuestionAnswers(savedQuestions, answers)),
                  model: chat.model ?? DEFAULT_AI_MODEL,
                });
              } catch {
                setAnsweredSaved(null);
                toast.error("Couldn't send your answer");
              }
            }}
          />
        </View>
      ) : (
        <View className="px-3 pt-2" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
          <PromptInput
            layout="inline"
            shape="pill"
            disabled={sending}
            status={sending ? "submitted" : "ready"}
            value={composer.text}
            onChangeText={composer.setText}
            onSubmit={send}
            menu={composer.menu ? <MentionMenu menu={composer.menu} onPick={composer.pick} onDismiss={composer.dismiss} /> : null}
            placeholder="Reply…"
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
