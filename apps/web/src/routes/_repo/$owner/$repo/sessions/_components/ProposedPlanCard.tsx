"use client";

import { useRef, useState } from "react";
import {
  Badge,
  Button,
  cn,
  motionBase,
} from "@eva/ui";
import { Markdown } from "@eva/ui/markdown";
import { AnimatePresence, m } from "motion/react";
import {
  IconCheck,
  IconCode,
  IconCopy,
  IconDownload,
  IconFileExport,
  IconPencil,
  IconX,
} from "@tabler/icons-react";
import { MarkdownEditor } from "@/lib/components/editor/MarkdownEditor";
import {
  buildCollapsedProposedPlanPreviewMarkdown,
  buildProposedPlanMarkdownFilename,
  downloadPlanAsMarkdownFile,
  normalizePlanMarkdownForExport,
  proposedPlanTitle,
  stripDisplayedPlanMarkdown,
} from "./planExport";

export function ProposedPlanCard({
  planMarkdown,
  implemented,
  onImplement,
  onImplementInNewSession,
  onSave,
  onSaveAsDocument,
  saveAsDocumentLabel = "Save as Document",
  isSaving,
  isSavingDoc,
  isArchived,
  className,
}: {
  planMarkdown: string;
  implemented: boolean;
  onImplement?: () => void;
  onImplementInNewSession?: () => void;
  onSave?: (markdown: string) => Promise<void>;
  onSaveAsDocument?: () => void;
  saveAsDocumentLabel?: string;
  isSaving?: boolean;
  isSavingDoc?: boolean;
  isArchived?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const getMarkdownRef = useRef<() => string | null>(() => null);
  const title = proposedPlanTitle(planMarkdown) ?? "Proposed plan";
  const lineCount = planMarkdown.split("\n").length;
  const canCollapse = !editing && (planMarkdown.length > 900 || lineCount > 20);
  const displayed = stripDisplayedPlanMarkdown(planMarkdown);
  const collapsedPreview = canCollapse
    ? buildCollapsedProposedPlanPreviewMarkdown(planMarkdown, { maxLines: 10 })
    : null;
  const exportContents = normalizePlanMarkdownForExport(planMarkdown);
  const canEdit = onSave !== undefined && !isArchived;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exportContents);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    downloadPlanAsMarkdownFile(
      buildProposedPlanMarkdownFilename(planMarkdown),
      exportContents,
    );
  };

  const handleStartEdit = () => {
    setEditing(true);
    setExpanded(true);
    setEditKey((key) => key + 1);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!onSave) return;
    const markdown = getMarkdownRef.current();
    if (markdown === null) return;
    try {
      await onSave(markdown);
      setEditing(false);
    } catch {
      return;
    }
  };

  return (
    <AnimatePresence>
      <m.div
        className={cn(
          "rounded-surface border border-border bg-card/70 p-4",
          className,
        )}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={motionBase}
      >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge
            variant="secondary"
            className="shrink-0 rounded-md px-1.5 py-0 text-[10px] font-semibold tracking-wide uppercase"
          >
            {implemented ? "Implemented" : "Plan"}
          </Badge>
          <p className="truncate text-sm font-medium">{title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => void handleCopy()}
            aria-label={copied ? "Copied" : "Copy plan"}
          >
            {copied ? (
              <IconCheck className="size-4 text-success" />
            ) : (
              <IconCopy className="size-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={handleDownload}
            aria-label="Download plan as markdown"
          >
            <IconDownload className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-4">
        {editing ? (
          <MarkdownEditor
            key={editKey}
            initialMarkdown={planMarkdown}
            onEditorReady={(getMarkdown) => {
              getMarkdownRef.current = getMarkdown;
            }}
          />
        ) : (
          <>
            <div
              className={cn(
                "relative",
                canCollapse && !expanded && "max-h-64 overflow-hidden",
              )}
            >
              <div
                className={cn(
                  canCollapse && !expanded && "max-h-64 overflow-hidden",
                )}
              >
                <Markdown className="text-sm">
                  {canCollapse && !expanded ? (collapsedPreview ?? "") : displayed}
                </Markdown>
              </div>
              {canCollapse && !expanded ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-card via-card/80 to-transparent" />
              ) : null}
            </div>
            {canCollapse ? (
              <div className="mt-3 flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? "Collapse plan" : "Expand plan"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {editing ||
      canEdit ||
      (onSaveAsDocument !== undefined && !isArchived) ||
      (!implemented && !isArchived && (onImplement || onImplementInNewSession)) ? (
      <div className="mt-4 flex flex-wrap gap-2">
        {editing ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={isSaving}
              onClick={handleCancelEdit}
            >
              <IconX className="size-3.5" />
              Cancel
            </Button>
            <Button size="sm" disabled={isSaving} onClick={() => void handleSave()}>
              <IconCheck className="size-3.5" />
              Save
            </Button>
          </>
        ) : (
          <>
            {canEdit ? (
              <Button size="sm" variant="secondary" onClick={handleStartEdit}>
                <IconPencil className="size-3.5" />
                Edit
              </Button>
            ) : null}
            {onSaveAsDocument && !isArchived ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={isSavingDoc}
                onClick={onSaveAsDocument}
              >
                <IconFileExport className="size-3.5" />
                {saveAsDocumentLabel}
              </Button>
            ) : null}
            {!implemented && !isArchived && onImplement ? (
              <Button
                size="sm"
                className="bg-success text-success-foreground hover:bg-success/90"
                onClick={onImplement}
              >
                <IconCode className="size-3.5" />
                Implement
              </Button>
            ) : null}
            {!implemented && !isArchived && onImplementInNewSession ? (
              <Button size="sm" variant="secondary" onClick={onImplementInNewSession}>
                Implement in new session
              </Button>
            ) : null}
          </>
        )}
      </div>
      ) : null}
      </m.div>
    </AnimatePresence>
  );
}
