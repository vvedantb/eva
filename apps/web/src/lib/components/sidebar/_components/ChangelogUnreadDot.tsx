"use client";

import { useQuery } from "convex/react";
import { api } from "@eva/backend";
import { CountPop } from "@/lib/components/ui/CountPop";

/**
 * The same unread signal the changelog popup gates on, on the "What's New" link
 * — a user who dismisses the dialog to read it later had nothing telling them
 * there was anything to come back for. Same query as `ChangelogDialogGate`, so
 * the Convex client serves both from one subscription.
 */
export function ChangelogUnreadDot() {
  const changelog = useQuery(api.changelog.getLatestChangelog);

  return (
    <CountPop
      label={changelog?.show === true ? "unread" : null}
      className="ml-auto size-1.5 shrink-0 rounded-full bg-primary"
    >
      <span className="sr-only">Unread</span>
    </CountPop>
  );
}
