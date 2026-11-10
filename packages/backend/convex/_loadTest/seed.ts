// Deterministic load-test seeder. Run only by `loadtest/run.ts` against a
// throwaway local backend; every entry point refuses to run unless the
// deployment has EVA_LOAD_TEST=1.
//
// Scale model (scale = N, documented in loadtest/README.md):
// - Per-team, per-repo and per-user fan-outs are `base × N`.
// - Per-entity fan-outs (messages per chat, runs per task, comments per doc)
//   are `base × N` for the focal entity only, and stay at base elsewhere.
//   Scaling every entity's children would grow as N² and test nothing real.
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";

type SeedDb = Pick<MutationCtx["db"], "insert">;
import type { Id } from "../_generated/dataModel";
import { DAILY_STANDUP_KEY } from "../_automations/systemAutomations";

export const FOCAL_CLERK_ID = "loadtest_focal_user";

/** Rows per `N`. The chunk kinds below insert `count` units of each. */
export const SEED_UNITS = {
  teammates: 5,
  shellRepos: 3,
  sessions: 30,
  projects: 5,
  quickTasks: 15,
  docs: 10,
  automations: 3,
  focalMessages: 40,
  focalRuns: 10,
  focalTaskTimeline: 10,
  focalDocComments: 10,
  focalSessionPrs: 5,
  focalAutomationRuns: 20,
  routedThreads: 10,
} as const;

/** Upper bound of documents one unit inserts, to size chunks. */
const DOCS_PER_UNIT: Record<SeedChunkKind, number> = {
  teammates: 2,
  shellRepos: 1,
  sessions: 16,
  projects: 26,
  quickTasks: 8,
  docs: 1,
  automations: 2,
  // One document, but about 13 KB with its activity log: 4 keeps a chunk of
  // 250 messages near 3 MiB, under the 16 MiB a mutation may write.
  focalMessages: 4,
  focalRuns: 1,
  focalTaskTimeline: 2,
  focalDocComments: 1,
  focalSessionPrs: 1,
  focalAutomationRuns: 1,
  routedThreads: 3,
};

const SEED_KINDS: ReadonlyArray<SeedChunkKind> = [
  "teammates", "shellRepos", "sessions", "projects", "quickTasks", "docs",
  "automations", "focalMessages", "focalRuns", "focalTaskTimeline",
  "focalDocComments", "focalSessionPrs", "focalAutomationRuns", "routedThreads",
];

export const seedChunkKindValidator = v.union(
  v.literal("teammates"),
  v.literal("shellRepos"),
  v.literal("sessions"),
  v.literal("projects"),
  v.literal("quickTasks"),
  v.literal("docs"),
  v.literal("automations"),
  v.literal("focalMessages"),
  v.literal("focalRuns"),
  v.literal("focalTaskTimeline"),
  v.literal("focalDocComments"),
  v.literal("focalSessionPrs"),
  v.literal("focalAutomationRuns"),
  v.literal("routedThreads"),
);
export type SeedChunkKind = Infer<typeof seedChunkKindValidator>;

export const seedRefsValidator = v.object({
  now: v.number(),
  userId: v.id("users"),
  teammateIds: v.array(v.id("users")),
  teamId: v.id("teams"),
  repoId: v.id("githubRepos"),
  shellRepoId: v.id("githubRepos"),
  sessionId: v.id("sessions"),
  mainChatId: v.id("sessionChats"),
  taskId: v.id("agentTasks"),
  projectId: v.id("projects"),
  docId: v.id("docs"),
  automationId: v.id("automations"),
});
type SeedRefs = Infer<typeof seedRefsValidator>;

const DAY = 24 * 60 * 60 * 1000;

function assertLoadTestDeployment() {
  if (process.env.EVA_LOAD_TEST !== "1") {
    throw new Error("Load-test seeding is disabled on this deployment");
  }
}

/** Realistic-size text so read bytes reflect production rows. */
function filler(seed: number, length: number): string {
  const words = [
    "refactor", "sandbox", "convex", "query", "index", "session", "preview",
    "deploy", "review", "branch", "commit", "agent", "schema", "migration",
  ];
  const out: Array<string> = [];
  let size = 0;
  for (let i = 0; size < length; i++) {
    const word = words[(seed * 7 + i * 13) % words.length] ?? "eva";
    out.push(word);
    size += word.length + 1;
  }
  return out.join(" ").slice(0, length);
}

/**
 * Activity-log sizes (bytes) for the focal chat's assistant messages, cycled.
 * Mean 25.6 KB, matched to production on 2026-11-09 (600 newest messages:
 * median 8.8 KB, p90 84 KB, p99 294 KB; the heaviest chat averaged 26 KB per
 * assistant message). The heavy tail matters: a few turns hold most bytes.
 */
const ACTIVITY_LOG_BYTES = [
  2_000, 4_000, 6_000, 8_000, 9_000, 11_000, 16_000, 30_000, 60_000, 110_000,
] as const;

/**
 * A step-array activity log of about `bytes`, shaped like the callback
 * parsers' output (`callback-src/parse/toolSteps.ts`). About half the bytes
 * are expanded-only detail (`output`, `edits`), which
 * `trimActivityLogForTranscript` drops, as on real transcripts.
 */
function activityLog(seed: number, bytes: number): string {
  const steps: Array<string> = [];
  let size = 2;
  for (let i = 0; size < bytes; i++) {
    const path = `apps/web/src/lib/components/chat/File${(seed + i) % 97}.tsx`;
    const kind = i % 4;
    const step =
      kind === 0
        ? {
            type: "bash",
            label: "Running command...",
            detail: filler(seed + i, 120),
            command: filler(seed + i, 200),
            status: "complete",
            output: { text: filler(seed + i + 1, 700), exitCode: 0 },
          }
        : kind === 1
          ? { type: "read", label: "Reading file...", detail: path, path, status: "complete" }
          : kind === 2
            ? {
                type: "edit",
                label: "Editing file...",
                detail: path,
                path,
                status: "complete",
                edits: [{ oldText: filler(seed + i, 300), newText: filler(seed + i + 2, 300) }],
              }
            : { type: "thinking", label: "Thinking...", detail: filler(seed + i, 500), status: "complete" };
    const json = JSON.stringify(step);
    steps.push(json);
    size += json.length + 1;
  }
  return `[${steps.join(",")}]`;
}

/**
 * Sub-agent roster on a task or project row, about 850 bytes: the production
 * average for `backgroundAgents` (400 newest tasks, 10 November 2026). List
 * queries drop it, so it shows in bytes returned.
 */
function backgroundAgents(seed: number, startedAt: number) {
  return Array.from({ length: 5 }, (_, i) => ({
    toolUseId: `toolu_loadtest_${seed}_${i}_${"x".repeat(12)}`,
    taskId: `b${seed}${i}loadtest`,
    description: filler(seed + i, 60),
    status: "completed",
    startedAt: startedAt + i * 1000,
    settledAt: startedAt + i * 1000 + 30_000,
  }));
}

/** Spread timestamps across the last 60 days, newest last. */
function ago(now: number, i: number, total: number): number {
  return now - Math.floor(((total - i) / Math.max(total, 1)) * 60 * DAY);
}

const TASK_STATUSES = [
  "draft", "todo", "in_progress", "code_review", "business_review",
  "done", "done", "done", "done", "cancelled",
] as const;

export const setup = internalMutation({
  args: { now: v.number() },
  returns: seedRefsValidator,
  handler: async (ctx, { now }) => {
    assertLoadTestDeployment();
    const db = ctx.db;
    const userId = await db.insert("users", {
      clerkId: FOCAL_CLERK_ID,
      email: "focal@loadtest.invalid",
      fullName: "Focal User",
    });
    const teamId = await db.insert("teams", {
      name: "Load test team",
      createdBy: userId,
      createdAt: now - 90 * DAY,
    });
    await db.insert("teamMembers", {
      teamId,
      userId,
      role: "owner",
      joinedAt: now - 90 * DAY,
    });
    const teammateIds: Array<Id<"users">> = [];
    for (let i = 0; i < 4; i++) {
      teammateIds.push(await insertTeammate(db, teamId, i, now));
    }
    const repoId = await db.insert("githubRepos", {
      owner: "loadtest",
      name: "focal-repo",
      installationId: 1,
      teamId,
      connectedBy: userId,
    });
    const shellRepoId = await db.insert("githubRepos", {
      owner: "loadtest",
      name: "shell-repo-0",
      installationId: 1,
      teamId,
    });
    const sessionId = await db.insert("sessions", {
      repoId,
      userId,
      title: "Focal session",
      numId: 1,
      status: "active",
      lastTurnFinishedAt: now - 3_600_000,
    });
    const mainChatId = await db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
    });
    const projectId = await db.insert("projects", {
      repoId,
      userId,
      title: "Focal project",
      rawInput: filler(1, 400),
      phase: "in_progress",
      planningMode: "interview",
      lastTurnFinishedAt: now - DAY,
    });
    await db.insert("projectDetails", {
      projectId,
      conversationHistory: [{ role: "user", content: filler(2, 600) }],
    });
    const taskId = await db.insert("agentTasks", {
      title: "Focal task",
      createdAt: now - 10 * DAY,
      updatedAt: now - DAY,
      createdBy: userId,
      status: "in_progress",
      repoId,
      projectId,
    });
    await db.insert("agentTaskRunSummaries", {
      taskId,
      repoId,
      lastRunStartedAt: now - DAY,
    });
    const docId = await db.insert("docs", {
      repoId,
      title: "Focal doc",
      content: filler(3, 2000),
      createdAt: now - 5 * DAY,
      updatedAt: now - DAY,
      sourceKind: "session",
      sourceSessionId: sessionId,
    });
    const automationId = await db.insert("automations", {
      repoId,
      title: "Daily standup",
      description: "Standup",
      cronSchedule: "0 9 * * *",
      enabled: true,
      createdBy: userId,
      createdAt: now - 60 * DAY,
      updatedAt: now - 60 * DAY,
      systemKey: DAILY_STANDUP_KEY,
    });
    return {
      now,
      userId,
      teammateIds,
      teamId,
      repoId,
      shellRepoId,
      sessionId,
      mainChatId,
      taskId,
      projectId,
      docId,
      automationId,
    };
  },
});

async function insertTeammate(
  db: SeedDb,
  teamId: Id<"teams">,
  i: number,
  now: number,
): Promise<Id<"users">> {
  const userId = await db.insert("users", {
    clerkId: `loadtest_teammate_${i}`,
    email: `teammate${i}@loadtest.invalid`,
    fullName: `Teammate ${i}`,
  });
  await db.insert("teamMembers", {
    teamId,
    userId,
    role: "member",
    joinedAt: now - 30 * DAY,
  });
  return userId;
}

/** Inserts units [start, start + count) of one kind. */
export const chunk = internalMutation({
  args: {
    kind: seedChunkKindValidator,
    start: v.number(),
    count: v.number(),
    total: v.number(),
    refs: seedRefsValidator,
  },
  returns: v.record(v.string(), v.number()),
  handler: async (ctx, { kind, start, count, total, refs }) => {
    assertLoadTestDeployment();
    const inserted: Record<string, number> = {};
    const insert: SeedDb["insert"] = (table, value) => {
      inserted[table] = (inserted[table] ?? 0) + 1;
      return ctx.db.insert(table, value);
    };
    for (let i = start; i < start + count; i++) {
      await SEEDERS[kind]({ insert }, refs, i, total);
    }
    return inserted;
  },
});

/** Chunk plan for the runner: units per N, and units per mutation call. */
export const plan = internalQuery({
  args: {},
  returns: v.array(
    v.object({ kind: seedChunkKindValidator, unitsPerScale: v.number(), unitsPerChunk: v.number() }),
  ),
  handler: async () =>
    SEED_KINDS.map((kind) => ({
      kind,
      unitsPerScale: SEED_UNITS[kind],
      // Keep each mutation well under the 8,192 documents-written limit.
      unitsPerChunk: Math.max(1, Math.floor(1000 / DOCS_PER_UNIT[kind])),
    })),
});

type Seeder = (
  db: SeedDb,
  refs: SeedRefs,
  i: number,
  total: number,
) => Promise<void>;

function teammate(refs: SeedRefs, i: number): Id<"users"> {
  return refs.teammateIds[i % refs.teammateIds.length] ?? refs.userId;
}

async function insertTaskWithChildren(
  db: SeedDb,
  refs: SeedRefs,
  i: number,
  total: number,
  projectId: Id<"projects"> | undefined,
) {
  const { now, repoId, userId } = refs;
  const status = TASK_STATUSES[i % TASK_STATUSES.length] ?? "todo";
  const createdAt = ago(now, i, total);
  const taskId = await db.insert("agentTasks", {
    title: `Task ${i}: ${filler(i, 40)}`,
    description: filler(i + 1, 600),
    createdAt,
    updatedAt: createdAt + DAY,
    createdBy: status === "draft" && i % 3 !== 0 ? teammate(refs, i) : userId,
    status,
    repoId,
    projectId,
    taskNumber: i,
    backgroundAgents: backgroundAgents(i, createdAt),
    ...(status === "draft" ? {} : { lastTurnFinishedAt: createdAt + DAY }),
    ...(i % 10 === 7 ? { deletedAt: createdAt + 2 * DAY } : {}),
  });
  await db.insert("agentTaskRunSummaries", {
    taskId,
    repoId,
    lastRunStartedAt: createdAt + DAY,
  });
  if (status !== "draft") {
    for (let r = 0; r < 2; r++) {
      await db.insert("agentRuns", {
        taskId,
        status: r === 0 && i % 4 === 0 ? "error" : "success",
        logs: [
          { timestamp: createdAt, level: "info", message: filler(i + r, 200) },
        ],
        startedAt: createdAt + r * 3600_000,
      });
    }
    await db.insert("chatReads", {
      userId,
      parentId: taskId,
      repoId,
      lastReadAt: createdAt + DAY,
    });
  }
  if (status === "done") {
    await db.insert("pullRequests", {
      repoId,
      prUrl: `https://github.com/loadtest/focal-repo/pull/t${i}-${projectId ?? "q"}`,
      prNumber: 100000 + i,
      state: "merged",
      primary: true,
      origin: "eva",
      owner: { kind: "task", taskId },
      createdAt,
      updatedAt: createdAt + DAY,
    });
  }
  if (i % 3 === 0) {
    await db.insert("taskComments", {
      taskId,
      content: filler(i, 300),
      createdAt,
    });
    await db.insert("taskActivity", {
      taskId,
      field: "status",
      createdAt,
    });
  }
}

const SEEDERS: Record<SeedChunkKind, Seeder> = {
  teammates: async (db, refs, i) => {
    await insertTeammate(db, refs.teamId, 100 + i, refs.now);
  },

  shellRepos: async (db, refs, i) => {
    await db.insert("githubRepos", {
      owner: "loadtest",
      name: `shell-repo-${i + 1}`,
      installationId: 1,
      teamId: refs.teamId,
    });
  },

  sessions: async (db, refs, i, total) => {
    const { now, userId } = refs;
    // Every 10th session lives in a sibling repo and links the focal repo,
    // which exercises the `sessionRepos.by_repo` path in sessions.list.
    const linked = i % 10 === 3;
    const repoId = linked ? refs.shellRepoId : refs.repoId;
    const createdAt = ago(now, i, total);
    const sessionId = await db.insert("sessions", {
      repoId,
      userId: i % 2 === 0 ? userId : teammate(refs, i),
      title: `Session ${i}: ${filler(i, 40)}`,
      status: i % 3 === 0 ? "active" : "closed",
      lastTurnFinishedAt: createdAt + 3_600_000,
      ...(i % 6 === 5 ? { archived: true } : {}),
      ...(i % 10 === 9 ? { deletedAt: createdAt + DAY } : {}),
    });
    const chatId = await db.insert("sessionChats", {
      sessionId,
      repoId,
      userId,
      title: "Main",
      number: 1,
      isMain: true,
    });
    if (i % 3 === 1) {
      await db.insert("sessionChats", {
        sessionId,
        repoId,
        userId,
        title: "Side chat",
        number: 2,
        isMain: false,
      });
    }
    if (linked) {
      await db.insert("sessionRepos", {
        sessionId,
        repoId: refs.repoId,
        owner: "loadtest",
        name: "focal-repo",
        installationId: 1,
        path: "/tmp/workspace/focal-repo",
        branchName: `eva/session-${i}`,
        baseBranch: "main",
        installDependencies: false,
      });
    }
    await db.insert("chatReads", {
      userId,
      parentId: sessionId,
      repoId,
      lastReadAt: createdAt,
    });
    if (i % 2 === 0) {
      await db.insert("pullRequests", {
        repoId,
        prUrl: `https://github.com/loadtest/focal-repo/pull/s${i}`,
        prNumber: i + 1,
        state: i % 4 === 0 ? "merged" : "open",
        primary: true,
        origin: "eva",
        owner: { kind: "session", sessionId },
        createdAt,
        updatedAt: createdAt,
      });
    }
    if (i % 10 === 0) {
      await db.insert("turns", {
        entityId: chatId,
        streamingEntityId: String(sessionId),
        state: "running",
        open: true,
        turnStartedAt: now - 60_000,
        leaseExpiresAt: now + 600_000,
        leaseGeneration: 1,
        model: "opus",
        repoId: refs.repoId,
        sessionId,
      });
      await db.insert("pendingQuestions", {
        entityId: String(sessionId),
        toolUseId: `tool_${i}`,
        payload: filler(i, 200),
        createdAt: now - 30_000,
      });
    }
    for (let m = 0; m < 3; m++) {
      await db.insert("messages", {
        parentId: chatId,
        role: m % 2 === 0 ? "user" : "assistant",
        content: filler(i + m, 400),
        timestamp: createdAt + m * 1000,
      });
    }
    for (let l = 0; l < 2; l++) {
      await db.insert("logs", {
        entityType: "session",
        entityId: String(sessionId),
        entityTitle: `Session ${i}`,
        repoId: refs.repoId,
        createdAt: createdAt + l * 1000,
        costUsd: 0.12,
        model: "opus",
        inputTokens: 1200,
        outputTokens: 800,
      });
    }
    await db.insert("chatLogEntries", {
      kind: "change",
      author: "agent",
      title: `Change ${i}`,
      createdAt,
      repoId,
      sourceKind: "session",
      sourceSessionId: sessionId,
    });
    await db.insert("notifications", {
      userId,
      type: "task_complete",
      title: `Session ${i} finished`,
      read: i % 2 === 0,
      repoId: refs.repoId,
      createdAt,
    });
    if (i % 5 === 0) {
      await db.insert("drafts", {
        userId,
        repoId: refs.repoId,
        kind: "sessionChat",
        sessionId,
        content: filler(i, 120),
        updatedAt: createdAt,
      });
    }
  },

  projects: async (db, refs, i, total) => {
    const { now, repoId, userId } = refs;
    const projectId = await db.insert("projects", {
      repoId,
      userId,
      title: `Project ${i}`,
      rawInput: filler(i, 400),
      phase: i % 4 === 0 ? "completed" : "in_progress",
      planningMode: i % 2 === 0 ? "interview" : "tasks_only",
      lastTurnFinishedAt: ago(now, i, total) + DAY,
      backgroundAgents: backgroundAgents(i, ago(now, i, total)),
      ...(i % 10 === 9 ? { deletedAt: ago(now, i, total) } : {}),
    });
    await db.insert("projectDetails", {
      projectId,
      conversationHistory: [
        { role: "user", content: filler(i, 600) },
        { role: "assistant", content: filler(i + 1, 1200) },
      ],
    });
    for (let t = 0; t < 3; t++) {
      await insertTaskWithChildren(db, refs, i * 3 + t, total * 3, projectId);
    }
  },

  quickTasks: async (db, refs, i, total) => {
    await insertTaskWithChildren(db, refs, i, total, undefined);
  },

  docs: async (db, refs, i, total) => {
    const createdAt = ago(refs.now, i, total);
    await db.insert("docs", {
      repoId: refs.repoId,
      title: `Doc ${i}`,
      content: filler(i, 2000),
      createdAt,
      updatedAt: createdAt,
      numId: i + 2,
      sourceKind: "session",
      sourceSessionId: refs.sessionId,
      ...(i % 10 === 9 ? { deletedAt: createdAt + DAY } : {}),
    });
  },

  automations: async (db, refs, i, total) => {
    const createdAt = ago(refs.now, i, total);
    const automationId = await db.insert("automations", {
      repoId: refs.repoId,
      title: `Automation ${i}`,
      description: filler(i, 200),
      cronSchedule: "0 * * * *",
      enabled: i % 2 === 0,
      createdBy: refs.userId,
      createdAt,
      updatedAt: createdAt,
    });
    await db.insert("automationRuns", {
      automationId,
      repoId: refs.repoId,
      status: "success",
      startedAt: createdAt,
      acknowledged: i % 3 !== 0,
    });
  },

  focalMessages: async (db, refs, i, total) => {
    const assistant = i % 2 === 1;
    const turn = Math.floor(i / 2);
    await db.insert("messages", {
      parentId: refs.mainChatId,
      role: assistant ? "assistant" : "user",
      content: filler(i, assistant ? 1200 : 300),
      timestamp: ago(refs.now, i, total),
      ...(assistant
        ? {
            activityLog: activityLog(
              i,
              ACTIVITY_LOG_BYTES[turn % ACTIVITY_LOG_BYTES.length] ?? 8_000,
            ),
          }
        : {}),
    });
  },

  focalRuns: async (db, refs, i, total) => {
    await db.insert("agentRuns", {
      taskId: refs.taskId,
      status: "success",
      logs: [
        { timestamp: ago(refs.now, i, total), level: "info", message: filler(i, 300) },
      ],
      startedAt: ago(refs.now, i, total),
    });
  },

  focalTaskTimeline: async (db, refs, i, total) => {
    const createdAt = ago(refs.now, i, total);
    await db.insert("taskComments", {
      taskId: refs.taskId,
      content: filler(i, 300),
      createdAt,
    });
    await db.insert("taskActivity", {
      taskId: refs.taskId,
      field: "status",
      createdAt,
    });
  },

  focalDocComments: async (db, refs, i, total) => {
    await db.insert("docComments", {
      docId: refs.docId,
      content: filler(i, 300),
      createdAt: ago(refs.now, i, total),
    });
  },

  focalSessionPrs: async (db, refs, i, total) => {
    const createdAt = ago(refs.now, i, total);
    await db.insert("pullRequests", {
      repoId: refs.repoId,
      prUrl: `https://github.com/loadtest/focal-repo/pull/f${i}`,
      prNumber: 500000 + i,
      state: "open",
      primary: i === total - 1,
      origin: "eva",
      owner: { kind: "session", sessionId: refs.sessionId },
      createdAt,
      updatedAt: createdAt,
    });
  },

  focalAutomationRuns: async (db, refs, i, total) => {
    await db.insert("automationRuns", {
      automationId: refs.automationId,
      repoId: refs.repoId,
      status: i % 5 === 0 ? "error" : "success",
      startedAt: ago(refs.now, i, total),
      acknowledged: true,
    });
  },

  routedThreads: async (db, refs, i, total) => {
    const lastMessageAt = ago(refs.now, i, total);
    const threadId = await db.insert("routedThreads", {
      teamId: refs.teamId,
      repoId: refs.repoId,
      sourceKind: "session",
      sourceId: String(refs.sessionId),
      sourceTitle: "Focal session",
      topicKey: `topic-${i}`,
      title: `Question ${i}`,
      status: "waiting_human",
      lastMessageAt,
      lastPreview: filler(i, 120),
      createdAt: lastMessageAt,
    });
    for (const participant of [refs.userId, teammate(refs, i)]) {
      await db.insert("routedParticipants", {
        threadId,
        userId: participant,
        teamId: refs.teamId,
        lastMessageAt,
        needsReply: participant === refs.userId,
        addedAt: lastMessageAt,
      });
    }
  },
};
