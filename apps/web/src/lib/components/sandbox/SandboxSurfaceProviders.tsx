"use client";

import type { ReactNode } from "react";
import { OpenSandboxFileProvider } from "@/lib/contexts/OpenSandboxFileContext";
import { PendingPreviewSnapshotsProvider } from "@/lib/contexts/PendingPreviewSnapshotsContext";
import { PendingReviewCommentsProvider } from "@/lib/contexts/PendingReviewCommentsContext";
import { PendingWebMcpProvider } from "@/lib/contexts/PendingWebMcpContext";
import { PreviewViewportProvider } from "@/lib/contexts/PreviewViewportContext";

/**
 * The context a sandbox surface (session, quick task, project) shares between
 * its chat and its sandbox panes: review comments drafted on the Review diff,
 * preview snapshots and WebMCP discoveries wait here until the next chat send
 * carries them, and the preview's custom size rides every send; files open through the same handler. One stack for all three
 * surfaces, so a chat on any of them carries the same context.
 */
export function SandboxSurfaceProviders({
  onOpenFile,
  onOpenDiffsTab,
  children,
}: {
  onOpenFile?: (path: string) => void;
  /** Opens the Review diffs; a pending review-comment chip jumps there. */
  onOpenDiffsTab: () => void;
  children: ReactNode;
}) {
  return (
    <PendingReviewCommentsProvider onOpenDiffsTab={onOpenDiffsTab}>
      <PendingPreviewSnapshotsProvider>
        <PendingWebMcpProvider>
          <PreviewViewportProvider>
            <OpenSandboxFileProvider onOpenFile={onOpenFile}>
              {children}
            </OpenSandboxFileProvider>
          </PreviewViewportProvider>
        </PendingWebMcpProvider>
      </PendingPreviewSnapshotsProvider>
    </PendingReviewCommentsProvider>
  );
}
