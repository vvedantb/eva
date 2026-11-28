import { ENTITY_ID_FIELD, REPO_CHECKOUT_DIRS, RUN_ID } from "../config.js";
import type { JsonObject } from "../types.js";
import { readGitHeadSha } from "../utils.js";
import { readCurrentBranch } from "./gitExec.js";

type RepoSha = { path: string; sha: string };

let turnStartSha = "";
let turnStartShas: RepoSha[] = [];

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

/**
 * Stamps `beforeSha`/`afterSha` onto a completion payload. Must run AFTER
 * `persistTurnWork()` so `afterSha` includes the turn-end auto-commit. Skipped
 * for automation runs (`RUN_ID`) and non-eva branches, mirroring
 * persistTurnWork: those turns have no session-owned commits to diff or
 * restore.
 *
 * Chat turns only (`chatId`): session, quick-task and project chats persist
 * the shas onto the assistant message, task runs included (a task run is a
 * chat turn). Every other entity kind (the one-shot agents, which launch
 * with `entityId`) is excluded — untested here, and some never run on an
 * `eva/` branch at all. Every completion receiver spreads
 * `turnCheckpointArgs`, so another surface would be accepted but would drop
 * the shas; it should only stamp once its persistence path is in place.
 */
export function appendTurnCheckpoint(args: JsonObject): void {
  if (ENTITY_ID_FIELD !== "chatId") return;
  if (RUN_ID || turnStartSha === "") return;
  if (!readCurrentBranch().startsWith("eva/")) return;
  const afterSha = readGitHeadSha();
  if (afterSha === "") return;
  args.beforeSha = turnStartSha;
  args.afterSha = afterSha;
  args.beforeShas = turnStartShas;
  args.afterShas = readAllRepoShas();
}
