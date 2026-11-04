import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { resolveSessionBaseBranch } from "./baseBranch";
import { buildEditPrompt } from "./prompts";
import { resolveMessageTokens } from "../_mentions/resolveMessageTokens";
import { bareHarnessCommandPrompt } from "../_mentions/bareHarnessCommand";
import { resolveExperimentalFlags } from "../_auth/experimentalFlags";
import { buildCustomInstructionsBlock } from "../prompts";
import { listReadableSiblingRepos } from "../_githubRepos/sandboxRead";
import { prependModelHandoffContext } from "../_shared/modelHandoff";
import { listLiveSessionChats } from "../_sessionChats/helpers";

// --- Turn config ---

/**
 * Tools every session turn may use. Skill is required so the harness can invoke
 * Eva's system skills (eva-plan, eva-design, eva-ask, eva-capture, eva-audit, eva-grab-proof,
 * eva-resolve-conflicts), which is
 * how planning and design work now that turn modes are gone.
 */
export const SESSION_TOOLS = "Read,Write,Edit,Bash,Glob,Grep,Skill";

/**
 * Added to a turn's prompt while the session has more than one open chat.
 * Deliberately not a sibling summary (what the other chats are doing) — only
 * the one fact an agent sharing a working tree needs.
 */
const PARALLEL_CHATS_NOTE =
  "Other chats in this session may edit this checkout at the same time. Do not revert changes you did not make.";

/**
 * Builds the agent prompt for a chat turn (doc `@` mentions resolved, custom
 * instructions + system prompt folded in). Shared single source of truth so
 * both the workflow's `getSessionData` query and the daemon-pull `startExecute`
 * mutation produce byte-identical prompts — the daemon must run exactly what
 * the workflow would have handed it, never a second variant. Takes
 * already-fetched session/chat/repo/user docs so it works from either a query
 * or a mutation context (MutationCtx satisfies QueryCtx for the read-only
 * mention resolution).
 */
export async function buildSessionPrompt(
  ctx: QueryCtx,
  args: {
    session: Doc<"sessions">;
    chat: Doc<"sessionChats">;
    repo: Doc<"githubRepos">;
    user: Doc<"users"> | null;
    message: string;
    /** Model this turn runs on; decides whether a handoff catch-up is needed. */
    model: string;
  },
): Promise<{ prompt: string; branchName: string }> {
  const { session, chat, repo, user } = args;
  const [liveChats, { resolvedMessage, prefixBlock }] = await Promise.all([
    listLiveSessionChats(ctx.db, session._id),
    resolveMessageTokens(ctx, args.message, session.repoId),
  ]);
  const parallelNote =
    liveChats.length > 1 ? `\n\n${PARALLEL_CHATS_NOTE}` : "";
  const rootDirectory = repo.rootDirectory ?? "";
  const customInstructionsBlock = buildCustomInstructionsBlock(
    user?.role ?? undefined,
    user?.customInstructions ?? undefined,
  );

  const branchName = session.branchName || `eva/session-${session._id}`;

  const bareCommand = bareHarnessCommandPrompt(resolvedMessage, args.model);
  if (bareCommand !== null) return { prompt: bareCommand, branchName };

  // Sibling repositories this sandbox's git credentials can read (owner is the
  // session owner, whose access the credential helper mints tokens against).
  // Cursor resumes the saved SDK agent; the Eva transcript is not stuffed
  // in as a rotation handoff. Session plan.md / planContent is not injected —
  // that was the old Plan/Build mode contract.
  const [readableRepos, linkedRepoRows] = await Promise.all([
    listReadableSiblingRepos(ctx.db, session.userId, repo._id),
    ctx.db
      .query("sessionRepos")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect(),
  ]);
  const linkedRepos = linkedRepoRows.map((row) => ({
    owner: row.owner,
    name: row.name,
    path: row.path,
    branchName: row.branchName,
    baseBranch: row.baseBranch,
  }));
  let prompt = buildEditPrompt(
    {
      owner: repo.owner,
      name: repo.name,
      baseBranch: resolveSessionBaseBranch(session, repo),
    },
    branchName,
    "",
    resolvedMessage,
    rootDirectory,
    customInstructionsBlock,
    repo.systemPrompt,
    session.devPort ?? repo.devPort,
    [],
    readableRepos,
    linkedRepos,
    {
      ownerKey: `session-${session._id}`,
      prUrl: session.prUrl,
      devCommand: session.devCommand ?? repo.devCommand,
      startupCommands: repo.startupCommands,
      backgroundCommands: repo.backgroundCommands,
      agentMemoryEnabled: repo.agentMemoryEnabled,
      askTeammatesEnabled: resolveExperimentalFlags(user).askTeammates,
      prWatchEnabled: resolveExperimentalFlags(user).prWatch,
    },
  );
  prompt = `${prompt}${parallelNote}`;
  if (prefixBlock) {
    prompt = `${prefixBlock}\n\n${prompt}`;
  }
  // Last, so the catch-up block leads the whole prompt.
  prompt = await prependModelHandoffContext(
    ctx,
    chat._id,
    args.model,
    chat.provider,
    prompt,
  );
  return { prompt, branchName };
}
