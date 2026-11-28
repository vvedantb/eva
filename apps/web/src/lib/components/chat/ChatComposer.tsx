import {
  PromptInputProvider,
  toast,
  usePromptInputController,
} from "@vvedantb/ui";
import { chatTypingRoom } from "@eva/shared/typingPresence";
import type {
  ModelAccount,
  ModelOption,
  PromptInputMessage,
} from "@vvedantb/ui";
import {
  describeFailedAttachments,
  useUploadChatAttachments,
  type ChatAttachmentUploads,
} from "@/lib/components/chat/imageAttachments";
import { ChatDraftSync } from "@/lib/components/chat/ChatDraftSync";
import { LocalChatDraftSync } from "@/lib/components/chat/LocalChatDraftSync";
import type { ChatDraftSeed } from "@/lib/components/chat/useChatDraftSeed";
import { ChatTypeToFocus } from "@/lib/components/chat/ChatTypeToFocus";
import { ChatTypingLayer } from "@/lib/components/chat/ChatTypingLayer";
import { ComposerInputChrome } from "@/lib/components/chat/_components/ComposerInputChrome";
import {
  ComposerDock,
  ComposerStash,
} from "@/lib/components/chat/_components/ComposerStash";
import { SkillSuggestionChips } from "@/lib/components/chat/_components/SkillSuggestionChips";
import { useSkillSuggestions } from "@/lib/components/chat/_components/useSkillSuggestions";
import { DraftReadinessBanner } from "@/lib/components/draft-readiness/DraftReadinessBanner";
import { useDraftReadiness } from "@/lib/components/draft-readiness/useDraftReadiness";
import { shouldNudge } from "@/lib/components/draft-readiness/readinessHints";
import { ModelSelectWithTraits } from "@/lib/components/ModelSelectWithTraits";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { usePeopleMentionItems } from "@/lib/hooks/usePeopleMentionItems";
import { useDataMentionItems } from "@/lib/hooks/useDataMentionItems";
import { mergeMentionItems } from "@/lib/components/mentions";
import { queuedMessagePreview } from "@eva/shared";
import { useRef, useState, type ReactNode } from "react";
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
import { type MentionTextareaHandle } from "@/lib/components/chat/MentionTextarea";
import { useSkillSlashItems } from "@/lib/hooks/useSkillSlashItems";
import { QueuedMessagesPanel } from "@/lib/components/QueuedMessagesPanel";
import {
  composerTaskStepsFromActivity,
  ComposerTasksPanel,
} from "@/lib/components/chat/_components/ComposerTasksPanel";
import type {
  ChatBodyQueuedMessage,
  ChatHeldFollowUp,
  ChatRepo,
} from "@/lib/components/chat/chatBodyUtils";
import type { ComposerPredictionTarget } from "@/lib/hooks/useComposerPrediction";
import { useQueuedMessageMutations } from "@eva/shared/queuedMessageMutations";
import { PendingSketchDrain } from "@/lib/components/chat/_components/PendingSketchDrain";

/** localStorage-backed draft seed (no Convex row — new session, Manager Ave). */
export type LocalChatDraft = {
  initialDisplay: string;
  mentionMap: Map<string, string>;
  skillMap: Map<string, string>;
  onSave: (tokenized: string) => void;
};

/**
 * Everything the model picker needs. Absent (Manager Ave runs on a fixed
 * model): the picker is not rendered at all.
 */
export interface ChatModelPicker {
  model: AIModel;
  setModel: (model: AIModel) => void;
  modelOptions: ReadonlyArray<ModelOption<AIModel>>;
  accounts?: ReadonlyArray<ModelAccount>;
  accountId?: string | null;
  onAccountChange?: (accountId: string | null) => void;
  displayTraits: {
    effortLevel: ReasoningLevel | undefined;
    thinkingEnabled: boolean;
    use1mContext: boolean;
    fastMode: boolean;
  };
  onTraitsChange: (partial: Partial<StoredModelTraits>) => void;
}

interface ChatComposerProps {
  repo?: ChatRepo;
  mentionEva?: boolean;
  conversationId: string;
  queuedMessages: ChatBodyQueuedMessage[];
  queueLabel?: string;
  heldFollowUps?: ChatHeldFollowUp[];
  messageHistory: string[];
  isExecuting: boolean;
  isInputDisabled: boolean;
  disabledReason?: string;
  onStartSandbox?: () => void;
  placeholder: string;
  modelPicker?: ChatModelPicker;
  onSend: (
    content: string,
    attachmentStorageIds?: Id<"_storage">[],
  ) => Promise<void>;
  onCancel: () => Promise<void>;
  preInputContent?: React.ReactNode;
  statusChips?: React.ReactNode;
  streamingActivity?: string;
  streamingTurnId?: string;
  underCardLeading?: React.ReactNode;
  draft?: ChatDraftSeed;
  localDraft?: LocalChatDraft;
  isDraftLoading?: boolean;
  hasPendingContext?: boolean;
  allowEmptySubmit?: boolean;
  predictionTarget?: ComposerPredictionTarget;
}

export function ChatComposer({
  repo,
  mentionEva,
  conversationId,
  queuedMessages,
  queueLabel,
  heldFollowUps = [],
  messageHistory,
  isExecuting,
  isInputDisabled,
  disabledReason,
  onStartSandbox,
  placeholder,
  modelPicker,
  onSend,
  onCancel,
  preInputContent,
  statusChips,
  streamingActivity,
  streamingTurnId,
  underCardLeading,
  draft,
  localDraft,
  isDraftLoading,
  hasPendingContext = false,
  allowEmptySubmit = false,
  predictionTarget,
}: ChatComposerProps) {
  const simpleView = useSimpleView();
  const visibleModelPicker = simpleView ? undefined : modelPicker;
  const skillItems = useSkillSlashItems(
    repo?.id,
    modelPicker ? getAIModelProvider(modelPicker.model) : undefined,
  );
  const suggestions = useSkillSuggestions(skillItems);
  const dataMentions = useDataMentionItems(repo?.id);
  const peopleMentions = usePeopleMentionItems(repo?.id);
  const { items: plusDataItems } = mergeMentionItems(
    peopleMentions,
    dataMentions,
  );
  const currentUserId = useQuery(api.auth.me);
  const mentionRef = useRef<MentionTextareaHandle>(null);
  const uploadChatAttachments = useUploadChatAttachments();
  const [isUploading, setIsUploading] = useState(false);
  const readiness = useDraftReadiness();
  const judgesDraft = messageHistory.length === 0;
  const {
    updateQueuedMessage,
    deleteQueuedMessage,
    reorderQueuedMessages,
    steerQueuedMessage,
  } = useQueuedMessageMutations(queuedMessages[0]?.parentId);
  const seed = draft ?? localDraft;

  const handleSubmit = async (
    text: string,
    files: PromptInputMessage["files"],
  ) => {
    const visible = text.trim();
    let uploads: ChatAttachmentUploads = { ids: [], failed: [] };
    if (files.length > 0) {
      setIsUploading(true);
      try {
        uploads = await uploadChatAttachments(files);
      } catch (error) {
        setIsUploading(false);
        throw error;
      }
      setIsUploading(false);
    }
    if (uploads.failed.length > 0) {
      toast.error(
        `Couldn't upload ${describeFailedAttachments(uploads.failed)}`,
        {
          id: "composer-attachments",
          description: "Remove them or try again.",
        },
      );
      throw new Error("Chat attachments failed to upload");
    }
    if (
      !visible &&
      uploads.ids.length === 0 &&
      !hasPendingContext &&
      !allowEmptySubmit
    ) {
      return;
    }
    const content = mentionRef.current?.tokenize(visible) ?? visible;
    readiness.reset();
    await onSend(content, uploads.ids.length > 0 ? uploads.ids : undefined);
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
    steering: message.steer !== undefined,
  }));

  const mutedBar = (stashButton: ReactNode) =>
    !underCardLeading && !stashButton && !visibleModelPicker ? null : (
      <div className="mx-auto flex w-[calc(100%-1.5rem)] md:w-[calc(100%-2rem)] items-center gap-0.5 rounded-b-surface bg-muted/70 px-2 py-0.5">
        {underCardLeading ? (
          <div className="min-w-0 max-sm:flex-1 max-sm:basis-0">
            {underCardLeading}
          </div>
        ) : null}
        {stashButton}
        {visibleModelPicker ? (
          <div className="ml-auto min-w-0 max-sm:shrink sm:shrink-0">
            <ModelSelectWithTraits
              value={visibleModelPicker.model}
              options={visibleModelPicker.modelOptions}
              onValueChange={visibleModelPicker.setModel}
              accounts={visibleModelPicker.accounts}
              accountId={visibleModelPicker.accountId}
              onAccountChange={visibleModelPicker.onAccountChange}
              traits={visibleModelPicker.displayTraits}
              onTraitsChange={visibleModelPicker.onTraitsChange}
              className="h-7 w-auto max-w-full justify-start border-0 bg-transparent px-2 text-xs font-normal text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
            />
          </div>
        ) : null}
      </div>
    );

  const renderQueuedContent = (content: string) => (
    <MessageMentionText
      as="span"
      text={queuedMessagePreview(content)}
      repo={repo}
      className="text-xs leading-4 text-foreground/90"
    />
  );

  const dockPanels = (
    <>
      <ComposerTasksPanel
        steps={composerTaskStepsFromActivity(streamingActivity)}
        turnId={streamingTurnId}
      />
      <QueuedMessagesPanel
        items={queuedMessageItems}
        {...(queueLabel !== undefined ? { label: queueLabel } : {})}
        renderContent={renderQueuedContent}
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
        onSteer={async (id) => {
          await steerQueuedMessage({ id });
        }}
      />
      <QueuedMessagesPanel
        items={heldFollowUps}
        renderContent={renderQueuedContent}
      />
      {judgesDraft && <ComposerReadinessBanner readiness={readiness} />}
    </>
  );

  const inputChrome = (
    <ComposerInputChrome
      repo={repo}
      mentionEva={mentionEva}
      mentionRef={mentionRef}
      skillItems={skillItems}
      plusDataItems={plusDataItems}
      placeholder={isExecuting ? "Add a follow-up..." : placeholder}
      isExecuting={isExecuting}
      isInputDisabled={isInputDisabled}
      isUploading={isUploading}
      disabledReason={disabledReason}
      onStartSandbox={onStartSandbox}
      hasPendingContext={hasPendingContext}
      onPromptSubmit={handlePromptSubmit}
      onCancel={onCancel}
      seedMentionMap={seed?.mentionMap}
      seedSkillMap={seed?.skillMap}
      messageHistory={messageHistory}
      allowEmptySubmit={allowEmptySubmit}
      predictionTarget={predictionTarget}
      warnFor={(text) => judgesDraft && shouldNudge(readiness.resultFor(text))}
      onDraftChange={(text) => {
        suggestions.noteDraft(text);
        if (judgesDraft) readiness.noteChange(text);
      }}
    />
  );

  return (
    <div className="relative p-3 md:px-4 md:pt-4 md:pb-2 max-w-3xl mx-auto w-full">
      {preInputContent}
      <div className="mx-auto flex w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-1.5">
        {statusChips}
        <SkillSuggestionChips
          chips={suggestions.chips}
          onPick={(item) => {
            mentionRef.current?.insertSkill(item);
            suggestions.dismiss(item.id);
          }}
        />
      </div>
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
            roomId={chatTypingRoom(conversationId)}
            userId={currentUserId}
          />
          <ChatTypeToFocus mentionRef={mentionRef} />
          <PendingSketchDrain />
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
          {repo ? (
            <ComposerStash
              repoId={repo.id}
              mentionRef={mentionRef}
              panels={dockPanels}
              bar={mutedBar}
            >
              {inputChrome}
            </ComposerStash>
          ) : (
            <ComposerDock panels={dockPanels} bar={mutedBar(null)}>
              {inputChrome}
            </ComposerDock>
          )}
        </PromptInputProvider>
      )}
    </div>
  );
}

function ComposerReadinessBanner({
  readiness,
}: {
  readiness: ReturnType<typeof useDraftReadiness>;
}) {
  const { textInput } = usePromptInputController();
  return (
    <DraftReadinessBanner
      result={readiness.resultFor(textInput.value)}
      onDismiss={readiness.dismiss}
      className="rounded-b-none rounded-t-surface"
    />
  );
}
