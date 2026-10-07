"use client";

import dayjs from "dayjs";
import { useQuery } from "convex/react";
import { api, type Doc, type SandboxOwner } from "@eva/backend";
import { sandboxOwnerParentId } from "./PreviewToolCallExecutor";

type ActivitySource = NonNullable<Doc<"sandboxActivity">["lastUserActivitySource"]>;

const SOURCE_LABELS: Record<ActivitySource, string> = {
  chat: "chat",
  start: "a sandbox start",
  viewing: "an open sandbox tab",
  "preview-tab": "the Preview tab",
  "preview-page": "the preview page",
  terminal: "the terminal",
  files: "the file browser",
  services: "a service start or stop",
};

/**
 * One muted line naming who or what last reset the idle-pause clock, so a
 * sandbox that stays awake can be traced. An absolute local time, not "3
 * minutes ago": the line only re-renders when the activity changes, so a
 * relative time would go stale exactly when someone is investigating.
 */
export function SandboxLastActivity({ owner }: { owner: SandboxOwner }) {
  const activity = useQuery(api.sandboxIdlePause.getSandboxLastActivity, {
    kind: owner.kind,
    entityId: String(sandboxOwnerParentId(owner)),
  });
  if (!activity) return null;

  const at = dayjs(activity.at);
  const time = at.isSame(dayjs(), "day")
    ? at.format("HH:mm")
    : at.format("D MMM HH:mm");

  return (
    <p className="truncate px-3 py-1 text-xs text-muted-foreground">
      {activity.source ? "Kept awake" : "Last activity"}
      {activity.userName ? (
        <>
          {" by "}
          <span data-pii>{activity.userName}</span>
        </>
      ) : null}
      {activity.source ? ` via ${SOURCE_LABELS[activity.source]}` : ""}
      {` at ${time}`}
    </p>
  );
}
