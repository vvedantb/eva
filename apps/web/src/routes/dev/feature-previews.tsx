import { createFileRoute, redirect } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { AssistantCiteToolbar } from "@/lib/components/chat/AssistantCiteToolbar";
import { DEMO_ASSISTANT_CITATION } from "@/lib/components/chat/assistantCitation";
import { PendingCitationChips } from "@/lib/components/chat/PendingCitationChips";
import { PendingSnapshotChips } from "@/lib/components/chat/PendingSnapshotChips";
import { PreviewSnapshotButton } from "@/lib/components/sandbox/PreviewSnapshotButton";
import { DEMO_PREVIEW_SNAPSHOT } from "@/lib/components/sandbox/previewSnapshot";
import { PendingCitationsProvider } from "@/lib/contexts/PendingCitationsContext";
import { PendingPreviewSnapshotsProvider } from "@/lib/contexts/PendingPreviewSnapshotsContext";

const validateSearch = (search: Record<string, unknown>) => ({
  feature: search.feature === "snapshot" ? "snapshot" : "cite",
});

export const Route = createFileRoute("/dev/feature-previews")({
  validateSearch,
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: FeaturePreviewsPage,
});

function FeaturePreviewsPage() {
  const { feature } = Route.useSearch();
  return feature === "snapshot" ? <SnapshotPreview /> : <CitePreview />;
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
