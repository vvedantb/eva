import { api, getAIModelProvider, normalizeAIModel } from "@eva/backend";
import { groupChatFeedback } from "@eva/shared/chatFeedback";
import { findDayBoundaryIds } from "@eva/shared/dayLabel";
import { formatDuration } from "@eva/shared/duration";
import {
  buildPrecedingUserTurns,
  collectForkPrefix,
  forkThreadTitle,
  formatForkPrompt,
  type SessionMenuAction,
  toRepoRelativePath,
} from "@eva/shared";
import { messageLinkHref } from "@eva/shared/messageLink";
import { parsePendingQuestion } from "@eva/shared/pendingQuestion";
import { IconChevronDown, IconMessageCircle, IconPlayerStopFilled } from "@tabler/icons-react-native";
import {
  Attachment,
  Attachments,
  ChoiceQuestion,
  Conversation,
  ConversationEmptyState,
  ConversationList,
  ConversationScrollButton,
  Message,
  MessageContent,
  PromptInput,
  PromptInputButton,
  Shimmer,
} from "@vvedantb/native-ui/ai";
import { goBackOrReplace, RouterStackPageHeader } from "@vvedantb/native-ui/expo-router";
import { Markdown } from "@vvedantb/native-ui/markdown";
import { CenteredSpinner, EmptyState, Text } from "@vvedantb/native-ui/primitives";
import { toast } from "@vvedantb/native-ui/toast";
import { useMutation, useQuery } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, View } from "react-native";
import { AssistantMessage } from "@/chat/AssistantMessage";
import { AttachButton } from "@/chat/AttachButton";
import { SandboxBranchChip } from "@/chat/BranchChips";
import { ComposerFooter, useSimpleView } from "@/chat/ComposerFooter";
import { ModelChip } from "@/chat/ModelChip";
import { ChatHeader } from "@/chat/ChatHeader";
import { DayDivider } from "@/chat/DayDivider";
import { MentionMenu } from "@/chat/MentionMenu";
import { MessageFooter } from "@/chat/MessageFooter";
import { useAttachments } from "@/chat/useAttachments";
import { useMentionComposer } from "@/chat/useMentionComposer";
import { WEB_URL } from "@/config";
import { useSessionActions } from "@/sessions/useSessionActions";
import { textColor, useScheme } from "@/ui/theme";

/** The session actions the chat header ⋯ adds; it has Copy link of its own. */
const HEADER_SESSION_ACTIONS: ReadonlySet<SessionMenuAction> = new Set(["rename", "archive", "unarchive"]);

/**
 * One chat (session, quick task or project): the transcript with the web
 * message actions, the agent's question when it asks one, and the composer
 * (attachments, Stop beside Send while the agent works, the web `@` / `/`
 * picker) with the web footer: the live sandbox branch, the stash and the
 * chat's sticky model. The transcript is a `ConversationList`, so a long chat
 * draws only the messages near the view. Back returns to where the chat was
 * opened from, or to the Inbox after a deep link.
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
  const feedbackRows = useQuery(api.feedback.listForChat, parentId ? { parentId } : "skip");
  const me = useQuery(api.auth.me, {});
  const send = useMutation(api.mobile.sendMessage);
  const stop = useMutation(api.mobile.stopTurn);
  const startSession = useMutation(api.mobile.startSession);
  const rate = useMutation(api.feedback.rateTurn);
  const answer = useMutation(api.pendingQuestions.answer);
  // A pick is the chat's sticky model, as the web; shown at once.
  const setChatModel = useMutation(api.mobile.setChatModel).withOptimisticUpdate((store, pick) => {
    const current = store.getQuery(api.mobile.getChat, { target });
    if (!current) return;
    store.setQuery(api.mobile.getChat, { target }, {
      ...current,
      model: pick.model ?? current.model,
      traits: {
        effortLevel: pick.reasoningLevel ?? current.traits.effortLevel,
        thinkingEnabled: pick.thinkingEnabled ?? current.traits.thinkingEnabled,
        use1mContext: pick.use1mContext ?? current.traits.use1mContext,
        fastMode: pick.fastMode ?? current.traits.fastMode,
      },
    });
  });
  const attachments = useAttachments();
  const simpleView = useSimpleView();
  // The `/` list follows the chat's model provider, as the web composer.
  const composer = useMentionComposer(chat?.repoId, chat ? getAIModelProvider(normalizeAIModel(chat.model)) : undefined);
  // The web leaves a session's page once it is archived; the phone goes back (to Sessions after a deep link).
  const sessionActions = useSessionActions({ onArchived: () => goBackOrReplace(router, "/sessions") });

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
  const visible = (messages ?? []).filter(
    (message) =>
      message.isSystemAlert !== true &&
      (message.content.trim() !== "" || (message.role === "assistant" && message.activityLog)),
  );
  const dayStarts = findDayBoundaryIds(visible);
  // The user turn before each reply holds the model it ran on (the footer mark), as the web.
  const precedingUserTurns = buildPrecedingUserTurns(messages ?? []);
  const questions = pending ? parsePendingQuestion(pending.payload) : null;
  const mine = groupChatFeedback(feedbackRows ?? [], me ?? undefined).mineByMessageId;
  const latestReplyId = visible.findLast((message) => message.role === "assistant")?._id;
  // A changed file opens the PR diff, as the web Review pane; simple view has no card, as the web.
  const openDiff = simpleView
    ? undefined
    : (path: string | undefined) =>
        router.push({ pathname: "/chat/[target]/diff", params: path ? { target, file: toRepoRelativePath(path) } : { target } });
  const webUrl = (path: string) => `${WEB_URL}${path}`;
  const sessionTarget = chat.session
    ? { sessionId: chat.session.id, title: chat.session.title, archived: chat.session.archived, webPath: chat.webPath }
    : null;

  const handleSend = (text: string) => {
    if (attachments.uploading) {
      toast.error("Wait for the attachments to upload");
      return;
    }
    const attachmentStorageIds = attachments.storageIds;
    attachments.clear();
    send({ target: chat.parentId, message: composer.tokenize(text), attachmentStorageIds }).catch(() => {
      toast.error("Couldn't send your message");
    });
  };

  const handlePick = (pick: Omit<Parameters<typeof setChatModel>[0], "target">) => {
    setChatModel({ target, ...pick }).catch(() => toast.error("Couldn't change the model"));
  };

  const handleStop = () => {
    stop({ target: chat.parentId }).catch(() => toast.error("Couldn't stop Eva"));
  };

  // Fork: a new session that starts from the transcript up to this message, as the web.
  const handleFork = async (messageId: string) => {
    const prefix = collectForkPrefix(
      visible.map((message) => ({ id: message._id, role: message.role, content: message.content, isSystemAlert: message.isSystemAlert })),
      messageId,
    );
    if (!prefix) return;
    try {
      const { sessionId } = await startSession({ repoId: chat.repoId, prompt: formatForkPrompt(prefix), title: forkThreadTitle(prefix) });
      router.push({ pathname: "/chat/[target]", params: { target: sessionId } });
    } catch {
      toast.error("Couldn't fork the chat");
    }
  };

  return (
    <View className="flex-1">
      <ChatHeader
        repoLabel={chat.repoLabel}
        title={chat.title}
        onBack={() => goBackOrReplace(router)}
        onOpenWeb={() => void Linking.openURL(webUrl(chat.webPath))}
        onCopyLink={() => void Clipboard.setStringAsync(webUrl(chat.webPath))}
        onStop={working ? handleStop : undefined}
        sessionMenu={
          sessionTarget
            ? {
                actions: sessionActions.actionsFor(sessionTarget).filter((action) => HEADER_SESSION_ACTIONS.has(action)),
                onSelect: (action) => sessionActions.run(action, sessionTarget),
              }
            : undefined
        }
      />
      {sessionActions.dialogs}
      <Conversation>
        {/* The web thread at 390: the panel (10 in on the left, 20 on the right) and the column's `p-3`, messages `gap-3`. */}
        <ConversationList
          data={visible}
          keyExtractor={(message) => message._id}
          // The web thread at 390: the panel (10 in on the left, 20 on the right) and the column's `p-3`.
          contentContainerClassName="pl-[22px] pr-8"
          // Web: messages `gap-3`.
          ItemSeparatorComponent={MessageGap}
          ListEmptyComponent={
            messages === undefined ? (
              <CenteredSpinner label="Loading messages" />
            ) : messages.length === 0 ? (
              <ConversationEmptyState icon={IconMessageCircle} title="No messages yet" />
            ) : null
          }
          ListFooterComponent={
            working && questions === null ? (
              <View className="pt-3">
                <Shimmer>Working…</Shimmer>
              </View>
            ) : null
          }
          renderItem={({ item: message }) => (
            <View className="gap-3">
              {dayStarts.has(message._id) ? <DayDivider timestamp={message.timestamp} /> : null}
              {/* Web: parts `gap-0.5`; a reply is full width, a user message at most 95%. */}
              <Message from={message.role} className={message.role === "user" ? "gap-0.5" : "max-w-full gap-0.5"}>
                {/* Eva's web chat tints the user bubble (bg-primary/10), not the solid default. A reply is `px-1 py-2`. */}
                <MessageContent bubble="tint" className={message.role === "user" ? undefined : "px-1 py-2"}>
                  {message.role === "user" ? (
                    // The web user text is markdown in `text-sm` (14 / 20).
                    <Markdown leading="normal">{message.content}</Markdown>
                  ) : (
                    <AssistantMessage
                      messageId={message._id}
                      content={message.content}
                      activityLog={message.activityLog}
                      duration={message.finishedAt ? formatDuration(message.timestamp, message.finishedAt) : undefined}
                      isLatestAssistantTurn={message._id === latestReplyId}
                      onOpenDiff={openDiff}
                    />
                  )}
                </MessageContent>
                {message.content.trim() !== "" ? (
                  <MessageFooter
                    text={message.content}
                    at={message.timestamp}
                    finishedAt={message.role === "assistant" ? message.finishedAt : undefined}
                    link={webUrl(messageLinkHref(chat.webPath, message._id))}
                    onFork={chat.kind === "session" ? () => void handleFork(message._id) : undefined}
                    turn={message.role === "assistant" ? precedingUserTurns.get(message._id) : undefined}
                    rating={
                      message.role === "assistant"
                        ? {
                            sentiment: mine.get(message._id)?.sentiment,
                            onRate: (sentiment) => {
                              rate({ messageId: message._id, sentiment }).catch(() => toast.error("Couldn't save your rating"));
                            },
                          }
                        : undefined
                    }
                  />
                ) : null}
              </Message>
            </View>
          )}
        />
        <ConversationScrollButton label="Scroll to end" icon={IconChevronDown} showLabel />
      </Conversation>
      {pending && questions ? (
        // The web dock: p-3 around the card, in place of the composer, and the thread's 10 more on the right.
        <View className="p-3 pr-[22px]">
          <ChoiceQuestion
            key={pending.toolUseId}
            questions={questions}
            buttonWeight="semibold"
            onSubmit={async (answers) => {
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
          <PromptInput
            layout="inline"
            shape="pill"
            value={composer.text}
            onChangeText={composer.setText}
            onSubmit={handleSend}
            menu={composer.menu ? <MentionMenu menu={composer.menu} onPick={composer.pick} /> : null}
            placeholder={working ? "Add a follow-up..." : "Ask Eva anything..."}
            leading={
              <AttachButton onPress={() => void attachments.pick()} />
            }
            header={
              attachments.items.length > 0 ? (
                <Attachments>
                  {attachments.items.map((item) => (
                    <Attachment key={item.id} data={item} onRemove={() => attachments.remove(item.id)} />
                  ))}
                </Attachments>
              ) : null
            }
            toolbar={working ? <PromptInputButton icon={IconPlayerStopFilled} label="Stop generating" onPress={handleStop} /> : null}
            footer={
              <ComposerFooter
                repoId={chat.repoId}
                onRestore={composer.restore}
                leading={
                  chat.sandboxBranch && !simpleView ? (
                    <SandboxBranchChip branch={chat.sandboxBranch} intendedBranch={chat.intendedBranch} />
                  ) : undefined
                }
                model={
                  // A quick task's web picker sets a model a phone reply does not use (`mobile.setChatModel`).
                  chat.kind === "task" ? undefined : (
                    <ModelChip
                      repoId={chat.repoId}
                      model={normalizeAIModel(chat.model)}
                      traits={chat.traits}
                      onModelChange={(model) => handlePick({ model })}
                      onTraitsChange={(partial) =>
                        handlePick({
                          reasoningLevel: partial.effortLevel,
                          thinkingEnabled: partial.thinkingEnabled,
                          use1mContext: partial.use1mContext,
                          fastMode: partial.fastMode,
                        })
                      }
                    />
                  )
                }
              />
            }
          />
        </View>
      ) : (
        <Text variant="muted" className="px-4 pb-8 pt-3 text-center" style={textColor(scheme, "muted")}>
          This chat is closed.
        </Text>
      )}
    </View>
  );
}

/** The web `gap-3` between two messages. */
function MessageGap() {
  return <View className="h-3" />;
}
