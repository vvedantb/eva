"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id } from "@eva/backend";
import { Button } from "@eva/ui";
import { IconAlertTriangle } from "@tabler/icons-react";
import { sandboxDisplayStatus } from "./sandboxStatusStyles";

/**
 * The reason this session's last wake attempt failed, or `undefined` while the
 * sandbox is healthy (or merely asleep).
 *
 * Reads the session doc directly rather than taking a prop: the chat header is
 * handed `isSandboxActive` / `isSandboxToggling` but never the row, and the
 * component that owns the doc (`SessionDetailClient`) threads nothing else
 * through. This is the cached `useQuery` the detail view already subscribes
 * with, so the header shares that subscription instead of opening a second one.
 */
export function useSessionSandboxError(
  sessionId: Id<"sessions">,
): string | undefined {
  const session = useQuery(api.sessions.get, { id: sessionId });
  if (!session) return undefined;
  if (sandboxDisplayStatus(session) !== "error") return undefined;
  return session.sandboxError;
}

/**
 * Compact "the sandbox did not come up" banner with the failure and a retry.
 * A failed start leaves the session `closed`, which on its own paints the same
 * grey dot as a sandbox the user put to sleep — so without this the only signal
 * is a system alert buried in the transcript.
 */
export function SandboxErrorNotice({
  sandboxError,
  onRetry,
}: {
  /** Short, user-safe message from the backend (`session.sandboxError`). */
  sandboxError: string;
  /** Same start the wake control fires. */
  onRetry: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-surface bg-destructive/10 px-2 py-1">
      <IconAlertTriangle
        size={14}
        className="shrink-0 text-destructive"
        aria-hidden
      />
      <span className="shrink-0 text-xs font-medium text-foreground">
        {"Eva couldn't wake up"}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {sandboxError}
      </span>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
