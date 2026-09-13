"use node";

import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { execHandle, getSandboxHandle } from "./helpers";
import { assertActionSandboxAccess } from "../functions";
import { isSandboxIdentity } from "../_auth/sandboxIdentity";

/** Static POSIX ps snapshot used for reconcile matching (no user input). */
const PS_SNAPSHOT_CMD = "ps -wweo pid=,ppid=,etimes=,args=";

const PROBE_MAX_CHARS = 160;
const AGE_SLACK_SEC = 120;

type PsRow = {
  pid: number;
  ppid: number;
  etimes: number;
  args: string;
};

type RunningRow = Doc<"backgroundProcesses">;

/** Parse `ps -wweo pid=,ppid=,etimes=,args=` into typed rows. */
export function parsePsTable(output: string): PsRow[] {
  const rows: PsRow[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(trimmed);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const etimes = Number(match[3]);
    const args = match[4] ?? "";
    if (
      !Number.isFinite(pid) ||
      !Number.isFinite(ppid) ||
      !Number.isFinite(etimes)
    ) {
      continue;
    }
    rows.push({ pid, ppid, etimes, args });
  }
  return rows;
}

/** First line of the command, capped — used as a substring probe against ps args. */
export function commandProbe(command: string): string {
  const firstLine = command.split("\n")[0] ?? "";
  return firstLine.slice(0, PROBE_MAX_CHARS);
}

/** Collect pid + all descendants via ppid closure. */
export function collectDescendants(
  roots: ReadonlyArray<number>,
  table: ReadonlyArray<PsRow>,
): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const row of table) {
    const siblings = childrenByParent.get(row.ppid);
    if (siblings) {
      siblings.push(row.pid);
    } else {
      childrenByParent.set(row.ppid, [row.pid]);
    }
  }
  const out: number[] = [];
  const seen = new Set<number>();
  const queue = [...roots];
  while (queue.length > 0) {
    const pid = queue.shift();
    if (pid === undefined || seen.has(pid)) continue;
    seen.add(pid);
    out.push(pid);
    const children = childrenByParent.get(pid);
    if (children) {
      for (const child of children) {
        queue.push(child);
      }
    }
  }
  return out;
}

function isExcludedPsRow(row: PsRow): boolean {
  if (row.pid === 1) return true;
  if (row.args.includes("run-design.mjs")) return true;
  if (/(^|\s)ps(\s|$)/.test(row.args)) return true;
  return false;
}

/**
 * Match running Convex rows to ps roots. Oldest-first exclusive claim: each
 * candidate process is assigned to at most one row.
 */
export function matchRowsToRoots(
  rows: ReadonlyArray<RunningRow>,
  table: ReadonlyArray<PsRow>,
  nowMs: number,
  excludePids: ReadonlySet<number> = new Set(),
): Map<Id<"backgroundProcesses">, number | null> {
  const claimed = new Set<number>(excludePids);
  const result = new Map<Id<"backgroundProcesses">, number | null>();
  const ordered = [...rows].toSorted((a, b) => a.startedAt - b.startedAt);

  for (const row of ordered) {
    const probe = commandProbe(row.command);
    if (!probe) {
      result.set(row._id, null);
      continue;
    }
    const maxAgeSec =
      Math.floor((nowMs - row.startedAt) / 1000) + AGE_SLACK_SEC;
    let matched: number | null = null;
    for (const ps of table) {
      if (claimed.has(ps.pid) || isExcludedPsRow(ps)) continue;
      if (ps.etimes > maxAgeSec) continue;
      if (!ps.args.includes(probe)) continue;
      matched = ps.pid;
      claimed.add(ps.pid);
      break;
    }
    result.set(row._id, matched);
  }
  return result;
}

function buildKillCommand(pids: ReadonlyArray<number>): string | null {
  const numeric = pids.filter((pid) => Number.isInteger(pid) && pid > 0);
  if (numeric.length === 0) return null;
  const list = numeric.join(" ");
  return (
    `kill -TERM ${list} 2>/dev/null || true; ` +
    `sleep 2; ` +
    `kill -KILL ${list} 2>/dev/null || true`
  );
}

/**
 * Client-triggered liveness check: one static ps exec, match in TS, patch rows.
 * Never execs against a non-active / non-running sandbox (Vercel resume hazard).
 */
export const reconcileBackgroundProcesses = action({
  args: { sessionId: v.id("sessions") },
  returns: v.object({
    running: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (isSandboxIdentity(identity)) throw new Error("Not authorized");

    const session = await ctx.runQuery(api.sessions.get, {
      id: args.sessionId,
    });
    if (!session) throw new Error("Not authorized");

    const runningRows = await ctx.runQuery(
      internal.backgroundProcesses.listRunningInternal,
      { sessionId: args.sessionId },
    );
    if (runningRows.length === 0) {
      return { running: 0 };
    }

    const sandboxId = session.sandboxId;
    if (session.status !== "active" || !sandboxId) {
      await ctx.runMutation(
        internal.backgroundProcesses.markAllExitedForSession,
        { sessionId: args.sessionId },
      );
      return { running: 0 };
    }
    await assertActionSandboxAccess(ctx, session.repoId, sandboxId);

    const handle = await getSandboxHandle(ctx, session.repoId, sandboxId);
    if (handle.state !== "running") {
      await ctx.runMutation(
        internal.backgroundProcesses.markAllExitedForSession,
        { sessionId: args.sessionId },
      );
      return { running: 0 };
    }

    const psOutput = await execHandle(handle, PS_SNAPSHOT_CMD, 15);
    const table = parsePsTable(psOutput);
    const matches = matchRowsToRoots(runningRows, table, Date.now());

    const updates: Array<{
      id: Id<"backgroundProcesses">;
      pid?: number;
      status: "running" | "exited";
    }> = [];
    let stillRunning = 0;
    for (const row of runningRows) {
      const pid = matches.get(row._id);
      if (pid === undefined || pid === null) {
        updates.push({ id: row._id, status: "exited" });
      } else {
        stillRunning += 1;
        updates.push({ id: row._id, pid, status: "running" });
      }
    }
    await ctx.runMutation(internal.backgroundProcesses.applyReconcile, {
      updates,
    });
    return { running: stillRunning };
  },
});

/**
 * Kill one background process via ppid-closure TERM → grace → KILL.
 * Kill set is numeric pids only; never pgid/pattern kills.
 */
export const killBackgroundProcess = action({
  args: { id: v.id("backgroundProcesses") },
  returns: v.object({
    outcome: v.union(
      v.literal("killed"),
      v.literal("already_exited"),
      v.literal("sandbox_stopped"),
    ),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (isSandboxIdentity(identity)) throw new Error("Not authorized");

    const row = await ctx.runQuery(internal.backgroundProcesses.getInternal, {
      id: args.id,
    });
    if (!row) {
      return { outcome: "already_exited" as const };
    }
    if (row.status !== "running") {
      return { outcome: "already_exited" as const };
    }

    const session = await ctx.runQuery(api.sessions.get, {
      id: row.sessionId,
    });
    if (!session) throw new Error("Not authorized");

    const sandboxId = session.sandboxId;
    if (session.status !== "active" || !sandboxId) {
      await ctx.runMutation(internal.backgroundProcesses.markOutcome, {
        id: args.id,
        status: "exited",
      });
      return { outcome: "sandbox_stopped" as const };
    }
    await assertActionSandboxAccess(ctx, session.repoId, sandboxId);

    const handle = await getSandboxHandle(ctx, session.repoId, sandboxId);
    if (handle.state !== "running") {
      await ctx.runMutation(internal.backgroundProcesses.markOutcome, {
        id: args.id,
        status: "exited",
      });
      return { outcome: "sandbox_stopped" as const };
    }

    const psOutput = await execHandle(handle, PS_SNAPSHOT_CMD, 15);
    const table = parsePsTable(psOutput);
    const probe = commandProbe(row.command);

    let rootPid: number | null = null;
    if (row.pid !== undefined) {
      const stored = table.find((ps) => ps.pid === row.pid);
      if (
        stored &&
        !isExcludedPsRow(stored) &&
        probe.length > 0 &&
        stored.args.includes(probe)
      ) {
        rootPid = stored.pid;
      }
    }

    if (rootPid === null) {
      const siblings = await ctx.runQuery(
        internal.backgroundProcesses.listRunningInternal,
        { sessionId: row.sessionId },
      );
      const exclude = new Set<number>();
      for (const sibling of siblings) {
        if (
          sibling._id !== row._id &&
          sibling.pid !== undefined &&
          Number.isInteger(sibling.pid)
        ) {
          exclude.add(sibling.pid);
        }
      }
      const matches = matchRowsToRoots([row], table, Date.now(), exclude);
      const matched = matches.get(row._id);
      rootPid = matched === undefined ? null : matched;
    }

    if (rootPid === null) {
      await ctx.runMutation(internal.backgroundProcesses.markOutcome, {
        id: args.id,
        status: "exited",
      });
      return { outcome: "already_exited" as const };
    }

    const killPids = collectDescendants([rootPid], table);
    const killCmd = buildKillCommand(killPids);
    if (killCmd) {
      await execHandle(handle, killCmd, 15);
    }

    await ctx.runMutation(internal.backgroundProcesses.markOutcome, {
      id: args.id,
      status: "killed",
      pid: rootPid,
    });
    return { outcome: "killed" as const };
  },
});
