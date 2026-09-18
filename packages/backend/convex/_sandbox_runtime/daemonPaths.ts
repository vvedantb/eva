/** Entity-scoped warm-daemon marker paths on the sandbox filesystem. */

export type DaemonPaths = {
  pid: string;
  entity: string;
  opts: string;
};

export function entityDaemonPaths(
  entityIdField: string,
  entityId: string,
): DaemonPaths {
  const suffix = `${entityIdField}-${entityId}`;
  return {
    pid: `/tmp/eva-daemon.${suffix}.pid`,
    entity: `/tmp/eva-daemon.${suffix}.entity`,
    opts: `/tmp/eva-daemon.${suffix}.opts`,
  };
}

const LEGACY_SESSION_DAEMON_PATHS: DaemonPaths = {
  pid: "/tmp/eva-daemon.pid",
  entity: "/tmp/eva-daemon.entity",
  opts: "/tmp/eva-daemon.opts",
};

function shellQuote(value: string): string {
  return JSON.stringify(value);
}

/** Shell snippet that prints alive | optsmismatch | stale | cold. */
export function buildDaemonAliveCheckCmd(
  entityIdField: string,
  entityId: string,
  fp: string,
  optsSig: string,
): string {
  const fpLit = shellQuote(fp);
  const optsLit = shellQuote(optsSig);
  const entityIdLit = shellQuote(entityId);
  const body =
    `if [ "$(cat /tmp/eva-callback-fp 2>/dev/null)" = ${fpLit} ]; then ` +
    `if [ "$(cat __OPTS__ 2>/dev/null)" = ${optsLit} ]; then echo alive; else echo optsmismatch; fi; ` +
    `else echo stale; fi`;

  function condition(paths: DaemonPaths): string {
    const pid = shellQuote(paths.pid);
    const entity = shellQuote(paths.entity);
    return (
      `[ -f ${pid} ] && kill -0 "$(cat ${pid})" 2>/dev/null && ` +
      `[ "$(cat ${entity} 2>/dev/null)" = ${entityIdLit} ]`
    );
  }

  function branch(paths: DaemonPaths): string {
    const branchBody = body.replace("__OPTS__", paths.opts);
    return `if ${condition(paths)}; then ${branchBody}`;
  }

  const scoped = entityDaemonPaths(entityIdField, entityId);
  if (entityIdField === "sessionId") {
    return `${branch(scoped)}; ${branch(LEGACY_SESSION_DAEMON_PATHS).replace(/^if /, "elif ")}; else echo cold; fi`;
  }
  return `${branch(scoped)}; else echo cold; fi`;
}

/**
 * Kills the entity-scoped daemon (and legacy session markers when applicable).
 *
 * Kills the whole descendant TREE and waits for the root to exit, because a
 * lone SIGTERM to the daemon pid is not enough on either count:
 *
 * - The daemon boots a `query()` at startup, which spawns the Claude Code CLI
 *   as a child. The runner is launched under `flock -n -E 217` (launch.ts), so
 *   that child inherits the lock fd and keeps the per-entity spawn lock held
 *   after the daemon itself is gone. The relaunch ~1s later then loses the
 *   flock and exits 217, leaving nobody polling claimPendingTurn — observed in
 *   prod as a session stuck on "Working…" after a model/tools respawn.
 * - SIGTERM is asynchronous, so the relaunch can race a daemon that has not
 *   finished exiting. We poll `kill -0` for ~3s and escalate to SIGKILL.
 *
 * The root is signalled before its descendants: the daemon has no SIGTERM
 * handler and dies at once, whereas killing its CLI child first would let the
 * still-live daemon see its query pump fail and post a bogus "daemon failed"
 * completion. Descendant pids are collected before the root dies so orphans are
 * still reached. `pgrep -P` walks the tree by parent pid, so unlike `pgrep -f`
 * it cannot match this command's own `bash -lc` wrapper. Callers allow a 10s
 * exec timeout; at most two pidfiles are reaped, so the worst case is ~6s of
 * waiting.
 */
export function buildKillEntityDaemonCmd(
  entityIdField: string,
  entityId: string,
): string {
  const parts = [
    `kill_tree() { kids="$(pgrep -P "$1" 2>/dev/null)"; kill -"$2" "$1" 2>/dev/null || true; for c in $kids; do kill_tree "$c" "$2"; done; }`,
    `reap() { pid="$(cat "$1" 2>/dev/null)"; [ -n "$pid" ] || return 0; kill -0 "$pid" 2>/dev/null || return 0; kill_tree "$pid" TERM; for i in $(seq 1 15); do kill -0 "$pid" 2>/dev/null || return 0; sleep 0.2; done; kill_tree "$pid" KILL; }`,
  ];

  function reapParts(paths: DaemonPaths): string[] {
    return [
      `reap ${shellQuote(paths.pid)}`,
      `rm -f ${shellQuote(paths.pid)} ${shellQuote(paths.opts)} ${shellQuote(paths.entity)}`,
    ];
  }

  parts.push(...reapParts(entityDaemonPaths(entityIdField, entityId)));
  if (entityIdField === "sessionId") {
    parts.push(...reapParts(LEGACY_SESSION_DAEMON_PATHS));
  }
  parts.push("true");
  return parts.join("; ");
}

export type DaemonMutationEnv = {
  claimMutation: string;
  openSyntheticTurnMutation: string;
  completeSyntheticTurnMutation: string;
  updateBackgroundAgentsMutation: string;
};

export const SESSION_DAEMON_MUTATIONS: DaemonMutationEnv = {
  claimMutation: "sessionWorkflow:claimPendingTurn",
  openSyntheticTurnMutation: "sessionWorkflow:openSyntheticTurn",
  completeSyntheticTurnMutation: "sessionWorkflow:completeSyntheticTurn",
  updateBackgroundAgentsMutation: "sessionWorkflow:updateBackgroundAgents",
};

export const TASK_CHAT_DAEMON_MUTATIONS: DaemonMutationEnv = {
  claimMutation: "agentTaskChatWorkflow:claimPendingTurn",
  openSyntheticTurnMutation: "agentTaskChatWorkflow:openSyntheticTurn",
  completeSyntheticTurnMutation: "agentTaskChatWorkflow:completeSyntheticTurn",
  updateBackgroundAgentsMutation:
    "agentTaskChatWorkflow:updateBackgroundAgents",
};

export const PROJECT_CHAT_DAEMON_MUTATIONS: DaemonMutationEnv = {
  claimMutation: "projectChatWorkflow:claimPendingTurn",
  openSyntheticTurnMutation: "projectChatWorkflow:openSyntheticTurn",
  completeSyntheticTurnMutation: "projectChatWorkflow:completeSyntheticTurn",
  updateBackgroundAgentsMutation: "projectChatWorkflow:updateBackgroundAgents",
};
