"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api, type Doc, type SandboxOwner } from "@eva/backend";
import type { SessionChatSource } from "@/lib/components/chat/sandboxChatTurn";

/** A task or project that runs on an owned session. */
export type OwnedSessionOwner = FunctionArgs<
  typeof api.sessions.getOwned
>["owner"];

type SandboxGitTarget = FunctionArgs<
  typeof api.sandbox.commitAndPushSandbox
>["target"];

/** The sandbox fields an owner's page reads, off its session. */
export interface OwnedSandboxFields {
  sandboxId: string | undefined;
  status: Doc<"sessions">["status"] | undefined;
  devPort: number | undefined;
  devCommand: string | undefined;
  terminalPanes: Doc<"sessions">["terminalPanes"];
  agentBrowsingAt: number | undefined;
  sandboxGitSync: Doc<"sessions">["sandboxGitSync"];
  /**
   * Panes, preview and PTYs are keyed by the session; undefined before it
   * exists (there is no sandbox yet either).
   */
  owner: SandboxOwner | undefined;
  /** Commit & push target for the sandbox checkout; undefined before the session exists. */
  gitTarget: SandboxGitTarget | undefined;
  /** The session lookup is still loading: not yet known whether one exists. */
  sessionPending: boolean;
}

/**
 * A quick task's or project's session, the one engine behind its sandbox and
 * chat (`sessions.owner`). A project task works on its project's session and
 * talks in its own chat there. The session only exists once something needed
 * it, so `ensure` creates it on the first send or Start (an event, not a
 * render).
 */
export function useOwnedSession(owner: OwnedSessionOwner) {
  const read = useQuery(api.sessions.getOwned, { owner });
  const owned = read === undefined ? undefined : (read?.session ?? null);
  const session = useQuery(
    api.sessions.get,
    owned ? { id: owned.sessionId } : "skip",
  );
  const ensureOwned = useMutation(api.sessions.ensureOwned);

  // A project task can work on its project's session before it has a chat.
  const chatId = owned?.chatId;
  const ensure = async () =>
    owned && chatId
      ? { sessionId: owned.sessionId, chatId }
      : await ensureOwned({ owner });
  const chatSource: SessionChatSource =
    chatId ?? (async () => (await ensure()).chatId);

  // Before the session exists there are no panes, preview or PTYs: the
  // first Start creates the session.
  const sandboxOwner: SandboxOwner | undefined = owned
    ? { kind: "session", sessionId: owned.sessionId }
    : undefined;
  const sandbox: OwnedSandboxFields = {
    sandboxId: session?.sandboxId,
    status: session?.status,
    devPort: session?.devPort,
    devCommand: session?.devCommand,
    terminalPanes: session?.terminalPanes,
    agentBrowsingAt: session?.agentBrowsingAt,
    sandboxGitSync: session?.sandboxGitSync,
    owner: sandboxOwner,
    gitTarget: sandboxOwner,
    sessionPending: owned === undefined,
  };

  return {
    /** The session and the owner's chat (absent until it chats); null until first needed. */
    owned,
    /**
     * What the owner's chat starts on (`chatSeedSettings`); shown until the
     * chat has its own picks. Undefined while loading.
     */
    chatSeed: read?.chatSeed,
    session,
    /** Returns the session, creating it (no sandbox start) when missing. */
    ensure,
    /** The owner's chat, or a resolver that creates it on first use. */
    chatSource,
    sandbox,
  };
}

export type OwnedSession = ReturnType<typeof useOwnedSession>;
