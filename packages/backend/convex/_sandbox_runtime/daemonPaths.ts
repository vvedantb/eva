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

/** The runner every daemon pidfile points at; its argv is the identity proof. */
export const CALLBACK_RUNNER_PATH = "/tmp/run-design.mjs";

/**
 * Defines `eva_pid_live <pidfile>`: true only when the pidfile names a LIVE
 * CALLBACK RUNNER, not merely a live pid.
 *
 * `kill -0` alone is unsound here because every marker under /tmp outlives a
 * Vercel stop/resume while the VM itself reboots and pid allocation restarts
 * from 1. The startup workflow then hands the daemon's recorded pid to one of
 * the services it spawns, and the dead daemon reads back as warm forever:
 * session 238 recorded pid 1172 before the stop, and the resume allocated
 * 974-1189 to vite, the Convex backend and the executor. `prewarmEntityDaemon`
 * logged "already warm" 20+ times over 45 minutes, nothing ever claimed a turn,
 * and three prompts died as "Turn stalled".
 *
 * `/proc/<pid>/cmdline` settles it — both the runner pidfile (`$!` of
 * `nohup flock … node /tmp/run-design.mjs`) and the daemon pidfile (the node
 * process's own pid) name {@link CALLBACK_RUNNER_PATH} in their argv, and a
 * recycled pid never does. An unreadable procfs degrades to the old `kill -0`
 * verdict rather than guessing.
 */
export const DAEMON_PID_LIVE_FN =
  `eva_pid_live() { p="$(cat "$1" 2>/dev/null)"; [ -n "$p" ] || return 1; ` +
  `kill -0 "$p" 2>/dev/null || return 1; ` +
  `[ -r "/proc/$p/cmdline" ] || return 0; ` +
  `tr '\\0' '\\n' < "/proc/$p/cmdline" | grep -q 'run-design[.]mjs'; }`;

/**
 * Watchdog probe: exits 0 only while the callback runner is live, unfinished
 * and not a zombie. `eva_pid_live` rather than a bare `kill -0`:
 * /tmp/run-design.pid survives a stop/resume, and the reboot re-issues pids
 * from 1, so an unguarded check reports a long-dead runner alive and the
 * watchdog grants grace forever (see {@link DAEMON_PID_LIVE_FN}).
 */
export const CALLBACK_LIVENESS_COMMAND = [
  DAEMON_PID_LIVE_FN,
  [
    "test ! -f /tmp/run-design.done",
    "eva_pid_live /tmp/run-design.pid",
    'pid="$(cat /tmp/run-design.pid)"',
    'state="$(ps -p "$pid" -o stat= 2>/dev/null | tr -d " ")"',
    'case "$state" in Z*) exit 1 ;; *) exit 0 ;; esac',
  ].join(" && "),
].join("; ");

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
      `eva_pid_live ${pid} && ` +
      `[ "$(cat ${entity} 2>/dev/null)" = ${entityIdLit} ]`
    );
  }

  function branch(paths: DaemonPaths): string {
    const branchBody = body.replace("__OPTS__", paths.opts);
    return `if ${condition(paths)}; then ${branchBody}`;
  }

  const scoped = entityDaemonPaths(entityIdField, entityId);
  const check =
    entityIdField === "sessionId"
      ? `${branch(scoped)}; ${branch(LEGACY_SESSION_DAEMON_PATHS).replace(/^if /, "elif ")}; else echo cold; fi`
      : `${branch(scoped)}; else echo cold; fi`;
  return `${DAEMON_PID_LIVE_FN}; ${check}`;
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
 *
 * `reap` goes through `eva_pid_live`, so a pidfile the reboot's pid allocation
 * re-issued to something else is unlinked rather than signalled. Without that
 * guard this SIGKILLs an innocent process tree — on a resumed sandbox the
 * likely victims are vite and the Convex backend (see {@link DAEMON_PID_LIVE_FN}).
 */
export function buildKillEntityDaemonCmd(
  entityIdField: string,
  entityId: string,
): string {
  const parts = [
    DAEMON_PID_LIVE_FN,
    `kill_tree() { kids="$(pgrep -P "$1" 2>/dev/null)"; kill -"$2" "$1" 2>/dev/null || true; for c in $kids; do kill_tree "$c" "$2"; done; }`,
    `reap() { eva_pid_live "$1" || return 0; pid="$(cat "$1" 2>/dev/null)"; kill_tree "$pid" TERM; for i in $(seq 1 15); do kill -0 "$pid" 2>/dev/null || return 0; sleep 0.2; done; kill_tree "$pid" KILL; }`,
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
