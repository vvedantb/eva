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
  /** Panes, preview and PTYs are keyed by this owner. */
  owner: SandboxOwner;
  /** Commit & push target for the sandbox checkout. */
  gitTarget: SandboxGitTarget;
}

/**
 * A quick task's or project's session, the one engine behind its sandbox and
 * chat (`sessions.owner`). A project task works on its project's session and
 * talks in its own chat there. The session only exists once something needed
 * it, so `ensure` creates it on the first send or Start (an event, not a
 * render).
 */
export function useOwnedSession(owner: OwnedSessionOwner) {
  const owned = useQuery(api.sessions.getOwned, { owner });
  const session = useQuery(
    api.sessions.get,
    owned ? { id: owned.sessionId } : "skip",
  );
  const ensureOwned = useMutation(api.sessions.ensureOwned);

  const ensure = async () => owned ?? (await ensureOwned({ owner }));
  const chatSource: SessionChatSource =
    owned?.chatId ?? (async () => (await ensure()).chatId);

  // Before the session exists the owner's own key stands in: it has no
  // panes, preview or PTYs yet, and the first Start creates the session.
  const sandboxOwner: SandboxOwner = owned
    ? { kind: "session", sessionId: owned.sessionId }
    : owner;
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
  };

  return {
    /** The session and the owner's chat; null until first needed. */
    owned,
    session,
    /** Returns the session, creating it (no sandbox start) when missing. */
    ensure,
    /** The owner's chat, or a resolver that creates it on first use. */
    chatSource,
    sandbox,
  };
}

export type OwnedSession = ReturnType<typeof useOwnedSession>;
