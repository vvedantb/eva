"use client";

import { useEffect, useRef, useState } from "react";
import type { Doc } from "@eva/backend";

/** Same union for sessions, quick tasks and projects. */
type SandboxStatus = Doc<"sessions">["status"];

type SandboxAction = "start" | "stop";

/**
 * Start / stop flags of one sandbox owner. A flag is on from the click (the
 * mutation is in flight) until the server status leaves `starting` /
 * `stopping`, so the button reacts at once and never flickers back between
 * the mutation and the status patch.
 */
export function useSandboxLifecycle(status: SandboxStatus | undefined) {
  const [pending, setPending] = useState<SandboxAction | null>(null);

  /** Runs `request` with `action` pending. `request` owns its error toast. */
  const run = async (action: SandboxAction, request: () => Promise<void>) => {
    setPending(action);
    try {
      await request();
    } finally {
      setPending(null);
    }
  };

  return {
    isStarting: pending === "start" || status === "starting",
    isStopping: pending === "stop" || status === "stopping",
    run,
  };
}

/**
 * Calls `onAgentTookBrowser` when the agent takes the sandbox browser
 * (`agentBrowsingAt` goes from unset to set): callers switch to the Browser
 * tab and expand the sandbox panel. Only on that transition, so it does not
 * fight a user who switches away mid-lock. While `enabled` is false (a hidden
 * cached shell) the transition is consumed without a switch.
 */
export function useAgentBrowsingAutoSwitch(
  agentBrowsingAt: number | undefined,
  onAgentTookBrowser: () => void,
  enabled = true,
) {
  const prevAgentBrowsingAt = useRef<number | undefined>(undefined);
  // The agent taking the browser happens in the sandbox and arrives as a live
  // query change, so there is no local event to switch the tab from. Full
  // deps are safe: the ref guard makes re-runs no-ops.
  useEffect(() => {
    const prev = prevAgentBrowsingAt.current;
    prevAgentBrowsingAt.current = agentBrowsingAt;
    if (!enabled) return;
    if (agentBrowsingAt === undefined || prev !== undefined) return;
    onAgentTookBrowser();
  }, [agentBrowsingAt, enabled, onAgentTookBrowser]);
}
