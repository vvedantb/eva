import { spawnSync } from "child_process";
import {
  ENTITY_ID_FIELD,
  REPO_CHECKOUT_DIRS,
  RUN_ID,
  WORK_DIR,
} from "../config.js";
import type { JsonObject } from "../types.js";
import { readGitHeadSha } from "../utils.js";

/**
 * Turn checkpoint: the sandbox HEAD when a turn started and after
 * persistTurnWork committed/pushed at its end. Both shas ride on the completion
 * mutation (optional args, so old bundles and new servers stay compatible) and
 * land on the assistant message, where "Diff this turn" and "Restore to before
 * this turn" read them. Pushed commits are the only durable store — the VM
 * filesystem is not — so no hidden refs are kept.
 *
 * `beforeShas`/`afterShas` are the multi-repo extension: one `{ path, sha }`
 * entry per checked-out repo (primary first, then linked repos), so a
 * multi-repo session can diff/restore every repo it touched, not just the
 * primary. Sent alongside the scalar `beforeSha`/`afterSha` — which stay
 * primary-only — so old Convex deployments that don't know about the array
 * fields keep working.
 */
type RepoSha = { path: string; sha: string };

let turnStartSha = "";
let turnStartShas: RepoSha[] = [];

/** Reads `{ path, sha }` for every checked-out repo, skipping unreadable dirs. */
function readAllRepoShas(): RepoSha[] {
  const shas: RepoSha[] = [];
  for (const path of REPO_CHECKOUT_DIRS) {
    const sha = readGitHeadSha(path);
    if (sha === "") continue;
    shas.push({ path, sha });
  }
  return shas;
}

/** Records HEAD at turn start. Call once per turn, before the provider runs. */
export function beginTurnCheckpoint(): void {
  turnStartSha = readGitHeadSha();
  turnStartShas = readAllRepoShas();
}

export function resetTurnCheckpoint(): void {
  turnStartSha = "";
  turnStartShas = [];
}

function currentBranch(): string {
  const result = spawnSync(
    "git",
    ["-C", WORK_DIR, "rev-parse", "--abbrev-ref", "HEAD"],
    { encoding: "utf8", timeout: 20_000 },
  );
  return result.status === 0 ? (result.stdout || "").trim() : "";
}

/**
 * Stamps `beforeSha`/`afterSha` onto a completion payload. Must run AFTER
 * `persistTurnWork()` so `afterSha` includes the turn-end auto-commit. Skipped
 * for task runs and non-eva branches, mirroring persistTurnWork: those turns
 * have no session-owned commits to diff or restore.
 *
 * Sessions only: `sessionWorkflow:handleCompletion` is the one completion
 * mutation that accepts the shas (messageFields.beforeSha). Task and project
 * chat turns also run on `eva/` branches with no RUN_ID, so without this gate
 * their completion payload carried an `afterSha` the Convex args validator
 * rejected and the turn never finished (prod, 2026-09-02).
 */
export function appendTurnCheckpoint(args: JsonObject): void {
  if (ENTITY_ID_FIELD !== "sessionId") return;
  if (RUN_ID || turnStartSha === "") return;
  if (!currentBranch().startsWith("eva/")) return;
  const afterSha = readGitHeadSha();
  if (afterSha === "") return;
  args.beforeSha = turnStartSha;
  args.afterSha = afterSha;
  args.beforeShas = turnStartShas;
  args.afterShas = readAllRepoShas();
}
