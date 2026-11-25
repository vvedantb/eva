import { api, DEFAULT_AI_MODEL } from "@eva/backend";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { formatDuration } from "@eva/shared/duration";
import { EVA_MENTION_ITEM } from "@eva/shared";
import { MessageContent, PromptInput } from "@vvedantb/native-ui/ai";
import { RouterStackPageHeader } from "@vvedantb/native-ui/expo-router";
import { CenteredSpinner, EmptyState, KeyboardAvoidingView } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { IconMessages } from "@tabler/icons-react-native";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AssistantMessage } from "@/chat/AssistantMessage";
import { MentionMenu } from "@/chat/MentionMenu";
import { UserMessageText } from "@/chat/MentionChip";
import { EvaBubble, TEAMMATE_SIDE, TeammateBubble, TeammateName } from "@/chat/TeammateTurn";
import { useMentionComposer } from "@/chat/useMentionComposer";
import { useScheme } from "@/ui/theme";

/**
 * A reply thread in the project coordinator chat, as the web `ReplyThreadView`:
 * the message on top, its replies below in the chat's bubbles, and a composer
 * (people, data and @Eva). Pushed from "N replies" or the hold menu's Reply.
 */
export default function ReplyThreadScreen() {
  const { target, rootId } = useLocalSearchParams<{ target: string; rootId: string }>();
  const insets = useSafeAreaInsets();
  const theme = EVA_THEME[useScheme()];
  const chat = useQuery(api.chats.get, { target });
  const thread = useQuery(api.messages.listReplies, { rootId });
  const me = useQuery(api.auth.me, {});
  const users = useQuery(api.users.listAll, {});
  const addReply = useMutation(api.sessionWorkflow.addReply);
  const composer = useMentionComposer(chat?.repoId, undefined, undefined, [EVA_MENTION_ITEM]);
  const [sending, setSending] = useState(false);

  const header = (
    <RouterStackPageHeader title="Replies" fallbackHref={{ pathname: "/chat/[target]", params: { target } }} />
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

  const send = (text: string) => {
    const content = composer.tokenize(text).trim();
    if (!content || sending) return;
    setSending(true);
    addReply({ rootId, content, model: chat.model ?? DEFAULT_AI_MODEL })
      .then(() => composer.setText(""))
      .catch(() => toast.error("Couldn't post the reply"))
      .finally(() => setSending(false));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }}>
      {header}
      <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 py-3">
        {[thread.root, ...thread.replies].map((message) => {
          if (message.role === "assistant") {
            const live = message.finishedAt === undefined && message.content.trim() === "";
            return (
              <View key={message._id} style={TEAMMATE_SIDE}>
                <EvaBubble joinsNext={false}>
                  {live ? (
                    <Text className="font-instrument-sans text-sm" style={{ color: theme.mutedForeground }}>
                      Eva is typing…
                    </Text>
                  ) : (
                    <AssistantMessage
                      messageId={message._id}
                      content={message.content}
                      activityLog={message.activityLog}
                      duration={message.finishedAt ? formatDuration(message.timestamp, message.finishedAt) : undefined}
                      isLatestAssistantTurn={false}
                    />
                  )}
                </EvaBubble>
              </View>
            );
          }
          const mine = message.userId !== undefined && message.userId === me;
          if (mine) {
            return (
              <View key={message._id} className="self-end" style={{ maxWidth: "95%" }}>
                <MessageContent bubble="tint">
                  <UserMessageText content={message.content} />
                </MessageContent>
              </View>
            );
          }
          const sender = users?.find((user) => user._id === message.userId);
          return (
            <View key={message._id} style={TEAMMATE_SIDE}>
              {sender?.firstName ? <TeammateName name={sender.firstName} /> : null}
              <TeammateBubble sender={sender} joinsNext={false}>
                <UserMessageText content={message.content} />
              </TeammateBubble>
            </View>
          );
        })}
      </ScrollView>
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
    </KeyboardAvoidingView>
  );
}
