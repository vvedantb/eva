"use client";

import { lazy, Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "@eva/backend";
import { useDevChangelogPreview } from "@/lib/dev/preview";

const ChangelogDialog = lazy(() =>
  import("@/lib/components/ChangelogDialog").then((m) => ({
    default: m.ChangelogDialog,
  })),
);

export function ChangelogDialogGate() {
  const isPreview = useDevChangelogPreview();
  const changelog = useQuery(api.changelog.getLatestChangelog);

  if (!isPreview && !changelog?.show) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <ChangelogDialog />
    </Suspense>
  );
}
