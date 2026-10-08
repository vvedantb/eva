"use client";

import { useState, useEffect, useRef } from "react";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import {
  api,
  INCOMPLETE_PR_RECAP_MESSAGE,
  isIncompleteReadyRecap,
} from "@eva/backend";
import { entityPathSegment } from "@/lib/numId";
import { useRepo } from "@/lib/contexts/RepoContext";
import { useCommentAnchorId } from "@/lib/hooks/useCommentAnchor";
import {
  canonicalizeRecapDocTab,
  type DocViewerTab,
} from "@/lib/search-params";
import {
  ActivityTasks,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Spinner,
  Surface,
  Tabs,
  TabsBar,
  TabsContent,
  TabsList,
  TabsTrigger,
  motionFast,
  CrossfadeIcon,
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import {
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconSettings,
  IconMessage,
  IconHistory,
  IconPencilCheck,
} from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { DocContentTab } from "./DocContentTab";
import { HtmlPreviewFrame } from "./HtmlPreviewFrame";
import { DocPresenceFacepile } from "./DocPresenceFacepile";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { withMutationToast } from "@/lib/utils/mutationToast";

type Doc = NonNullable<FunctionReturnType<typeof api.docs.get>>;

export function DocRecapViewer({
  doc,
  activeTab,
}: {
  doc: Doc;
  activeTab: DocViewerTab;
}) {
  const navigate = useNavigate();
  const { basePath } = useRepo();
  const streaming = useQuery(api.streaming.get, {
    entityId: `pr-recap:${doc._id}`,
  });
  const streamingSteps = parseActivitySteps(streaming?.currentActivity);
  const docComments =
    useQuery(api.docComments.listByDoc, { docId: doc._id }) ?? [];
  const openCommentCount = docComments.filter(
    (c) => !c.parentId && c.resolvedAt === undefined,
  ).length;
  const [copied, setCopied] = useState(false);
  // Arriving from a comment notification opens the panel the comment lives in;
  // a plain visit still starts closed. Lazy initial state rather than an effect
  // — the panel is open on the first paint, so nothing flashes shut.
  const commentAnchorId = useCommentAnchorId();
  const [commentsOpen, setCommentsOpen] = useState(
    () => commentAnchorId !== null,
  );
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionCount, setSuggestionCount] = useState(0);
  const [isRevising, setIsRevising] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviseRecap = useMutation(api.docs.reviseRecapFromFeedback);

  const pendingAgentFeedbackCount = doc.pendingAgentCommentIds?.length ?? 0;
  const canReviseRecap =
    pendingAgentFeedbackCount > 0 &&
    !doc.activeWorkflowId &&
    doc.prRecapStatus !== "pending";

  const toggleComments = () => {
    setCommentsOpen((v) => !v);
    setHistoryPanelOpen(false);
    setSuggestionsOpen(false);
  };
  const toggleHistory = () => {
    setHistoryPanelOpen((v) => !v);
    setCommentsOpen(false);
    setSuggestionsOpen(false);
  };
  const toggleSuggestions = () => {
    setSuggestionsOpen((v) => !v);
    setCommentsOpen(false);
    setHistoryPanelOpen(false);
  };

  const viewTab = canonicalizeRecapDocTab(activeTab);

  /* eslint-disable no-effect/no-event-handler --
     Redirects a legacy URL the user can arrive at from a bookmark or a link, so
     the trigger is the route itself rather than anything clicked here. */
  // Legacy `/html` and `/content` on recap docs → `/recap` and `/summary`.
  useEffect(() => {
    if (activeTab === viewTab) return;
    const segment = entityPathSegment(doc);
    if (!segment) return;
    void navigate({
      to: toInternalRepoHref(`${basePath}/docs/${segment}/${viewTab}`),
      search: (prev) => prev,
      replace: true,
    });
  }, [activeTab, basePath, doc, navigate, viewTab]);
  /* eslint-enable no-effect/no-event-handler */

  const handleDocTabChange = (value: string) => {
    if (value !== "recap" && value !== "summary") return;
    navigate({
      to: toInternalRepoHref(
        `${basePath}/docs/${entityPathSegment(doc) ?? ""}/${value}`,
      ),
      search: (prev) => prev,
    });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(doc.content);
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const isRecapPending = doc.prRecapStatus === "pending";
  const isRecapErrored = doc.prRecapStatus === "error";
  // Pending with no workflow behind it means the run died — see PrRecapPanel.
  const isRecapStalled = isRecapPending && doc.activeWorkflowId === undefined;
  // Rows written before the write path enforced the invariant — see
  // `recapState` in the backend, which both recap views share.
  const isRecapIncompleteReady = isIncompleteReadyRecap(doc);

  const handleReviseRecap = async () => {
    setIsRevising(true);
    // `try`/`finally` without a `catch` bails the React Compiler out of this
    // whole file, so the reset is duplicated instead. See CLAUDE.md.
    try {
      await withMutationToast(
        reviseRecap({ docId: doc._id }),
        "Recap revision started",
        "Couldn't revise recap",
        "doc-revise-recap",
      );
    } catch (error) {
      setIsRevising(false);
      throw error;
    }
    setIsRevising(false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* `flex-wrap`: title plus trailing controls do not share one row on a phone. */}
      <div className="flex max-sm:flex-wrap items-center gap-1.5 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <h1 className="min-w-0 truncate text-balance text-lg font-semibold">
          {doc.title}
        </h1>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <DocPresenceFacepile docId={doc._id} />
          <RelativeDateTime
            at={doc.updatedAt}
            className="text-xs text-muted-foreground whitespace-nowrap"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                aria-label="Recap options"
                className="motion-press hover:scale-[1.01] active:scale-[0.96]"
              >
                <IconSettings size={16} aria-hidden />
                <span className="hidden sm:inline">Options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  handleCopy();
                }}
              >
                <CrossfadeIcon
                  show={copied}
                  trueKey="copied"
                  falseKey="copy"
                  variant="soft"
                  className="relative flex size-4 items-center justify-center"
                  whenTrue={<IconCheck size={16} className="text-success" />}
                  whenFalse={<IconCopy size={16} />}
                />
                Copy recap
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleHistory}>
                <IconHistory size={16} />
                Version History
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {doc.prUrl || doc.headSha ? (
        <div className="mx-3 mb-2 rounded-surface border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:mx-4">
          <span>Auto-generated recap</span>
          {doc.headSha ? (
            <span className="ml-2 font-mono">{doc.headSha.slice(0, 7)}</span>
          ) : null}
          {doc.prUrl ? (
            <a
              href={doc.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="max-sm:hit-target ml-2 inline-flex items-center gap-1 text-foreground hover:underline"
            >
              View on GitHub
              <IconExternalLink size={12} aria-hidden />
            </a>
          ) : null}
          {isRecapErrored && doc.prRecapError ? (
            <p className="mt-1 text-destructive">{doc.prRecapError}</p>
          ) : null}
          {isRecapStalled ? (
            <p className="mt-1 text-destructive">
              Generation stopped before it finished.
            </p>
          ) : null}
          {isRecapIncompleteReady ? (
            <p className="mt-1 text-destructive">
              {INCOMPLETE_PR_RECAP_MESSAGE}
            </p>
          ) : null}
          {canReviseRecap ? (
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-7"
                disabled={isRevising}
                onClick={handleReviseRecap}
              >
                {isRevising ? (
                  <>
                    <Spinner size="sm" />
                    Revising…
                  </>
                ) : (
                  `Revise recap (${pendingAgentFeedbackCount})`
                )}
              </Button>
              <span className="text-muted-foreground">
                Queued Ask Eva feedback
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      <AnimatePresence>
        {isRecapPending && !isRecapStalled ? (
          <m.div
            key="recap-activity"
            className="px-4 pb-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={motionFast}
          >
            <Surface density="tight" className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Spinner size="sm" />
                <span className="flex-1">Generating recap...</span>
              </div>
              {streamingSteps ? (
                <ActivityTasks steps={streamingSteps} isStreaming />
              ) : (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {streaming?.currentActivity ?? "Generating recap..."}
                </p>
              )}
            </Surface>
          </m.div>
        ) : null}
      </AnimatePresence>

      <Tabs
        value={viewTab}
        onValueChange={handleDocTabChange}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <TabsBar
          className="sm:px-4"
          actions={
            <div className="flex items-center gap-1">
              {viewTab === "summary" && (
                <>
                  <Button
                    size="sm"
                    variant={suggestionsOpen ? "secondary" : "ghost"}
                    className="h-7 px-2 max-sm:h-10 max-sm:px-3"
                    onClick={toggleSuggestions}
                  >
                    <IconPencilCheck size={14} />
                    <span className="text-xs">Suggestions</span>
                    {suggestionCount > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {suggestionCount}
                      </span>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant={commentsOpen ? "secondary" : "ghost"}
                    className="h-7 px-2 max-sm:h-10 max-sm:px-3"
                    onClick={toggleComments}
                  >
                    <IconMessage size={14} />
                    <span className="text-xs">Comments</span>
                    {openCommentCount > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {openCommentCount}
                      </span>
                    )}
                  </Button>
                </>
              )}
            </div>
          }
        >
          <TabsList>
            <TabsTrigger value="recap">Recap</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>
        </TabsBar>

        <AnimatePresence mode="wait" initial={false}>
          {viewTab === "recap" ? (
            <m.div
              key="recap"
              className="mt-3 min-h-0 flex-1 overflow-hidden px-3 pb-4 sm:px-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <TabsContent
                value="recap"
                className="mt-0 h-full min-h-0 overflow-hidden"
              >
                {doc.html ? (
                  <HtmlPreviewFrame html={doc.html} title="PR recap" />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {isRecapIncompleteReady || isRecapErrored
                      ? INCOMPLETE_PR_RECAP_MESSAGE
                      : "No recap generated yet. It is created the next time this review runs."}
                  </p>
                )}
              </TabsContent>
            </m.div>
          ) : (
            <m.div
              key="summary"
              className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <TabsContent
                value="summary"
                className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <DocContentTab
                  doc={doc}
                  commentsOpen={commentsOpen}
                  onToggleComments={toggleComments}
                  historyOpen={historyPanelOpen}
                  onToggleHistory={toggleHistory}
                  suggestionsOpen={suggestionsOpen}
                  onToggleSuggestions={toggleSuggestions}
                  onSuggestionCount={setSuggestionCount}
                />
              </TabsContent>
            </m.div>
          )}
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
