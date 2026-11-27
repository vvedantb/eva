"use client";

import { lazy, Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "@eva/backend";
import { useDevChangelogPreview } from "@/lib/dev/preview";

/**
 * Decides whether the changelog dialog is needed before its code is fetched.
 *
 * `ChangelogDialog` renders markdown through streamdown + shiki + katex, a large
 * chunk of JS (mermaid loads separately, only when a diagram renders). A `lazy()` import alone does not help when the component
 * is mounted on every page: React requests the chunk immediately and the dialog only
 * then discovers it has nothing to show. Running the (already reactive, already cached)
 * `getLatestChangelog` query out here means the chunk is fetched on the rare load that
 * actually has an unread entry.
 */
const ChangelogDialog = lazy(() =>
  import("@/lib/components/ChangelogDialog").then((m) => ({
    default: m.ChangelogDialog,
  })),
);

export function ChangelogDialogGate() {
  const isPreview = useDevChangelogPreview();
  const changelog = useQuery(api.changelog.getLatestChangelog);

  // The dialog repeats these checks — it owns dismissal, so it decides when to
  // close. This only decides whether the code is worth downloading.
  if (!isPreview && !changelog?.show) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <ChangelogDialog />
    </Suspense>
  );
}
