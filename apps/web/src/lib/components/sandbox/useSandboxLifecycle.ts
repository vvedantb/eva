"use client";

import { useEffect, useRef, useState } from "react";
import { api, type Doc, type SandboxOwner } from "@eva/backend";
import { sandboxStartupEntityId } from "@eva/shared";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { catchMutationError } from "@/lib/utils/mutationToast";

type SandboxStatus = Doc<"sessions">["status"];

type SandboxAction = "start" | "stop";

/**
 * Start / stop of one sandbox, the same for a session, a quick task, a
 * project task and a project. Each host only says how to start and stop.
 *
 * A flag is on from the click (the mutation is in flight) until the server
 * status leaves `starting` / `stopping`, so the button reacts at once and
 * never flickers back between the mutation and the status patch. A failure
 * is one toast, with the same copy everywhere.
 */
export function useSandboxControls({
  status,
  owner,
  active = true,
  start,
  stop,
  onStarted,
}: {
  status: SandboxStatus | undefined;
  owner: SandboxOwner | undefined;
  active?: boolean;
  start: () => Promise<unknown>;
  stop: () => Promise<unknown>;
  onStarted?: () => void;
}) {
  const [pending, setPending] = useState<SandboxAction | null>(null);
  const startupStreaming = useQuery(
    api.streaming.get,
    active && status === "starting" && owner
      ? { entityId: sandboxStartupEntityId(owner) }
      : "skip",
  );

  const run = async (action: SandboxAction, request: () => Promise<void>) => {
    setPending(action);
    await request()
      .catch(() => undefined)
      .finally(() => setPending(null));
  };

  const handleStartSandbox = () =>
    run("start", async () => {
      await catchMutationError(start(), "Couldn't start sandbox", "sandbox-start");
      onStarted?.();
    });
  const handleStopSandbox = () =>
    run("stop", async () => {
      await catchMutationError(stop(), "Couldn't stop sandbox", "sandbox-stop");
    });

  return {
    isSandboxActive: status === "active",
    isSandboxStarting: pending === "start" || status === "starting",
    isSandboxStopping: pending === "stop" || status === "stopping",
    sandboxStartupActivity: startupStreaming?.currentActivity,
    handleStartSandbox,
    handleStopSandbox,
    handleSandboxToggle: (action: SandboxAction) =>
      action === "start" ? handleStartSandbox() : handleStopSandbox(),
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
  /* eslint-disable no-effect/no-event-handler --
     The agent taking the browser happens in the sandbox and arrives as a live
     query change, so there is no local event to switch the tab from. Full
     deps are safe: the ref guard makes re-runs no-ops. */
  useEffect(() => {
    const prev = prevAgentBrowsingAt.current;
    prevAgentBrowsingAt.current = agentBrowsingAt;
    if (!enabled) return;
    if (agentBrowsingAt === undefined || prev !== undefined) return;
    onAgentTookBrowser();
  }, [agentBrowsingAt, enabled, onAgentTookBrowser]);
  /* eslint-enable no-effect/no-event-handler */
}
