"use client";

import { forwardRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DynamicLink } from "@/lib/components/DynamicLink";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { useRepo } from "@/lib/contexts/RepoContext";
import { cn } from "@eva/ui";
import {
  MentionEditor,
  type MentionEditorHandle,
  DataMentionHoverCardBody,
  SkillMentionHoverCardBody,
  isSkillTokenId,
} from "@/lib/components/mentions";
import { useDataMentionItems } from "@/lib/hooks/useDataMentionItems";
import { useSkillSlashItems } from "@/lib/hooks/useSkillSlashItems";
import { useDataMentionNavigate } from "@/lib/useDataMentionNavigate";
import { useInlineSuggestion } from "@/lib/hooks/useInlineSuggestion";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";

export type DescriptionMentionEditorHandle = MentionEditorHandle;

interface DescriptionMentionEditorProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  ariaLabel?: string;
  onBlur?: () => void;
  initialMentionMap?: Map<string, string>;
  initialSkillMap?: Map<string, string>;
  /** When true, blocks all input. Used while a draft is loading. */
  disabled?: boolean;
  /**
   * What this field is for, e.g. "description of a coding task for acme/web".
   * Used for inline AI completion when the per-user experimental "Composer
   * autocomplete" flag is on; otherwise ignored.
   */
  completionContext?: string;
  /**
   * Receives images pasted into the editor instead of inserting them as text.
   * Omitting it drops pasted images, as before.
   */
  onImageFiles?: (files: File[]) => void;
  /**
   * Called for large plain-text pastes. Return true when handled as an
   * attachment so the editor skips inline insert.
   */
  onLargeTextPaste?: (text: string) => boolean;
}

export const DescriptionMentionEditor = forwardRef<
  DescriptionMentionEditorHandle,
  DescriptionMentionEditorProps
>(function DescriptionMentionEditor(
  {
    value,
    onValueChange,
    placeholder,
    className,
    minHeight = "min-h-[120px]",
    ariaLabel,
    onBlur,
    initialMentionMap,
    initialSkillMap,
    disabled,
    completionContext,
    onImageFiles,
    onLargeTextPaste,
  },
  ref,
) {
  const { repo, basePath } = useRepo();
  const flags = useQuery(api.auth.getExperimentalFlags);
  const { suggestion, dismiss } = useInlineSuggestion(
    value,
    !disabled && flags?.composerAutocomplete === true
      ? completionContext
      : undefined,
  );
  const navigate = useNavigate();
  const items = useDataMentionItems(repo._id);
  const navigateToData = useDataMentionNavigate(basePath, repo._id);

  const handleMentionChipClick = (id: string) => {
    void navigateToData(id);
  };

  const handleSkillChipClick = (_skillId: string) => {
    navigate({ to: toInternalRepoHref(`${basePath}/settings/skills`) });
  };
  const slashItems = useSkillSlashItems(repo._id);

  return (
    <MentionEditor
      ref={ref}
      value={value}
      onValueChange={onValueChange}
      items={items}
      slashItems={slashItems}
      mentionPopupTitle="Data"
      onMentionChipClick={handleMentionChipClick}
      onSkillChipClick={handleSkillChipClick}
      initialMentionMap={initialMentionMap}
      initialSkillMap={initialSkillMap}
      disabled={disabled}
      onImageFiles={onImageFiles}
      onLargeTextPaste={onLargeTextPaste}
      suggestion={suggestion}
      onAcceptSuggestion={
        suggestion ? () => onValueChange(value + suggestion) : undefined
      }
      onDismissSuggestion={dismiss}
      renderMentionChipHoverCard={(id) => (
        <DataMentionHoverCardBody entityId={id} repoId={repo._id} />
      )}
      renderSkillChipHoverCard={(id) =>
        isSkillTokenId(id) ? <SkillMentionHoverCardBody skillId={id} /> : null
      }
      placeholder={placeholder}
      ariaLabel={ariaLabel ?? placeholder ?? "Description"}
      className={cn(
        "rounded-control border border-input px-3 py-2 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        minHeight,
        className,
      )}
      emptySlashContent={
        <span>
          No available skills.{" "}
          <DynamicLink
            to={toInternalRepoHref(`${basePath}/settings/skills`)}
            className="text-foreground underline underline-offset-2"
          >
            Sync skills in Settings
          </DynamicLink>
        </span>
      }
      onBlur={onBlur}
    />
  );
});
