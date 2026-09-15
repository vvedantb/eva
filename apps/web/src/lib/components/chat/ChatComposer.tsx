import {
  motionBase,
  PromptInputProvider,
  toast,
  type ModelAccount,
  type ModelOption,
  type PromptInputMessage,
} from "@eva/ui";
import { useUploadChatAttachments } from "@/lib/components/chat/imageAttachments";
import { ChatDraftSync } from "@/lib/components/chat/ChatDraftSync";
import { LocalChatDraftSync } from "@/lib/components/chat/LocalChatDraftSync";
import type { ChatDraftSeed } from "@/lib/components/chat/useChatDraftSeed";
import { ChatTypeToFocus } from "@/lib/components/chat/ChatTypeToFocus";
import { ChatTypingLayer } from "@/lib/components/chat/ChatTypingLayer";
import { ComposerInputChrome } from "@/lib/components/chat/_components/ComposerInputChrome";
import { ComposerStash } from "@/lib/components/chat/_components/ComposerStash";
import { ModelSelectWithTraits } from "@/lib/components/ModelSelectWithTraits";
import { usePeopleMentionItems } from "@/lib/hooks/usePeopleMentionItems";
import { useDataMentionItems } from "@/lib/hooks/useDataMentionItems";
import {
  mergeMentionItems,
  tokenizedToEditable,
} from "@/lib/components/mentions";
import { useRef, type ReactNode } from "react";
import { m, AnimatePresence } from "motion/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  api,
  getAIModelProvider,
  type AIModel,
  type Id,
  type ReasoningLevel,
  type StoredModelTraits,
} from "@eva/backend";
import { MessageMentionText } from "@/lib/components/chat/MessageMentionText";
import { stripReviewCommentBlocks } from "@/lib/reviewComments";
import { type MentionTextareaHandle } from "@/lib/components/chat/MentionTextarea";
import { useSkillSlashItems } from "@/lib/hooks/useSkillSlashItems";
import { QueuedMessagesPanel } from "@/lib/components/QueuedMessagesPanel";
import {
  composerTaskStepsFromActivity,
  ComposerTasksPanel,
} from "@/lib/components/chat/_components/ComposerTasksPanel";
import type { ChatBodyQueuedMessage } from "@/lib/components/chat/chatBodyUtils";
import { useQueuedMessageMutations } from "@/lib/components/chat/useQueuedMessageMutations";

/** localStorage-backed draft seed (no Convex row yet — e.g. new session). */
type LocalChatDraft = {
  initialDisplay: string;
  mentionMap: Map<string, string>;
  skillMap: Map<string, string>;
  onSave: (tokenized: string) => void;
};

interface ChatComposerProps {
  repoId: Id<"githubRepos">;
  repoBasePath: string;
  conversationId: string;
  queuedMessages: ChatBodyQueuedMessage[];
  messageHistory: string[];
  isExecuting: boolean;
  isInputDisabled: boolean;
  placeholder: string;
  model: AIModel;
  setModel: (model: AIModel) => void;
  modelOptions: ReadonlyArray<ModelOption<AIModel>>;
  accounts?: ReadonlyArray<ModelAccount>;
  accountId?: string | null;
  onAccountChange?: (accountId: string | null) => void;
  displayTraits?: {
    effortLevel: ReasoningLevel | undefined;
    thinkingEnabled: boolean;
    use1mContext: boolean;
    fastMode: boolean;
  };
  onTraitsChange?: (partial: Partial<StoredModelTraits>) => void;
  onSend: (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
  ) => Promise<void>;
  onCancel: () => Promise<void>;
  beforeQueuedContent?: React.ReactNode;
  preInputContent?: React.ReactNode;
  /** Live turn activity JSON — its todo snapshot feeds the Tasks panel. */
  streamingActivity?: string;
  /** Message id of the streaming turn; scopes Tasks-panel dismissal to it. */
  streamingTurnId?: string;
  /**
   * Optional left-side control on the under-input bar (e.g. base branch).
   * The bar itself always renders so the model picker has a home on every
   * composer surface; this slot is only the extra leading control.
   */
  underCardLeading?: React.ReactNode;
  draft?: ChatDraftSeed;
  /** Persist draft in localStorage when no Convex conversation exists yet. */
  localDraft?: LocalChatDraft;
  isDraftLoading?: boolean;
  hasPendingContext?: boolean;
  allowEmptySubmit?: boolean;
}

export function ChatComposer({
  repoId,
  repoBasePath,
  conversationId,
  queuedMessages,
  messageHistory,
  isExecuting,
  isInputDisabled,
  placeholder,
  model,
  setModel,
  modelOptions,
  accounts,
  accountId,
  onAccountChange,
  displayTraits,
  onTraitsChange,
  onSend,
  onCancel,
  beforeQueuedContent,
  preInputContent,
  streamingActivity,
  streamingTurnId,
  underCardLeading,
  draft,
  localDraft,
  isDraftLoading,
  hasPendingContext = false,
  allowEmptySubmit = false,
}: ChatComposerProps) {
  const skillItems = useSkillSlashItems(repoId, getAIModelProvider(model));
  const dataMentions = useDataMentionItems(repoId);
  const peopleMentions = usePeopleMentionItems(repoId);
  const { items: plusDataItems } = mergeMentionItems(
    peopleMentions,
    dataMentions,
  );
  const currentUserId = useQuery(api.auth.me);
  const mentionRef = useRef<MentionTextareaHandle>(null);
  const uploadChatAttachments = useUploadChatAttachments();
  const { updateQueuedMessage, deleteQueuedMessage, reorderQueuedMessages } =
    useQueuedMessageMutations(queuedMessages);
  // Convex draft wins when both are passed (existing sessions).
  const seed = draft ?? localDraft;

  const handleSubmit = async (
    text: string,
    files: PromptInputMessage["files"],
  ) => {
    const visible = text.trim();
    const attachmentStorageIds = await uploadChatAttachments(files);
    if (files.length > 0 && attachmentStorageIds.length < files.length) {
      toast.error("Some attachments could not be uploaded.");
    }
    if (
      !visible &&
      attachmentStorageIds.length === 0 &&
      !hasPendingContext &&
      !allowEmptySubmit
    ) {
      return;
    }
    const content = mentionRef.current?.tokenize(visible) ?? visible;
    await onSend(
      content,
      attachmentStorageIds.length > 0 ? attachmentStorageIds : undefined,
    );
  };

  const handlePromptSubmit = async ({ text, files }: PromptInputMessage) => {
    if (isInputDisabled) return;
    await handleSubmit(text, files);
  };

  const queuedMessageItems = queuedMessages.map((message) => ({
    id: message._id,
    content: message.displayContent ?? message.content,
    model: message.model,
    reasoningLevel: message.reasoningLevel,
    userId: message.userId,
  }));

  const mutedBar = (stashButton: ReactNode) => (
    <div className="mx-auto flex w-[calc(100%-1.5rem)] md:w-[calc(100%-2rem)] items-center gap-0.5 rounded-b-surface bg-muted/70 px-2 py-0.5">
      {/* On a phone the bar is ~340px wide and the model name is long, so a
          `shrink-0` picker left the leading control (the base branch) one
          letter. Both sides give width there: the leading control takes a share
          of the free space, the picker shrinks and truncates. Desktop keeps the
          picker at its natural width. */}
      {underCardLeading ? (
        <div className="min-w-0 max-sm:flex-1 max-sm:basis-0">
          {underCardLeading}
        </div>
      ) : null}
      {stashButton}
      <div className="ml-auto min-w-0 max-sm:shrink sm:shrink-0">
        <ModelSelectWithTraits
          value={model}
          options={modelOptions}
          onValueChange={setModel}
          accounts={accounts}
          accountId={accountId}
          onAccountChange={onAccountChange}
          traits={displayTraits}
          onTraitsChange={onTraitsChange}
          className="h-7 w-auto max-w-full justify-start border-0 bg-transparent px-2 text-xs font-normal text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
        />
      </div>
    </div>
  );

  return (
    <div className="p-3 md:p-4 max-w-3xl mx-auto w-full">
      <AnimatePresence initial={false}>
        {beforeQueuedContent ? (
          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={motionBase}
          >
            {beforeQueuedContent}
          </m.div>
        ) : null}
      </AnimatePresence>
      {preInputContent}
      {isDraftLoading ? (
        <>
          <div
            aria-busy="true"
            aria-label="Loading draft..."
            className="pointer-events-none rounded-full bg-background opacity-50 min-h-12"
          />
          {mutedBar(null)}
        </>
      ) : (
        <PromptInputProvider initialInput={seed?.initialDisplay}>
          <ChatTypingLayer
            roomId={`typing:chat:${conversationId}`}
            userId={currentUserId}
          />
          <ChatTypeToFocus mentionRef={mentionRef} />
          {draft && (
            <ChatDraftSync
              target={draft.target}
              mentionRef={mentionRef}
              initialDisplay={draft.initialDisplay}
            />
          )}
          {!draft && localDraft && (
            <LocalChatDraftSync
              mentionRef={mentionRef}
              initialDisplay={localDraft.initialDisplay}
              onSave={localDraft.onSave}
            />
          )}
          <ComposerStash
            repoId={repoId}
            mentionRef={mentionRef}
            disabled={isInputDisabled}
            panels={
              <>
                <ComposerTasksPanel
                  steps={composerTaskStepsFromActivity(streamingActivity)}
                  turnId={streamingTurnId}
                />
                <QueuedMessagesPanel
                  items={queuedMessageItems}
                  renderContent={(content) => {
                    const stripped = stripReviewCommentBlocks(content);
                    const display = tokenizedToEditable(
                      stripped.text,
                    ).displayText;
                    const suffix =
                      stripped.reviewCommentCount > 0
                        ? ` · ${stripped.reviewCommentCount} review comment${stripped.reviewCommentCount === 1 ? "" : "s"}`
                        : "";
                    return (
                      <MessageMentionText
                        as="span"
                        text={`${display}${suffix}`}
                        repoBasePath={repoBasePath}
                        className="text-xs leading-4 text-foreground/90"
                      />
                    );
                  }}
                  onEdit={async (id, content) => {
                    await updateQueuedMessage({ id, content });
                  }}
                  onDelete={async (id) => {
                    await deleteQueuedMessage({ id });
                  }}
                  onReorder={async (orderedIds) => {
                    const parentId = queuedMessages[0]?.parentId;
                    if (!parentId) return;
                    await reorderQueuedMessages({ parentId, orderedIds });
                  }}
                />
              </>
            }
            bar={mutedBar}
          >
            <ComposerInputChrome
              repoId={repoId}
              repoBasePath={repoBasePath}
              mentionRef={mentionRef}
              skillItems={skillItems}
              plusDataItems={plusDataItems}
              skillsSettingsHref={`${repoBasePath}/settings/skills`}
              placeholder={isExecuting ? "Add a follow-up..." : placeholder}
              isExecuting={isExecuting}
              isInputDisabled={isInputDisabled}
              hasPendingContext={hasPendingContext}
              onPromptSubmit={handlePromptSubmit}
              onCancel={onCancel}
              seedMentionMap={seed?.mentionMap}
              seedSkillMap={seed?.skillMap}
              messageHistory={messageHistory}
              allowEmptySubmit={allowEmptySubmit}
            />
          </ComposerStash>
        </PromptInputProvider>
      )}
    </div>
  );
}
