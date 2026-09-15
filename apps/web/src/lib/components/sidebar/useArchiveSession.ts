"use client";

import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api, type Id } from "@eva/backend";
import { useState } from "react";
import {
  mutationError,
  mutationSuccess,
} from "@/lib/utils/mutationToast";
import {
  sessionMatchesPath,
  type RepoPathParts,
} from "@/lib/components/sidebar/_utils/repoSessionPaths";

export interface ArchiveSessionTarget {
  session: { _id: Id<"sessions">; sandboxId?: string };
  /** Scopes the "am I on this session?" check; ids are only unique per app. */
  repo: RepoPathParts;
  pathSegment: string;
}

/**
 * Stops the sandbox (when one is up), archives the session, and leaves the
 * session route if the user is on it. Shared by the archive confirm dialogs
 * and the Alt-click bypass on every Archive control.
 */
export function useArchiveSession() {
  const navigate = useNavigate();
  const archiveSession = useMutation(api.sessions.archive);
  const stopSandboxMutation = useMutation(api.sessions.stopSandbox);
  const [isArchiving, setIsArchiving] = useState(false);

  const archive = async (
    target: ArchiveSessionTarget,
    pathname: string,
    onDone?: () => void,
  ): Promise<boolean> => {
    setIsArchiving(true);
    try {
      if (target.session.sandboxId) {
        await stopSandboxMutation({ sessionId: target.session._id });
      }
      await archiveSession({ id: target.session._id });
      mutationSuccess("Session archived", "session-archive");
      // Must be the exact route, not a substring: `includes` sent the user
      // away from session 123 whenever session 12 was archived, and matched
      // the same id under a different app.
      if (sessionMatchesPath(target.repo, target.pathSegment, pathname)) {
        void navigate({ to: "/sessions" });
      }
      if (onDone) onDone();
    } catch {
      mutationError("Couldn't archive session", "session-archive");
      setIsArchiving(false);
      return false;
    }
    setIsArchiving(false);
    return true;
  };

  return { archive, isArchiving };
}
