// The query cases the load test probes. Each case calls a real public query
// (the same `api.*` reference the web app subscribes to) as the focal user.
// Args come from the seeded refs, so every case touches the scaled data.
import { getFunctionName } from "convex/server";
import type { FunctionArgs, FunctionReference } from "convex/server";
import { z } from "zod";
import { api } from "../convex/_generated/api.js";
import type { Id, TableNames } from "../convex/_generated/dataModel.js";

function id<Table extends TableNames>() {
  return z.custom<Id<Table>>((value) => typeof value === "string");
}

/** Parses `_loadTest/seed:setup`'s return value at the HTTP boundary. */
export const seedRefsSchema = z.object({
  now: z.number(),
  userId: id<"users">(),
  teammateIds: z.array(id<"users">()),
  teamId: id<"teams">(),
  repoId: id<"githubRepos">(),
  shellRepoId: id<"githubRepos">(),
  sessionId: id<"sessions">(),
  mainChatId: id<"sessionChats">(),
  taskId: id<"agentTasks">(),
  projectId: id<"projects">(),
  docId: id<"docs">(),
  automationId: id<"automations">(),
});
export type SeedRefs = z.infer<typeof seedRefsSchema>;

const DAY = 24 * 60 * 60 * 1000;

/** `usage.summary` bucket; a function so the literal type does not widen to string. */
function dayBucket(): "day" {
  return "day";
}

function sessionOwner(sessionId: Id<"sessions">): { kind: "session"; sessionId: Id<"sessions"> } {
  return { kind: "session", sessionId };
}

type QueryCase = {
  /** Stable label; also the report key. */
  name: string;
  /** What the web app uses it for, for the report. */
  surface: string;
  /** "module:export", as the function log stream reports it. */
  functionName: string;
  run: (call: CallQuery, refs: SeedRefs) => Promise<unknown>;
};

export type CallQuery = <Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>,
) => Promise<unknown>;

function q<Query extends FunctionReference<"query">>(
  name: string,
  surface: string,
  query: Query,
  args: (refs: SeedRefs) => NoInfer<FunctionArgs<Query>>,
): QueryCase {
  return { name, surface, functionName: getFunctionName(query), run: (call, refs) => call(query, args(refs)) };
}

export const CASES: ReadonlyArray<QueryCase> = [
  q("auth.me", "every page", api.auth.me, () => ({})),
  q("githubRepos.list", "sidebar repo picker", api.githubRepos.list, () => ({})),
  q("githubRepos.countActiveSessions", "sidebar badges", api.githubRepos.countActiveSessions, () => ({})),
  q("githubRepos.listActiveSandboxCounts", "sidebar badges", api.githubRepos.listActiveSandboxCounts, () => ({})),
  q("sessions.list", "sessions sidebar", api.sessions.list, (r) => ({ repoId: r.repoId })),
  q("sessions.listRepos", "session header", api.sessions.listRepos, (r) => ({ sessionId: r.sessionId })),
  q("messages.listByParent", "chat transcript", api.messages.listByParent, (r) => ({ parentId: r.mainChatId })),
  // Opening a session: what `SessionDetailClient`, `ChatPanel` and `ChatBody`
  // subscribe to for the focal (heavy) chat.
  q("sessions.getByNumId", "session open", api.sessions.getByNumId, (r) => ({ repoId: r.repoId, numId: 1 })),
  q("sessions.get", "session open", api.sessions.get, (r) => ({ id: r.sessionId })),
  q("sessionChats.listForSession", "session open", api.sessionChats.listForSession, (r) => ({ sessionId: r.sessionId })),
  q("sessionChats.resolveForSession", "session open", api.sessionChats.resolveForSession, (r) => ({ sessionId: r.sessionId })),
  q("turns.listSessionChatStatuses", "session open", api.turns.listSessionChatStatuses, (r) => ({ sessionId: r.sessionId })),
  q("turns.getChatStatus", "session open", api.turns.getChatStatus, (r) => ({ entityId: r.mainChatId })),
  q("queuedMessages.listByParent", "session open", api.queuedMessages.listByParent, (r) => ({ parentId: r.mainChatId })),
  q("streaming.get", "session open", api.streaming.get, (r) => ({ entityId: r.mainChatId })),
  q("chatUi.listByParent", "session open", api.chatUi.listByParent, (r) => ({ parentId: r.mainChatId })),
  q("chatHtml.listByParent", "session open", api.chatHtml.listByParent, (r) => ({ parentId: r.mainChatId })),
  q("envVarRequests.listByParent", "session open", api.envVarRequests.listByParent, (r) => ({ parentId: r.mainChatId })),
  q("artifacts.listForChat", "session open", api.artifacts.listForChat, (r) => ({ parentId: r.mainChatId })),
  q("feedback.listForChat", "session open", api.feedback.listForChat, (r) => ({ parentId: r.mainChatId })),
  q("pendingQuestions.getActive", "session open", api.pendingQuestions.getActive, (r) => ({ entityId: r.mainChatId })),
  q("proposedPlans.listBySession", "session open", api.proposedPlans.listBySession, (r) => ({ sessionId: r.sessionId })),
  q("chatReads.isUnread", "session open", api.chatReads.isUnread, (r) => ({ parentId: r.mainChatId })),
  // What a chat paints from first: `TRANSCRIPT_TAIL_MESSAGES` (30) in the web
  // app's `useChatTranscript`. Compare with `messages.listByParent` above.
  q("messages.listByParent.tail", "session open", api.messages.listByParent, (r) => ({ parentId: r.mainChatId, tail: 30 })),
  q("pullRequests.listForOwner", "session PR chrome", api.pullRequests.listForOwner, (r) => ({ owner: sessionOwner(r.sessionId) })),
  q("projects.list", "projects page", api.projects.list, (r) => ({ repoId: r.repoId })),
  q("projects.listTaskProgress", "projects page", api.projects.listTaskProgress, (r) => ({ repoId: r.repoId })),
  q("projects.getActive", "repo home", api.projects.getActive, (r) => ({ repoId: r.repoId })),
  q("agentTasks.getAllTasks", "tasks board", api.agentTasks.getAllTasks, (r) => ({ repoId: r.repoId })),
  q("agentTasks.countSandboxTasks", "sidebar badge", api.agentTasks.countSandboxTasks, (r) => ({ repoId: r.repoId })),
  q("agentTasks.listDrafts", "tasks board", api.agentTasks.listDrafts, (r) => ({ repoId: r.repoId })),
  q("agentTasks.listByProject", "project page", api.agentTasks.listByProject, (r) => ({ projectId: r.projectId })),
  q("agentRuns.listByTask", "task page", api.agentRuns.listByTask, (r) => ({ taskId: r.taskId })),
  q("taskComments.listByTask", "task page", api.taskComments.listByTask, (r) => ({ taskId: r.taskId })),
  q("taskActivity.listByTask", "task page", api.taskActivity.listByTask, (r) => ({ taskId: r.taskId })),
  q("notifications.list", "inbox", api.notifications.list, () => ({})),
  q("notifications.countUnread", "inbox badge", api.notifications.countUnread, () => ({})),
  q("docs.list", "docs page", api.docs.list, (r) => ({ repoId: r.repoId })),
  q("docComments.listByDoc", "doc page", api.docComments.listByDoc, (r) => ({ docId: r.docId })),
  q("users.listAll", "assignee pickers", api.users.listAll, () => ({})),
  q("teamMembers.list", "team settings", api.teamMembers.list, (r) => ({ teamId: r.teamId })),
  q("chatLog.listForRepo", "log page", api.chatLog.listForRepo, (r) => ({ repoId: r.repoId })),
  q("automations.countUnreadAll", "sidebar badge", api.automations.countUnreadAll, () => ({})),
  q("automations.listRuns", "automation page", api.automations.listRuns, (r) => ({ automationId: r.automationId })),
  q("today.listStandups", "today page", api.today.listStandups, (r) => ({ repoId: r.repoId })),
  q("analytics.getImpactStats", "analytics page", api.analytics.getImpactStats, (r) => ({ repoId: r.repoId, startTime: r.now - 30 * DAY, previousStartTime: r.now - 60 * DAY })),
  q("analytics.getActivityTimeline", "analytics page", api.analytics.getActivityTimeline, (r) => ({ repoId: r.repoId, startTime: r.now - 30 * DAY, endTime: r.now, bucketSizeMs: DAY })),
  q("analytics.getActivityHeatmap", "analytics page", api.analytics.getActivityHeatmap, (r) => ({ repoId: r.repoId, startTime: r.now - 30 * DAY })),
  q("analytics.getLeaderboard", "analytics page", api.analytics.getLeaderboard, (r) => ({ repoId: r.repoId, startTime: r.now - 30 * DAY })),
  q("usage.summary", "usage page", api.usage.summary, (r) => ({ repoId: r.repoId, startTime: r.now - 30 * DAY, endTime: r.now, bucket: dayBucket() })),
  q("mentions.listData", "@-mention picker", api.mentions.listData, (r) => ({ repoId: r.repoId })),
  q("spotlight.search", "⌘K search", api.spotlight.search, () => ({ query: "session" })),
  q("routedThreads.countWaitingForMe", "sidebar badge", api.routedThreads.countWaitingForMe, () => ({})),
  q("routedThreads.listWaitingForMe", "inbox", api.routedThreads.listWaitingForMe, () => ({})),
  q("drafts.listForRepo", "composer", api.drafts.listForRepo, (r) => ({ repoId: r.repoId })),
];
