import { v } from "convex/values";
import { authQuery } from "./functions";
import {
  chatTurnFlagsForRepos,
  sessionIsExecuting,
} from "./_chat/turnProjection";
import { gatherAccessibleRepos } from "./_githubRepos/helpers";
import { repoLabel, sessionWebPath } from "./_mobile/chatTarget";
import { listRepoSessionsByArchive } from "./_sessions/archive";
import { prStateValidator, sessionStatusValidator } from "./validators";

/**
 * @deprecated The phone's old API names, kept for installed APKs: each is the
 * `chats.*` function under its old name (`chats.ts`), plus the old session
 * list. Remove once no supported APK calls them (the app offers updates; see
 * `src/update/UpdateDialog.tsx`).
 */
export {
  archive as archiveSession,
  get as getChat,
  send as sendMessage,
  setModel as setChatModel,
  start as startSession,
  stop as stopTurn,
} from "./chats";

const SESSIONS_PER_REPO = 15;
const CHAT_LIST_LIMIT = 60;

/**
 * Recent sessions across every repo the user can access, newest first: open
 * ones by default, archived ones with `archived: true` (the web Active and
 * Archived tabs).
 *
 * @deprecated Kept only for old APKs (up to 0.1.43). The phone Sessions tab
 * now reads the web's own `githubRepos.list` plus a per-repo `sessions.list`
 * / `sessions.listArchived`. Remove once no supported APK calls it.
 */
export const listChats = authQuery({
  args: { archived: v.optional(v.boolean()) },
  returns: v.array(
    v.object({
      sessionId: v.id("sessions"),
      title: v.string(),
      repoId: v.id("githubRepos"),
      repoLabel: v.string(),
      status: sessionStatusValidator,
      updatedAt: v.number(),
      isAwaitingAnswer: v.boolean(),
      isExecuting: v.boolean(),
      prUrl: v.optional(v.string()),
      prState: v.optional(prStateValidator),
      branchName: v.optional(v.string()),
      webPath: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const repos = await gatherAccessibleRepos(ctx.db, ctx.userId, false);
    const perRepo = await Promise.all(
      repos.map(async (repo) => {
        const sessions = await listRepoSessionsByArchive(
          ctx.db,
          repo._id,
          args.archived === true,
          SESSIONS_PER_REPO,
        );
        return sessions.map((session) => ({ session, repo }));
      }),
    );
    const rows = perRepo
      .flat()
      .map((row) => ({
        ...row,
        updatedAt: row.session.updatedAt ?? row.session._creationTime,
      }))
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, CHAT_LIST_LIMIT);
    const { openIds, awaitingAnswerIds } = await chatTurnFlagsForRepos(
      ctx.db,
      rows.map((row) => row.repo._id),
    );
    return rows.map(({ session, repo, updatedAt }) => ({
      sessionId: session._id,
      title: session.title,
      repoId: repo._id,
      repoLabel: repoLabel(repo),
      status: session.status,
      updatedAt,
      isAwaitingAnswer: awaitingAnswerIds.has(String(session._id)),
      isExecuting: sessionIsExecuting(session, openIds),
      prUrl: session.prUrl,
      prState: session.prState,
      branchName: session.branchName,
      webPath: sessionWebPath(repo, session),
    }));
  },
});
