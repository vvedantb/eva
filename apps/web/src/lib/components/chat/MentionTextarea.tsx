"use client";

import { forwardRef, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { usePromptInputController, usePromptInputAttachments } from "@eva/ui";
import { api, type Id } from "@eva/backend";
import { UserProfileHoverCardBody } from "@eva/shared/user-initials";
import { attachPastedTextIfLarge } from "@/lib/components/attachments/attachmentMeta";
import {
  MentionEditor,
  type MentionEditorHandle,
  type SlashItem,
  DataMentionHoverCardBody,
  SkillMentionHoverCardBody,
  isSkillTokenId,
  mergeMentionItems,
} from "@/lib/components/mentions";
import { useDataMentionItems } from "@/lib/hooks/useDataMentionItems";
import { usePeopleMentionItems } from "@/lib/hooks/usePeopleMentionItems";
import { useDataMentionNavigate } from "@/lib/useDataMentionNavigate";
import { useInlineSuggestion } from "@/lib/hooks/useInlineSuggestion";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { useSimpleView } from "@/lib/hooks/useSimpleView";

export type MentionTextareaHandle = MentionEditorHandle;

interface MentionTextareaProps {
  /** Repo route prefix, e.g. `/owner/repo` or `/owner/repo--app`. */
  repoBasePath: string;
  repoId: Id<"githubRepos">;
  /** `/` menu entries — repo skills plus installed Eva skills. */
  skillItems?: SlashItem[];
  skillsSettingsHref?: string;
  placeholder?: string;
  initialMentionMap?: Map<string, string>;
  initialSkillMap?: Map<string, string>;
  /**
   * Previously sent messages as editable display text, newest-first. When
   * provided, Alt+ArrowUp recalls older messages and Alt+ArrowDown moves
   * back toward the live draft (terminal-style history).
   */
  history?: string[];
  /**
   * When true, pasted images and large plain-text pastes are added as
   * attachments (via the prompt-input attachment context) instead of being
   * inserted as text.
   */
  enableAttachmentPaste?: boolean;
  /**
   * What this composer is for, e.g. "message to an AI coding agent working on
   * acme/web". Used for inline AI completion when the per-user experimental
   * "Composer autocomplete" flag is on; otherwise ignored.
   */
  completionContext?: string;
  className?: string;
}

export const MentionTextarea = forwardRef<
  MentionTextareaHandle,
  MentionTextareaProps
>(function MentionTextarea(
  {
    repoBasePath,
    repoId,
    skillItems = [],
    skillsSettingsHref,
    placeholder,
    initialMentionMap,
    initialSkillMap,
    history,
    enableAttachmentPaste,
    completionContext,
    className,
  },
  ref,
) {
  const navigate = useNavigate();
  const controller = usePromptInputController();
  const attachments = usePromptInputAttachments();
  const value = controller.textInput.value;
  const peopleItems = usePeopleMentionItems(repoId);
  const dataItems = useDataMentionItems(repoId);
  const { items, peopleIds } = mergeMentionItems(peopleItems, dataItems);
  const navigateToData = useDataMentionNavigate(repoBasePath, repoId);
  const flags = useQuery(api.auth.getExperimentalFlags);
  const { suggestion, dismiss } = useInlineSuggestion(
    value,
    flags?.composerAutocomplete === true ? completionContext : undefined,
  );

  // Cursor into `history` (null = editing the live draft) and the draft stashed
  // when history navigation began, so Alt+ArrowDown past the newest entry restores it.
  const historyIndexRef = useRef<number | null>(null);
  const stashedDraftRef = useRef("");
  const setInput = controller.textInput.setInput;

  // Any manual keystroke exits history navigation back to a fresh draft.
  const handleValueChange = (next: string) => {
    historyIndexRef.current = null;
    setInput(next);
  };

  const handleHistoryNavigate = (direction: "up" | "down") => {
    if (!history || history.length === 0) return false;
    if (direction === "up") {
      if (historyIndexRef.current === null) {
        stashedDraftRef.current = value;
        historyIndexRef.current = 0;
      } else {
        historyIndexRef.current = Math.min(
          historyIndexRef.current + 1,
          history.length - 1,
        );
      }
      setInput(history[historyIndexRef.current] ?? "");
      return true;
    }
    if (historyIndexRef.current === null) return false;
    if (historyIndexRef.current === 0) {
      historyIndexRef.current = null;
      setInput(stashedDraftRef.current);
      return true;
    }
    historyIndexRef.current -= 1;
    setInput(history[historyIndexRef.current] ?? "");
    return true;
  };

  // People chips are not navigable — a mention names a teammate, it does not
  // point at a page.
  const handleMentionChipClick = (id: string) => {
    if (peopleIds.has(id)) return;
    void navigateToData(id);
  };

  // Skills settings do not exist in simple view, so the chip and the empty
  // state must not point at a page that redirects straight back out.
  const simpleView = useSimpleView();
  // Soft keyboard, not viewport: a narrow desktop window still has a physical
  // Enter key that should send; a phone Return key should insert a newline.
  const isCoarsePointer = useMediaQuery("(pointer: coarse)");

  const handleSkillChipClick = (_skillId: string) => {
    if (simpleView) return;
    navigate({ to: `${repoBasePath}/settings/skills` });
  };

  return (
    <MentionEditor
      ref={ref}
      value={value}
      onValueChange={handleValueChange}
      onHistoryNavigate={
        history && history.length > 0 ? handleHistoryNavigate : undefined
      }
      suggestion={suggestion}
      onAcceptSuggestion={
        // Through handleValueChange so accepting also exits history recall.
        suggestion ? () => handleValueChange(value + suggestion) : undefined
      }
      onDismissSuggestion={dismiss}
      items={items}
      slashItems={skillItems}
      popupLayout="panel"
      mentionPopupTitle="Mentions"
      onMentionChipClick={handleMentionChipClick}
      onSkillChipClick={handleSkillChipClick}
      initialMentionMap={initialMentionMap}
      initialSkillMap={initialSkillMap}
      renderMentionChipHoverCard={(id) =>
        peopleIds.has(id) ? (
          <UserProfileHoverCardBody userId={id} />
        ) : (
          <DataMentionHoverCardBody entityId={id} repoId={repoId} />
        )
      }
      renderSkillChipHoverCard={(id) =>
        isSkillTokenId(id) ? <SkillMentionHoverCardBody skillId={id} /> : null
      }
      placeholder={placeholder}
      ariaLabel={placeholder ?? "Message input"}
      onImageFiles={enableAttachmentPaste ? attachments.add : undefined}
      onLargeTextPaste={
        enableAttachmentPaste
          ? (text) =>
              attachPastedTextIfLarge(
                text,
                attachments.files.length,
                attachments.add,
              )
          : undefined
      }
      dataSlot="input-group-control"
      // max-h is where the composer starts scrolling instead of growing. 200px
      // is +40px on the previous 160px — two more 20px `text-sm` lines.
      className={
        className ??
        "min-h-16 max-h-50 self-stretch overflow-y-auto rounded-none p-6 text-left focus-visible:outline-hidden"
      }
      emptySlashContent={
        skillsSettingsHref && !simpleView ? (
          <span>
            No available skills.{" "}
            <Link
              to={skillsSettingsHref}
              className="text-foreground underline underline-offset-2"
            >
              Sync skills in Settings
            </Link>
          </span>
        ) : (
          "No available skills."
        )
      }
      onEnterSubmit={
        isCoarsePointer
          ? undefined
          : (e) => {
              const form = e.currentTarget.closest("form");
              if (!(form instanceof HTMLFormElement)) return;
              const submitButton = form.querySelector('button[type="submit"]');
              if (
                submitButton instanceof HTMLButtonElement &&
                submitButton.disabled
              ) {
                return;
              }
              form.requestSubmit();
            }
      }
    />
  );
});
