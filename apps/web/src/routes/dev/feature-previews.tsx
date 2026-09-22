import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@eva/ui";
import { IconFileText, IconGitFork } from "@tabler/icons-react";
import { AssistantCiteToolbar } from "@/lib/components/chat/AssistantCiteToolbar";
import { DEMO_ASSISTANT_CITATION } from "@/lib/components/chat/assistantCitation";
import { PendingCitationChips } from "@/lib/components/chat/PendingCitationChips";
import { PendingSnapshotChips } from "@/lib/components/chat/PendingSnapshotChips";
import { PendingWebMcpChips } from "@/lib/components/chat/PendingWebMcpChips";
import { toSandboxFilePath } from "@/lib/components/chat/ChangedFilesCard";
import { ContextUsageDisplay } from "@/lib/components/context-usage";
import { DiffsToolbar } from "@/lib/components/sandbox/DiffsToolbar";
import { PreviewSnapshotButton } from "@/lib/components/sandbox/PreviewSnapshotButton";
import { PreviewWebMcpButton } from "@/lib/components/sandbox/PreviewWebMcpButton";
import { DEMO_PREVIEW_SNAPSHOT } from "@/lib/components/sandbox/previewSnapshot";
import { DEMO_WEBMCP_DISCOVERY } from "@/lib/components/sandbox/previewWebMcp";
import { PendingCitationsProvider } from "@/lib/contexts/PendingCitationsContext";
import { PendingPreviewSnapshotsProvider } from "@/lib/contexts/PendingPreviewSnapshotsContext";
import { PendingWebMcpProvider } from "@/lib/contexts/PendingWebMcpContext";
import { ThreadFindBar } from "@/lib/components/chat/ThreadFindBar";
import {
  collectThreadFindDocuments,
  DEMO_THREAD_FIND_MESSAGES,
  DEMO_THREAD_FIND_QUERY,
} from "@/lib/components/chat/threadFind";
import { MessageForkDialog } from "@/lib/components/chat/MessageForkDialog";
import {
  DEMO_FORK_MESSAGES,
  DEMO_FORK_PREFIX,
} from "@/lib/components/chat/messageFork";

const FEATURES = [
  "cite",
  "snapshot",
  "diffs-files",
  "ignore-whitespace",
  "context-meter",
  "webmcp",
  "thread-find",
  "message-fork",
] as const;

// `.catch` keeps an unknown ?feature= on the default preview instead of
// throwing, which is what the two type assertions used to buy.
const searchSchema = z.object({
  feature: z.enum(FEATURES).catch("cite"),
});

export const Route = createFileRoute("/dev/feature-previews")({
  validateSearch: searchSchema,
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: FeaturePreviewsPage,
});

function FeaturePreviewsPage() {
  const { feature } = Route.useSearch();
  if (feature === "snapshot") return <SnapshotPreview />;
  if (feature === "diffs-files") return <DiffsFilesPreview />;
  if (feature === "ignore-whitespace") return <IgnoreWhitespacePreview />;
  if (feature === "context-meter") return <ContextMeterPreview />;
  if (feature === "webmcp") return <WebMcpPreview />;
  if (feature === "thread-find") return <ThreadFindPreview />;
  if (feature === "message-fork") return <MessageForkPreview />;
  return <CitePreview />;
}

function CitePreview() {
  const quoteRef = useRef<HTMLParagraphElement>(null);
  const [forcedTarget, setForcedTarget] = useState<{
    messageId: string;
    text: string;
    x: number;
    y: number;
  }>();

  useLayoutEffect(() => {
    const quote = quoteRef.current;
    if (!quote) return;
    const rect = quote.getBoundingClientRect();
    setForcedTarget({
      messageId: DEMO_ASSISTANT_CITATION.messageId,
      text: DEMO_ASSISTANT_CITATION.text,
      x: rect.left + Math.min(rect.width / 2, 180),
      y: rect.top,
    });
  }, []);

  return (
    <PendingCitationsProvider initialItems={[DEMO_ASSISTANT_CITATION]}>
      <div className="min-h-dvh bg-background px-10 py-12 text-foreground">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Cite-selection chips
        </p>
        <h1 className="mt-1 text-xl font-semibold">Quote Eva, then send</h1>
        <div
          className="mt-8 max-w-xl rounded-lg border border-border bg-card p-5"
          data-message-id={DEMO_ASSISTANT_CITATION.messageId}
        >
          <p className="text-xs text-muted-foreground">Eva</p>
          <div
            className="mt-2 text-sm leading-6"
            data-assistant-cite-source={DEMO_ASSISTANT_CITATION.messageId}
          >
            <p ref={quoteRef}>{DEMO_ASSISTANT_CITATION.text}</p>
            <p className="mt-3 text-muted-foreground">
              I can wire the invoices table next if you want that empty state
              to match production.
            </p>
          </div>
        </div>
        <div className="mt-10 max-w-xl rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">Attached to send</p>
          <PendingCitationChips />
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
            Ask Eva to revise this copy…
          </div>
        </div>
        {forcedTarget ? (
          <AssistantCiteToolbar forcedTarget={forcedTarget} />
        ) : null}
      </div>
    </PendingCitationsProvider>
  );
}

const DEMO_DIFF_FILE = "apps/web/src/billing/InvoiceList.tsx";

function DiffsFilesPreview() {
  const fileParam = toSandboxFilePath(DEMO_DIFF_FILE);
  return (
    <div className="min-h-dvh bg-background px-10 py-12 text-foreground">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Diffs → Files
      </p>
      <h1 className="mt-1 text-xl font-semibold">Open this change in Files</h1>
      <div className="mt-8 max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border bg-muted/95 px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">
            <span className="text-muted-foreground">apps/web/src/billing/</span>
            <span className="font-medium">InvoiceList.tsx</span>
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Open InvoiceList.tsx in Files`}
            data-testid="open-in-files"
          >
            <IconFileText className="size-4" />
          </Button>
        </div>
        <pre className="px-3 py-3 font-mono text-xs leading-6 text-muted-foreground">
          {`@@ -12,6 +12,7 @@
  return (
    <ul>
+     <li>Last four invoices</li>
    </ul>
  );`}
        </pre>
      </div>
      <div className="mt-6 max-w-2xl rounded-lg border border-border bg-card px-3 py-2">
        <p className="text-xs text-muted-foreground">Files deep-link</p>
        <p
          className="mt-1 font-mono text-sm text-foreground"
          data-testid="files-deeplink"
        >
          /sessions/12/files?file={fileParam}
        </p>
      </div>
    </div>
  );
}

function IgnoreWhitespacePreview() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="px-10 pt-12">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Ignore whitespace
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          Hide indent-only noise
        </h1>
      </div>
      <div className="mt-8 border-y border-border">
        <DiffsToolbar
          fileCount={3}
          additions={4}
          deletions={1}
          viewedCount={1}
          filter=""
          onFilterChange={() => {}}
          diffView="unified"
          onDiffViewChange={() => {}}
          wrapLines={false}
          onWrapLinesChange={() => {}}
          ignoreWhitespace
          onIgnoreWhitespaceChange={() => {}}
          allExpanded
          onExpandAll={() => {}}
          onCollapseAll={() => {}}
          isLoading={false}
          onRefresh={() => {}}
        />
      </div>
      <div className="mx-10 mt-6 max-w-2xl rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          Whitespace-only pairs dropped · real edit kept
        </p>
        <pre className="mt-3 font-mono text-xs leading-6">
          {`  const x = 1;
- return a;
+ return b;`}
        </pre>
      </div>
    </div>
  );
}

const DEMO_CONTEXT_USAGE = {
  usedTokens: 184_000,
  maxTokens: 200_000,
  model: "claude-opus-5",
  usage: {
    inputTokens: 12_400,
    outputTokens: 3_200,
    cachedInputReadTokens: 168_000,
    cachedInputWriteTokens: 800,
  },
  costs: { totalUSD: 2.41 },
};

function ContextMeterPreview() {
  return (
    <div className="min-h-dvh bg-background px-10 py-12 text-foreground">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Live context meter
      </p>
      <h1 className="mt-1 text-xl font-semibold">Window occupancy, live</h1>
      <div className="mt-8 flex max-w-xl items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <span className="text-sm font-medium">Billing empty state</span>
        <ContextUsageDisplay
          aggregated={DEMO_CONTEXT_USAGE}
          defaultOpen
          onCompact={() => {}}
        />
      </div>
    </div>
  );
}

function WebMcpPreview() {
  return (
    <PendingWebMcpProvider initialDiscoveries={[DEMO_WEBMCP_DISCOVERY]}>
      <div className="min-h-dvh bg-background px-10 py-12 text-foreground">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          WebMCP page tools
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          Call the page, don&apos;t click it
        </h1>
        <div className="mt-8 max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <span className="font-mono text-xs text-muted-foreground">
              localhost:5173/billing
            </span>
            <PreviewWebMcpButton
              iframeElement={null}
              seedDiscovery={DEMO_WEBMCP_DISCOVERY}
            />
          </div>
          <div className="p-6">
            <h2 className="text-lg font-semibold">Billing</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Refund and retry are page tools, not buttons Eva has to hunt.
            </p>
          </div>
        </div>
        <div className="mt-8 max-w-2xl rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">Attached to send</p>
          <PendingWebMcpChips />
        </div>
      </div>
    </PendingWebMcpProvider>
  );
}

function SnapshotPreview() {
  return (
    <PendingPreviewSnapshotsProvider
      initialSnapshots={[DEMO_PREVIEW_SNAPSHOT]}
    >
      <div className="min-h-dvh bg-background px-10 py-12 text-foreground">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Semantic preview snapshot
        </p>
        <h1 className="mt-1 text-xl font-semibold">
          Page structure, not a screenshot
        </h1>
        <div className="mt-8 max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <span className="font-mono text-xs text-muted-foreground">
              localhost:5173/billing
            </span>
            <PreviewSnapshotButton
              iframeElement={null}
              seedSnapshot={DEMO_PREVIEW_SNAPSHOT}
            />
          </div>
          <div className="p-6">
            <h2 className="text-lg font-semibold">Billing</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Current plan: Team. Failed to load invoices.
            </p>
          </div>
        </div>
        <div className="mt-8 max-w-2xl rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">Attached to send</p>
          <PendingSnapshotChips />
        </div>
      </div>
    </PendingPreviewSnapshotsProvider>
  );
}

function ThreadFindPreview() {
  const documents = collectThreadFindDocuments(
    DEMO_THREAD_FIND_MESSAGES.map((message) => ({
      id: message.id,
      text: message.text,
    })),
  );
  return (
    <div
      className="relative min-h-dvh bg-background px-10 py-12 text-foreground"
      data-thread-find-scope=""
    >
      <ThreadFindBar
        documents={documents}
        defaultOpen
        defaultQuery={DEMO_THREAD_FIND_QUERY}
      />
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        In-thread find
      </p>
      <h1 className="mt-1 max-w-xl text-xl font-semibold">
        Search this transcript
      </h1>
      <div className="mt-8 max-w-xl space-y-3">
        {DEMO_THREAD_FIND_MESSAGES.map((message) => (
          <div
            key={message.id}
            data-message-id={message.id}
            className={
              message.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg bg-primary/10 px-3 py-2 text-sm"
                : "rounded-lg border border-border bg-card px-3 py-2 text-sm"
            }
          >
            <p className="text-[11px] text-muted-foreground">
              {message.role === "user" ? "You" : "Eva"}
            </p>
            <p className="mt-1 leading-6">{message.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageForkPreview() {
  return (
    <div className="min-h-dvh bg-background px-10 py-12 text-foreground">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Message fork
      </p>
      <h1 className="mt-1 text-xl font-semibold">Branch a new chat here</h1>
      <div className="mt-8 max-w-xl space-y-3">
        {DEMO_FORK_MESSAGES.map((message) => {
          const included = DEMO_FORK_PREFIX.turns.some(
            (turn) => turn.messageId === message.id,
          );
          return (
            <div
              key={message.id}
              data-message-id={message.id}
              className={
                message.role === "user"
                  ? "ml-auto max-w-[85%] rounded-lg bg-primary/10 px-3 py-2 text-sm"
                  : "rounded-lg border border-border bg-card px-3 py-2 text-sm"
              }
            >
              <p className="text-[11px] text-muted-foreground">
                {message.role === "user" ? "You" : "Eva"}
                {included ? "" : " · stays on original"}
              </p>
              <p className="mt-1 leading-6">{message.content}</p>
              {message.id === DEMO_FORK_PREFIX.throughMessageId ? (
                <button
                  type="button"
                  data-testid="message-fork-button"
                  aria-label="Fork from here"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <IconGitFork className="size-3.5" />
                  Fork from here
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <MessageForkDialog
        prefix={DEMO_FORK_PREFIX}
        open
        onOpenChange={() => {}}
        onConfirm={() => undefined}
      />
    </div>
  );
}
