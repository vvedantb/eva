import {
  BorderBeam,
  Button,
  InputGroupAddon,
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
  toast,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
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
import { isComposerVisible } from "@/lib/components/chat/_components/composerVisibility";
import { useShortcut } from "@/lib/hotkeys/useShortcut";
import { ShortcutKbd } from "@/lib/components/ui/Kbd";

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
  isUploading = false,
  disabledReason,
  onStartSandbox,
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
  /** Attachments are being uploaded: the submit button spins and stops accepting. */
  isUploading?: boolean;
  /** Why the composer will not send, for the toast on a blocked Enter. */
  disabledReason?: string;
  /** Wakes the sandbox; gives that toast its action. */
  onStartSandbox?: () => void;
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

  // Up to three session shells plus Manager Ave stay mounted, so a shortcut
  // registered here fires once per mounted composer. Only the one on screen
  // may act — see composerVisibility.ts.
  const isVisibleComposer = () =>
    isComposerVisible(mentionRef.current?.getElement());

  useShortcut("cancelTurn", () => {
    if (!isExecuting) return;
    if (!isVisibleComposer()) return;
    void onCancel();
  });

  useShortcut("focusComposer", (event) => {
    if (!isVisibleComposer()) return;
    event.preventDefault();
    mentionRef.current?.focus();
  });

  // Enter on a disabled composer swallows the keystroke either way; this is the
  // difference between "nothing happened" and being told Eva is asleep, with
  // the way out attached. An empty draft needs no explanation.
  const handleBlockedSubmit = () => {
    if (!isInputDisabled) return;
    toast.info(disabledReason ?? "You can't send right now", {
      id: "composer-blocked",
      ...(onStartSandbox
        ? { action: { label: "Wake up Eva", onClick: onStartSandbox } }
        : {}),
    });
  };

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
            {/* A tooltip rather than `title`: the binding is a `ShortcutKbd`
                that follows the user's own setting, and a title attribute can
                only hold a string. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  type="button"
                  variant="destructive"
                  className="rounded-full"
                  onClick={onCancel}
                  aria-label="Stop Eva"
                >
                  <IconPlayerStop className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="flex items-center gap-2">
                Stop Eva
                <ShortcutKbd id="cancelTurn" />
              </TooltipContent>
            </Tooltip>
          </m.div>
        ) : null}
      </AnimatePresence>
      <ChatBodySubmit
        disabled={isInputDisabled}
        isExecuting={isExecuting}
        isUploading={isUploading}
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
              onBlockedSubmit={handleBlockedSubmit}
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
  isUploading,
  hasPendingContext,
  allowEmptySubmit,
}: {
  disabled: boolean;
  isExecuting: boolean;
  /** Attachments are still uploading, so the send has not left yet. */
  isUploading: boolean;
  hasPendingContext: boolean;
  allowEmptySubmit?: boolean;
}) {
  const { textInput, attachments } = usePromptInputController();
  const isEmpty =
    textInput.value.trim().length === 0 && attachments.files.length === 0;

  return (
    <PromptInputSubmit
      disabled={
        disabled ||
        isUploading ||
        (isEmpty && !hasPendingContext && !allowEmptySubmit)
      }
      // "submitted" is the button's own spinner state. Fetch uploads report no
      // bytes, so a spinner is the honest signal — a percentage would be made up.
      {...(isUploading ? { status: "submitted" as const } : {})}
      className="size-9"
      title={
        isUploading
          ? "Uploading attachments…"
          : isExecuting
            ? "Queue message"
            : "Send message"
      }
    />
  );
}
