"use client";

import { useState, useEffect, useRef } from "react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { OptimisticLocalStore } from "convex/browser";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { api } from "@eva/backend";
import { entityPathSegment } from "@/lib/numId";
import { useRepo } from "@/lib/contexts/RepoContext";
import { isDocViewerTab, type DocViewerTab } from "@/lib/search-params";
import { useCommentAnchorId } from "@/lib/hooks/useCommentAnchor";
import {
  ActivityTasks,
  Button,
  CrossfadeIcon,
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
} from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import {
  IconCheck,
  IconCopy,
  IconMessageChatbot,
  IconTestPipe,
  IconExternalLink,
  IconSettings,
  IconPlayerStop,
  IconMessage,
  IconHistory,
  IconPencilCheck,
} from "@tabler/icons-react";
import { RelativeDateTime } from "@/lib/components/RelativeDateTime";
import { DocInterviewDialog } from "../DocInterviewDialog";
import { DocContentTab } from "./DocContentTab";
import { HtmlPreviewFrame } from "./HtmlPreviewFrame";
import { DocModeSwitcher } from "./DocModeSwitcher";
import { DocPresenceFacepile } from "./DocPresenceFacepile";
import { DocTestGenDialog } from "./DocTestGenDialog";
import { parseActivitySteps } from "@eva/shared/parseActivitySteps";
import { toInternalRepoHref } from "@/lib/utils/repoUrl";
import { withMutationToast } from "@/lib/utils/mutationToast";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";

type Doc = NonNullable<FunctionReturnType<typeof api.docs.get>>;

function applyDocUpdateOptimistically(
  localStore: OptimisticLocalStore,
  args: FunctionArgs<typeof api.docs.update>,
) {
  const current = localStore.getQuery(api.docs.get, { id: args.id });
  if (current) {
    localStore.setQuery(
      api.docs.get,
      { id: args.id },
      {
        ...current,
        ...args,
        updatedAt: Date.now(),
      },
    );
  }
}

export function DocPrdViewer({
  doc,
  activeTab,
}: {
  doc: Doc;
  activeTab: DocViewerTab;
}) {
  const navigate = useNavigate();
  const { basePath } = useRepo();
  const streaming = useQuery(api.streaming.get, { entityId: doc._id });
  const streamingSteps = parseActivitySteps(streaming?.currentActivity);
  const docComments =
    useQuery(api.docComments.listByDoc, { docId: doc._id }) ?? [];
  const openCommentCount = docComments.filter(
    (c) => !c.parentId && c.resolvedAt === undefined,
  ).length;
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [testGenConfirmOpen, setTestGenConfirmOpen] = useState(false);
  const altHeld = useAltHeld();
  const [isTriggeringTestGen, setIsTriggeringTestGen] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
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
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleDocTabChange = (value: string) => {
    if (!isDocViewerTab(value)) return;
    navigate({
      to: toInternalRepoHref(
        `${basePath}/docs/${entityPathSegment(doc) ?? ""}/${value}`,
      ),
      search: (prev) => prev,
    });
  };

  const startTestGenMutation = useMutation(api.testGenWorkflow.startTestGen);
  const cancelTestGenMutation = useMutation(api.testGenWorkflow.cancelTestGen);
  const updateDoc = useMutation(api.docs.update).withOptimisticUpdate(
    applyDocUpdateOptimistically,
  );

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

  const handleGenerateTests = async () => {
    if (isTriggeringTestGen || doc.testGenStatus === "running") return;
    setIsTriggeringTestGen(true);
    // `try`/`finally` without a `catch` bails the React Compiler out of this
    // whole file, so the reset is duplicated instead. See CLAUDE.md.
    try {
      await withMutationToast(
        startTestGenMutation({ docId: doc._id }),
        "Test generation started",
        "Couldn't start test generation",
        "doc-test-gen-start",
      );
    } catch (error) {
      setIsTriggeringTestGen(false);
      throw error;
    }
    setIsTriggeringTestGen(false);
  };

  const handleStopTestGen = async () => {
    setIsStopping(true);
    try {
      await withMutationToast(
        cancelTestGenMutation({ docId: doc._id }),
        "Test generation stopped",
        "Couldn't stop test generation",
        "doc-test-gen-stop",
      );
    } catch (error) {
      setIsStopping(false);
      throw error;
    }
    setIsStopping(false);
  };

  const isGeneratingTests =
    doc.testGenStatus === "running" || isTriggeringTestGen;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* `flex-wrap`: the title plus four trailing controls do not fit one row on
          a phone, and without wrapping the title is squeezed to nothing. */}
      <div className="flex max-sm:flex-wrap items-center gap-1.5 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <input
          value={doc.title}
          onChange={(e) => updateDoc({ id: doc._id, title: e.target.value })}
          className="text-lg font-semibold bg-transparent border-none outline-hidden focus:ring-0 p-0 min-w-0 w-auto cursor-text placeholder:text-muted-foreground"
          placeholder="Document title"
          size={Math.max(doc.title.length, 12)}
        />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <DocPresenceFacepile docId={doc._id} />
          {isGeneratingTests && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Spinner size="sm" />
              <span className="hidden sm:inline">Generating...</span>
            </div>
          )}
          <RelativeDateTime
            at={doc.updatedAt}
            className="text-xs text-muted-foreground whitespace-nowrap"
          />
          <DocModeSwitcher />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                aria-label="Document options"
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
                  className="relative flex size-4 items-center justify-center"
                  whenTrue={<IconCheck size={16} className="text-success" />}
                  whenFalse={<IconCopy size={16} />}
                />
                Copy PRD
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setInterviewOpen(true)}>
                <IconMessageChatbot size={16} />
                Interview Me
              </DropdownMenuItem>
              {doc.testGenStatus === "completed" && doc.testPrUrl ? (
                <DropdownMenuItem asChild>
                  <a
                    href={doc.testPrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <IconExternalLink size={16} />
                    View Tests PR
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  title={skipConfirmTitle("Generate Tests")}
                  onClick={() =>
                    requestConfirm(
                      altHeld,
                      () => setTestGenConfirmOpen(true),
                      () => {
                        void handleGenerateTests();
                      },
                    )
                  }
                  disabled={isGeneratingTests}
                >
                  <IconTestPipe size={16} />
                  Generate Tests
                  <ConfirmSkipHint />
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={toggleHistory}>
                <IconHistory size={16} />
                Version History
              </DropdownMenuItem>
              {(doc.interviewHistory ?? []).length > 0 && (
                <DropdownMenuItem onClick={() => setHistoryOpen(true)}>
                  <IconHistory size={16} />
                  Interview History
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <DocInterviewDialog
        doc={doc}
        open={interviewOpen}
        onOpenChange={setInterviewOpen}
      />
      <DocInterviewDialog
        doc={doc}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        readOnly
      />
      <DocTestGenDialog
        open={testGenConfirmOpen}
        onOpenChange={setTestGenConfirmOpen}
        onConfirm={handleGenerateTests}
      />
      {streaming && (
        <div className="px-4 pb-3">
          <Surface density="tight" className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Spinner size="sm" />
              <span className="flex-1">
                {isGeneratingTests
                  ? "Generating tests..."
                  : "Processing PRD..."}
              </span>
              <Button
                variant="destructive"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleStopTestGen}
                disabled={isStopping}
              >
                {isStopping ? (
                  <Spinner size="sm" />
                ) : (
                  <IconPlayerStop size={14} />
                )}
                Stop
              </Button>
            </div>
            {streamingSteps ? (
              <ActivityTasks steps={streamingSteps} isStreaming />
            ) : null}
          </Surface>
        </div>
      )}

      <Tabs
        value={activeTab}
        onValueChange={handleDocTabChange}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <TabsBar
          className="sm:px-4"
          actions={
            <div className="flex items-center gap-1">
              {activeTab === "content" && (
                <>
                  <Button
                    size="sm"
                    variant={suggestionsOpen ? "secondary" : "ghost"}
                    className="h-7 px-2 max-sm:h-10 max-sm:px-3"
                    onClick={toggleSuggestions}
                  >
                    <IconPencilCheck size={14} aria-hidden />
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
                    <IconMessage size={14} aria-hidden />
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
            <TabsTrigger value="content">Markdown</TabsTrigger>
            <TabsTrigger value="html">HTML</TabsTrigger>
          </TabsList>
        </TabsBar>

        <AnimatePresence mode="wait" initial={false}>
          {activeTab === "content" ? (
            <m.div
              key="content"
              className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <TabsContent
                value="content"
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
          ) : (
            <m.div
              key="html"
              className="mt-3 min-h-0 flex-1 overflow-hidden px-3 pb-4 sm:px-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <TabsContent
                value="html"
                className="mt-0 h-full min-h-0 overflow-hidden"
              >
                {doc.html ? (
                  <HtmlPreviewFrame html={doc.html} title="HTML preview" />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No HTML for this document yet.
                  </p>
                )}
              </TabsContent>
            </m.div>
          )}
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
