"use client";

import { forwardRef, useRef } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  usePromptInputController,
  usePromptInputAttachments,
  useMediaQuery,
} from "@vvedantb/ui";
import { api } from "@eva/backend";
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
import type { ChatRepo } from "@/lib/components/chat/chatBodyUtils";
import { useDataMentionItems } from "@/lib/hooks/useDataMentionItems";
import { usePeopleMentionItems } from "@/lib/hooks/usePeopleMentionItems";
import { useDataMentionNavigate } from "@/lib/useDataMentionNavigate";
import { useInlineSuggestion } from "@/lib/hooks/useInlineSuggestion";
import {
  useComposerPrediction,
  type ComposerPredictionTarget,
} from "@/lib/hooks/useComposerPrediction";
import { useSimpleView } from "@/lib/hooks/useSimpleView";
import { EVA_MENTION_ID, EVA_MENTION_ITEM } from "@eva/shared";

export type MentionTextareaHandle = MentionEditorHandle;

interface MentionTextareaProps {
  repo?: ChatRepo;
  skillItems?: SlashItem[];
  placeholder?: string;
  initialMentionMap?: Map<string, string>;
  initialSkillMap?: Map<string, string>;
  history?: string[];
  enableAttachmentPaste?: boolean;
  completionContext?: string;
  predictionTarget?: ComposerPredictionTarget;
  onBlockedSubmit?: () => void;
  onDraftChange?: (value: string) => void;
  mentionEva?: boolean;
  className?: string;
}

export const MentionTextarea = forwardRef<
  MentionTextareaHandle,
  MentionTextareaProps
>(function MentionTextarea(
  {
    repo,
    skillItems = [],
    placeholder,
    initialMentionMap,
    initialSkillMap,
    history,
    enableAttachmentPaste,
    mentionEva = false,
    completionContext,
    predictionTarget,
    onBlockedSubmit,
    onDraftChange,
    className,
  },
  ref,
) {
  const navigate = useNavigate();
  const controller = usePromptInputController();
  const attachments = usePromptInputAttachments();
  const value = controller.textInput.value;
  const teammates = usePeopleMentionItems(repo?.id);
  const peopleItems = mentionEva ? [EVA_MENTION_ITEM, ...teammates] : teammates;
  const dataItems = useDataMentionItems(repo?.id);
  const { items, peopleIds } = mergeMentionItems(peopleItems, dataItems);
  const navigateToData = useDataMentionNavigate(repo?.basePath ?? "", repo?.id);
  const flags = useQuery(api.auth.getExperimentalFlags);
  const completion = useInlineSuggestion(
    value,
    flags?.composerAutocomplete === true ? completionContext : undefined,
  );
  const prediction = useComposerPrediction(
    value,
    flags?.composerPredictions === true ? predictionTarget : undefined,
  );
  const { suggestion, dismiss } =
    prediction.suggestion !== undefined ? prediction : completion;

  const historyIndexRef = useRef<number | null>(null);
  const stashedDraftRef = useRef("");
  const setInput = controller.textInput.setInput;

  const handleValueChange = (next: string) => {
    historyIndexRef.current = null;
    setInput(next);
    onDraftChange?.(next);
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

  const handleMentionChipClick = (id: string) => {
    if (peopleIds.has(id)) return;
    void navigateToData(id);
  };

  const simpleView = useSimpleView();
  const isCoarsePointer = useMediaQuery("(pointer: coarse)");

  const skillsSettingsHref = repo
    ? `${repo.basePath}/settings/skills`
    : undefined;

  const handleSkillChipClick = (_skillId: string) => {
    if (simpleView || !skillsSettingsHref) return;
    navigate({ to: skillsSettingsHref });
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
        id === EVA_MENTION_ID ? null : peopleIds.has(id) ? (
          <UserProfileHoverCardBody userId={id} />
        ) : repo ? (
          <DataMentionHoverCardBody entityId={id} repoId={repo.id} />
        ) : null
      }
      renderSkillChipHoverCard={(id) =>
        isSkillTokenId(id) ? <SkillMentionHoverCardBody skillId={id} /> : null
      }
      placeholder={prediction.suggestion !== undefined ? "" : placeholder}
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
                onBlockedSubmit?.();
                return;
              }
              form.requestSubmit();
            }
      }
    />
  );
});
