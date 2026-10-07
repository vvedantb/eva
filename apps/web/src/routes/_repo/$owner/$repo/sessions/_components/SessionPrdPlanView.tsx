"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation, useConvex } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useNavigate } from "@tanstack/react-router";
import {
  Button,
  cn,
  Plan,
  PlanHeader,
  PlanTitle,
  PlanAction,
  PlanContent,
  PlanFooter,
  PlanTrigger,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@eva/ui";
import { Markdown } from "@eva/ui/markdown";
import {
  IconCheck,
  IconCode,
  IconCopy,
  IconDownload,
  IconFileExport,
  IconPencil,
  IconX,
} from "@tabler/icons-react";
import type { Id } from "@eva/backend";
import { api } from "@eva/backend";
import { MarkdownEditor } from "@/lib/components/editor/MarkdownEditor";
import { useRepo } from "@/lib/contexts/RepoContext";
import { entityPathSegment } from "@/lib/numId";
import { DOC_VIEWER_DEFAULT_TAB } from "@/lib/search-params";
import {
  buildProposedPlanMarkdownFilename,
  downloadPlanAsMarkdownFile,
  normalizePlanMarkdownForExport,
  proposedPlanTitle,
} from "./planExport";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

interface SessionPrdPlanViewProps {
  sessionId: Id<"sessions">;
  planContent: string;
  onApprovePlan: () => void;
  variant: "compact" | "panel";
  isArchived?: boolean;
}

export function SessionPrdPlanView({
  sessionId,
  planContent,
  onApprovePlan,
  variant,
  isArchived,
}: SessionPrdPlanViewProps) {
  const isPanel = variant === "panel";
  const { basePath } = useRepo();
  const navigate = useNavigate();
  const convex = useConvex();
  const updatePlanContent = useMutation(api.sessions.updatePlanContent);
  const createDocFromSession = useMutation(api.docs.createFromSession);
  const linkedDoc = useQuery(api.docs.getBySession, { sessionId });
  const [editingSnapshot, setEditingSnapshot] = useState<string | null>(null);
  const [editKey, setEditKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const getMarkdownRef = useRef<() => string | null>(() => null);
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showEdit = !isArchived && editingSnapshot === null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(
      normalizePlanMarkdownForExport(planContent),
    );
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!planContent.trim()) return;
    downloadPlanAsMarkdownFile(
      buildProposedPlanMarkdownFilename(planContent),
      normalizePlanMarkdownForExport(planContent),
    );
  };

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleStartEdit = () => {
    setEditingSnapshot(planContent);
    setEditKey((k) => k + 1);
  };

  const handleCancelEdit = () => {
    setEditingSnapshot(null);
  };

  const handleEditorReady = (getMarkdown: () => string | null) => {
    getMarkdownRef.current = getMarkdown;
  };

  const handleSave = async () => {
    const markdown = getMarkdownRef.current();
    if (markdown === null) return;
    setIsSaving(true);
    try {
      await withMutationToast(
        updatePlanContent({
          id: sessionId,
          planContent: markdown,
        }),
        "Plan saved",
        "Couldn't save plan",
        "session-plan-save",
      );
      setEditingSnapshot(null);
    } catch {
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
  };

  const handleSaveAsDocument = async () => {
    if (!planContent.trim()) return;
    setIsSavingDoc(true);
    try {
      const docId = await catchMutationError(
        createDocFromSession({ sessionId }),
        "Couldn't save document",
        "session-plan-doc",
      );
      const doc = await convex.query(api.docs.get, { id: docId });
      // Nested ifs rather than a ternary or early returns: React Compiler bails
      // on the whole file for a conditional expression inside a try, and an
      // early return here would skip the setIsSavingDoc(false) below and leave
      // the button stuck. `finally` would be the natural fix but the compiler
      // bails on that too.
      if (doc) {
        const segment = entityPathSegment(doc);
        if (segment) {
          navigate({
            to: toInternalRepoHref(
              `${basePath}/docs/${segment}/${DOC_VIEWER_DEFAULT_TAB}`,
            ),
          });
        }
      }
    } catch {
      setIsSavingDoc(false);
      return;
    }
    setIsSavingDoc(false);
  };

  const hasContent = planContent.trim().length > 0;
  const docButtonLabel = linkedDoc ? "Update Document" : "Save as Document";
  const planTitle = proposedPlanTitle(planContent) ?? "Plan";

  return (
    <Plan
      defaultOpen
      className={cn(
        isPanel ? "flex min-h-0 flex-1 flex-col" : undefined,
        !isPanel && "mb-2",
      )}
    >
      <PlanHeader className={cn("p-4", isPanel && "shrink-0")}>
        <PlanTitle>{planTitle}</PlanTitle>
        <PlanAction>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={handleCopy}
            disabled={!hasContent}
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
            disabled={!hasContent}
            aria-label="Download plan as markdown"
          >
            <IconDownload className="size-4" />
          </Button>
          <PlanTrigger />
        </PlanAction>
      </PlanHeader>
      <PlanContent
        className={cn(
          "flex min-h-0 flex-col px-3 pb-3 pt-0 sm:px-4",
          isPanel
            ? "min-h-0 flex-1 overflow-hidden sm:pb-4"
            : "max-h-40 overflow-y-auto sm:max-h-64 sm:pb-4",
        )}
      >
        {editingSnapshot !== null ? (
          <MarkdownEditor
            key={editKey}
            initialMarkdown={editingSnapshot}
            onEditorReady={handleEditorReady}
          />
        ) : (
          <div
            className={cn(
              "overflow-y-auto",
              isPanel ? "min-h-0 flex-1" : "max-h-40 sm:max-h-64",
            )}
          >
            <Markdown className="text-sm">
              {planContent}
            </Markdown>
          </div>
        )}
      </PlanContent>
      <PlanFooter
        className={cn(
          "flex flex-wrap gap-2 px-4 pb-4 pt-0",
          isPanel && "shrink-0",
        )}
      >
        {showEdit ? (
          <Button
            size="sm"
            variant="secondary"
            className="motion-press"
            onClick={handleStartEdit}
          >
            <IconPencil className="w-3.5 h-3.5" />
            Edit
          </Button>
        ) : null}
        {editingSnapshot !== null ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={isSaving}
              onClick={handleCancelEdit}
            >
              <IconX className="w-3.5 h-3.5" />
              Cancel
            </Button>
            <Button size="sm" disabled={isSaving} onClick={handleSave}>
              <IconCheck className="w-3.5 h-3.5" />
              Save
            </Button>
          </>
        ) : null}
        {editingSnapshot === null && !isArchived ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={!hasContent ? "cursor-not-allowed" : undefined}>
                <Button
                  size="sm"
                  variant="secondary"
                  className="motion-press"
                  onClick={handleSaveAsDocument}
                  disabled={!hasContent || isSavingDoc}
                >
                  <IconFileExport className="w-3.5 h-3.5" />
                  {docButtonLabel}
                </Button>
              </span>
            </TooltipTrigger>
            {!hasContent ? (
              <TooltipContent>
                Add plan content before saving as a document
              </TooltipContent>
            ) : null}
          </Tooltip>
        ) : null}
        {editingSnapshot === null ? (
          <Button
            size="sm"
            className="motion-press bg-success text-success-foreground hover:bg-success/90 hover:scale-[1.01] active:scale-[0.96]"
            onClick={onApprovePlan}
          >
            <IconCode className="w-3.5 h-3.5" />
            Approve Plan
          </Button>
        ) : null}
      </PlanFooter>
    </Plan>
  );
}
