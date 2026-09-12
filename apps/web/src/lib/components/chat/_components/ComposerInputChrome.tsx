import {
  BorderBeam,
  Button,
  InputGroupAddon,
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  toast,
  cn,
  motionFast,
  motionSpring,
  type PromptInputMessage,
  usePromptInputController,
} from "@eva/ui";
import { AnimatePresence, LayoutGroup, m } from "motion/react";
import { ComposerSpeechButton } from "@/lib/components/chat/_components/ComposerSpeechButton";
import {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_BYTES,
  CHAT_ATTACHMENT_ACCEPT,
  chatAttachmentErrorMessage,
  ChatAttachmentPreview,
} from "@/lib/components/chat/imageAttachments";
import { ComposerPlusMenu } from "@/lib/components/chat/_components/ComposerPlusMenu";
import {
  MentionTextarea,
  type MentionTextareaHandle,
} from "@/lib/components/chat/MentionTextarea";
import { IconPlayerStop } from "@tabler/icons-react";
import { useId, type RefObject } from "react";
import type { Id } from "@eva/backend";
import { type SlashItem } from "@/lib/components/mentions";
import { useComposerCompact } from "@/lib/components/chat/_components/useComposerCompact";

// `whitespace-pre!` rather than `nowrap`: both keep the pill on one line, but
// `nowrap` still collapses whitespace, and Chrome then eats the trailing space
// that accepting a mention/skill inserts — the next keystroke landed against
// the chip and re-opened the picker as if the trigger were still being typed.
const COMPACT_EDITOR =
  "flex min-h-9 max-h-9 min-w-0 w-auto flex-1 items-center self-center overflow-hidden whitespace-pre! rounded-none px-1 py-2 text-left leading-5 scrollbar-none transition-[min-height,padding] duration-[var(--motion-base)] focus-visible:outline-hidden";
const EXPANDED_EDITOR =
  "min-h-16 max-h-50 w-full self-stretch overflow-y-auto rounded-none px-4 pt-3.5 pb-1 text-left transition-[min-height,padding] duration-[var(--motion-base)] focus-visible:outline-hidden";

interface DataMenuItem {
  id: string;
  label: string;
  badge?: string;
  provider?: SlashItem["provider"];
  kind?: SlashItem["kind"];
  description?: string;
  personUserId?: Id<"users">;
}

export function ComposerInputChrome({
  repoId,
  repoBasePath,
  mentionRef,
  skillItems,
  plusDataItems,
  skillsSettingsHref,
  placeholder,
  isExecuting,
  isInputDisabled,
  hasPendingContext,
  onPromptSubmit,
  onCancel,
  seedMentionMap,
  seedSkillMap,
  messageHistory,
  allowEmptySubmit,
}: {
  repoId: Id<"githubRepos">;
  repoBasePath: string;
  mentionRef: RefObject<MentionTextareaHandle | null>;
  skillItems: SlashItem[];
  plusDataItems: DataMenuItem[];
  skillsSettingsHref: string;
  placeholder: string;
  isExecuting: boolean;
  isInputDisabled: boolean;
  hasPendingContext: boolean;
  onPromptSubmit: (message: PromptInputMessage) => void | Promise<void>;
  onCancel: () => Promise<void>;
  seedMentionMap?: Map<string, string>;
  seedSkillMap?: Map<string, string>;
  messageHistory: string[];
  allowEmptySubmit?: boolean;
}) {
  const { textInput, attachments } = usePromptInputController();
  // `layoutId` is global unless a LayoutGroup namespaces it, and several
  // composers stay mounted at once (cached session shells, Manager Ave). Two
  // composers sharing an id put one in the follower slot of Motion's shared
  // stack, which hides its tools (opacity 0) and flings them at the hidden
  // lead's 0x0 box — the pill renders with no buttons.
  const layoutScope = useId();
  const { chromeRef, compact } = useComposerCompact({
    value: textInput.value,
    fileCount: attachments.files.length,
  });

  const leftTools = (
    <m.div
      layout="position"
      layoutId="composer-left-tools"
      transition={motionSpring}
      className="flex items-center gap-1"
    >
      <ComposerPlusMenu
        dataItems={plusDataItems}
        skillItems={skillItems}
        mentionRef={mentionRef}
        compact={compact}
      />
    </m.div>
  );

  const rightTools = (
    <m.div
      layout="position"
      layoutId="composer-right-tools"
      transition={motionSpring}
      className="flex min-w-0 items-center gap-0.5"
    >
      <ComposerSpeechButton disabled={isInputDisabled} />
      <AnimatePresence initial={false}>
        {isExecuting ? (
          <m.div
            key="composer-stop"
            className="inline-flex"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={motionFast}
          >
            <Button
              size="icon-sm"
              type="button"
              variant="destructive"
              className="rounded-full"
              onClick={onCancel}
              aria-label="Stop Eva"
              title="Stop Eva"
            >
              <IconPlayerStop className="size-4" />
            </Button>
          </m.div>
        ) : null}
      </AnimatePresence>
      <ChatBodySubmit
        disabled={isInputDisabled}
        isExecuting={isExecuting}
        hasPendingContext={hasPendingContext}
        allowEmptySubmit={allowEmptySubmit}
      />
    </m.div>
  );

  return (
    <LayoutGroup id={layoutScope}>
      <div ref={chromeRef} className="min-w-0 w-full">
        <BorderBeam
          active={isExecuting}
          colorVariant="colorful"
          className={compact ? "rounded-full" : "rounded-surface"}
        >
          <PromptInput
            data-mention-popup-anchor=""
            onSubmit={onPromptSubmit}
            accept={CHAT_ATTACHMENT_ACCEPT}
            multiple
            maxFiles={MAX_CHAT_ATTACHMENTS}
            maxFileSize={MAX_CHAT_ATTACHMENT_BYTES}
            onError={(err) => toast.error(chatAttachmentErrorMessage(err))}
            inputGroupClassName={cn(
              // Height interpolates to/from `auto` so the conversation viewport
              // grows with the composer instead of jumping when the pill snaps.
              "[interpolate-size:allow-keywords] transition-[color,box-shadow,border-color,border-radius,height] duration-[var(--motion-base)]",
              compact
                ? "h-12 items-center rounded-full py-1"
                : "h-auto rounded-surface",
            )}
          >
            <ChatAttachmentPreview />
            {compact ? (
              <InputGroupAddon
                align="inline-start"
                className="order-first gap-1 py-0 pl-1.5 pr-0 has-[>button]:ml-0"
              >
                {leftTools}
              </InputGroupAddon>
            ) : null}
            <MentionTextarea
              key="composer-editor"
              ref={mentionRef}
              repoBasePath={repoBasePath}
              repoId={repoId}
              skillItems={skillItems}
              skillsSettingsHref={skillsSettingsHref}
              placeholder={placeholder}
              initialMentionMap={seedMentionMap}
              initialSkillMap={seedSkillMap}
              history={messageHistory}
              enableAttachmentPaste
              completionContext={`a message instructing an AI coding agent working on the repository ${repoBasePath.replace(/^\//, "")}`}
              className={compact ? COMPACT_EDITOR : EXPANDED_EDITOR}
            />
            {compact ? (
              <InputGroupAddon
                align="inline-end"
                className="order-last gap-1 py-0 pr-1.5 pl-1 has-[>button]:mr-0"
              >
                {rightTools}
              </InputGroupAddon>
            ) : (
              <PromptInputFooter className="max-sm:gap-y-2 px-3 pb-3 pt-0">
                <PromptInputTools>{leftTools}</PromptInputTools>
                {rightTools}
              </PromptInputFooter>
            )}
          </PromptInput>
        </BorderBeam>
      </div>
    </LayoutGroup>
  );
}

function ChatBodySubmit({
  disabled,
  isExecuting,
  hasPendingContext,
  allowEmptySubmit,
}: {
  disabled: boolean;
  isExecuting: boolean;
  hasPendingContext: boolean;
  allowEmptySubmit?: boolean;
}) {
  const { textInput, attachments } = usePromptInputController();
  const isEmpty =
    textInput.value.trim().length === 0 && attachments.files.length === 0;

  return (
    <PromptInputSubmit
      disabled={
        disabled || (isEmpty && !hasPendingContext && !allowEmptySubmit)
      }
      className="size-9"
      title={isExecuting ? "Queue message" : "Send message"}
    />
  );
}
