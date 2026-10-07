import { internalMutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";

const STEPS = [
  "projects",
  "taskChildren",
  "tasks",
  "sessions",
  "docs",
  "snapshots",
  "automations",
  "flatTables",
  "repoLinks",
  "repo",
] as const;

type Step = (typeof STEPS)[number];

/** Returns the next deletion step in the ordered pipeline, or null if done. */
function nextStep(current: Step): Step | null {
  const idx = STEPS.indexOf(current);
  if (idx === -1 || idx === STEPS.length - 1) return null;
  return STEPS[idx + 1];
}

const stepValidator = v.union(
  v.literal("projects"),
  v.literal("taskChildren"),
  v.literal("tasks"),
  v.literal("sessions"),
  v.literal("docs"),
  v.literal("snapshots"),
  v.literal("automations"),
  v.literal("flatTables"),
  v.literal("repoLinks"),
  v.literal("repo"),
);

/** Executes one step of the repo deletion pipeline and schedules the next step. */
export const deleteRepoStep = internalMutation({
  args: {
    repoId: v.id("githubRepos"),
    step: stepValidator,
    totalDeleted: v.number(),
    repoLabel: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { repoId, step, totalDeleted, repoLabel }) => {
    const repo = await ctx.db.get(repoId);
    if (step !== "repo" && repo === null) {
      console.log(
        `[cleanup] ${repoLabel}: repo already deleted, skipping remaining steps`,
      );
      return null;
    }

    let deleted = 0;

    switch (step) {
      case "projects": {
        const projects = await ctx.db
          .query("projects")
          .withIndex("by_repo", (q) => q.eq("repoId", repoId))
          .collect();
        for (const project of projects) {
          const details = await ctx.db
            .query("projectDetails")
            .withIndex("by_project", (q) => q.eq("projectId", project._id))
            .collect();
          for (const d of details) {
            await ctx.db.delete(d._id);
            deleted++;
          }
          await ctx.db.delete(project._id);
          deleted++;
        }
        break;
      }

      case "taskChildren": {
        const tasks = await ctx.db
          .query("agentTasks")
          .withIndex("by_repo", (q) => q.eq("repoId", repoId))
          .collect();
        for (const task of tasks) {
          const runs = await ctx.db
            .query("agentRuns")
            .withIndex("by_task", (q) => q.eq("taskId", task._id))
            .collect();
          for (const run of runs) {
            const logs = await ctx.db
              .query("agentRunActivityLogs")
              .withIndex("by_run", (q) => q.eq("runId", run._id))
              .collect();
            for (const log of logs) {
              await ctx.db.delete(log._id);
              deleted++;
            }
            await ctx.db.delete(run._id);
            deleted++;
          }

          const comments = await ctx.db
            .query("taskComments")
            .withIndex("by_task", (q) => q.eq("taskId", task._id))
            .collect();
          for (const c of comments) {
            await ctx.db.delete(c._id);
            deleted++;
          }

          const deps = await ctx.db
            .query("taskDependencies")
            .withIndex("by_task", (q) => q.eq("taskId", task._id))
            .collect();
          for (const d of deps) {
            await ctx.db.delete(d._id);
            deleted++;
          }

          const streaming = await ctx.db
            .query("streamingActivity")
            .withIndex("by_entity", (q) => q.eq("entityId", String(task._id)))
            .collect();
          for (const s of streaming) {
            await ctx.db.delete(s._id);
            deleted++;
          }
        }
        break;
      }

      case "tasks": {
        const summaries = await ctx.db
          .query("agentTaskRunSummaries")
          .withIndex("by_repo", (q) => q.eq("repoId", repoId))
          .collect();
        for (const summary of summaries) {
          await ctx.db.delete(summary._id);
          deleted++;
        }
        const tasks = await ctx.db
          .query("agentTasks")
          .withIndex("by_repo", (q) => q.eq("repoId", repoId))
          .collect();
        for (const task of tasks) {
          await ctx.db.delete(task._id);
          deleted++;
        }
        break;
      }

      case "sessions": {
        const sessions = await ctx.db
          .query("sessions")
          .withIndex("by_repo", (q) => q.eq("repoId", repoId))
          .collect();
        for (const session of sessions) {
          const daemonState = await ctx.db
            .query("sessionDaemonStates")
            .withIndex("by_session", (q) => q.eq("sessionId", session._id))
            .unique();
          if (daemonState) {
            await ctx.db.delete(daemonState._id);
            deleted++;
          }
          const messages = await ctx.db
            .query("messages")
            .withIndex("by_parent", (q) => q.eq("parentId", session._id))
            .collect();
          for (const m of messages) {
            await ctx.db.delete(m._id);
            deleted++;
          }

          // Links this session held to OTHER repos; the mirror case (other
          // sessions linking to this repo) is the "repoLinks" step.
          const links = await ctx.db
            .query("sessionRepos")
            .withIndex("by_session", (q) => q.eq("sessionId", session._id))
            .collect();
          for (const link of links) {
            await ctx.db.delete(link._id);
            deleted++;
          }

          await ctx.db.delete(session._id);
          deleted++;
        }
        break;
      }

      case "docs": {
        const docs = await ctx.db
          .query("docs")
          .withIndex("by_repo", (q) => q.eq("repoId", repoId))
          .collect();
        for (const doc of docs) {
          const evalReports = await ctx.db
            .query("evaluationReports")
            .withIndex("by_doc", (q) => q.eq("docId", doc._id))
            .collect();
          for (const e of evalReports) {
            await ctx.db.delete(e._id);
            deleted++;
          }
          await ctx.db.delete(doc._id);
          deleted++;
        }
        break;
      }

      case "snapshots": {
        const snapshots = await ctx.db
          .query("repoSnapshots")
          .withIndex("by_repo", (q) => q.eq("repoId", repoId))
          .collect();
        for (const snapshot of snapshots) {
          const builds = await ctx.db
            .query("snapshotBuilds")
            .withIndex("by_repo_snapshot", (q) =>
              q.eq("repoSnapshotId", snapshot._id),
            )
            .collect();
          for (const b of builds) {
            await ctx.db.delete(b._id);
            deleted++;
          }
          await ctx.db.delete(snapshot._id);
          deleted++;
        }
        break;
      }

      case "automations": {
        const automations = await ctx.db
          .query("automations")
          .withIndex("by_repo", (q) => q.eq("repoId", repoId))
          .collect();
        for (const automation of automations) {
          const runs = await ctx.db
            .query("automationRuns")
            .withIndex("by_automation", (q) =>
              q.eq("automationId", automation._id),
            )
            .collect();
          for (const r of runs) {
            await ctx.db.delete(r._id);
            deleted++;
          }
          await ctx.db.delete(automation._id);
          deleted++;
        }
        break;
      }

      case "flatTables": {
        const repoSkills = await ctx.db
          .query("repoSkills")
          .withIndex("by_repo", (q) => q.eq("repoId", repoId))
          .collect();
        for (const skill of repoSkills) {
          const content = await ctx.db
            .query("repoSkillContents")
            .withIndex("by_skill", (q) => q.eq("skillId", skill._id))
            .unique();
          if (content) {
            await ctx.db.delete(content._id);
            deleted++;
          }
        }
        const tables = [
          "repoSkills",
          "notifications",
          "repoEnvVars",
          "evaluationReports",
          "logs",
        ] as const;
        for (const table of tables) {
          const rows = await ctx.db
            .query(table)
            .withIndex("by_repo", (q) => q.eq("repoId", repoId))
            .collect();
          for (const row of rows) {
            await ctx.db.delete(row._id);
            deleted++;
          }
        }
        break;
      }

      case "repoLinks": {
        // Multi-repo sessions that cloned this repo alongside their own.
        const links = await ctx.db
          .query("sessionRepos")
          .withIndex("by_repo", (q) => q.eq("repoId", repoId))
          .collect();
        for (const link of links) {
          const session = await ctx.db.get(link.sessionId);
          if (session) {
            const remaining = (session.linkedRepoCount ?? 1) - 1;
            await ctx.db.patch(link.sessionId, {
              linkedRepoCount: remaining > 0 ? remaining : undefined,
            });
          }
          await ctx.db.delete(link._id);
          deleted++;
        }

        // `repoGroups` is small and has no membership index, so scan it: a
        // group loses this repo, and dies with its primary or its last member.
        const groups = await ctx.db.query("repoGroups").collect();
        for (const group of groups) {
          if (group.primaryRepoId === repoId) {
            await ctx.db.delete(group._id);
            deleted++;
            continue;
          }
          if (!group.linkedRepoIds.includes(repoId)) continue;
          const linkedRepoIds = group.linkedRepoIds.filter(
            (id) => id !== repoId,
          );
          if (linkedRepoIds.length === 0) {
            await ctx.db.delete(group._id);
            deleted++;
            continue;
          }
          await ctx.db.patch(group._id, {
            linkedRepoIds,
            updatedAt: Date.now(),
            // The seeded snapshot was built for the old membership.
            seededSnapshotName: undefined,
            seededFingerprint: undefined,
          });
        }
        break;
      }

      case "repo": {
        if (repo !== null) {
          await ctx.db.delete(repoId);
          deleted++;
        }
        const grand = totalDeleted + deleted;
        console.log(
          `[cleanup] ${repoLabel}: DONE — deleted ${grand} documents total`,
        );
        return null;
      }
    }

    const running = totalDeleted + deleted;
    console.log(
      `[cleanup] ${repoLabel}: step "${step}" — deleted ${deleted} docs (running total: ${running})`,
    );

    const next = nextStep(step);
    if (next) {
      await ctx.scheduler.runAfter(0, internal.migrations.deleteRepoStep, {
        repoId,
        step: next,
        totalDeleted: running,
        repoLabel,
      });
    }

    return null;
  },
});

/** Schedules the first deletion step for each target repo. */
async function scheduleRepoDeletions(
  ctx: MutationCtx,
  targets: Doc<"githubRepos">[],
): Promise<void> {
  for (const repo of targets) {
    const label = `${repo.owner}/${repo.name}${repo.rootDirectory ? ` (${repo.rootDirectory})` : ""}`;
    await ctx.scheduler.runAfter(0, internal.migrations.deleteRepoStep, {
      repoId: repo._id,
      step: STEPS[0],
      totalDeleted: 0,
      repoLabel: label,
    });
  }
}

/** Schedules deletion of all repos not owned by "evalucom" (or vvedantb/eva). */
export const deleteNonEvalucomRepos = internalMutation({
  args: {},
  returns: v.object({ reposScheduled: v.number() }),
  handler: async (ctx) => {
    const allRepos = await ctx.db.query("githubRepos").collect();
    const targets = allRepos.filter(
      (r) =>
        r.owner !== "evalucom" && !(r.owner === "vvedantb" && r.name === "eva"),
    );

    console.log(
      `[cleanup] Scheduling deletion for ${targets.length} non-evalucom repos`,
    );
    await scheduleRepoDeletions(ctx, targets);

    return { reposScheduled: targets.length };
  },
});

/** Schedules deletion of all repos owned by "evalucom" (or vvedantb/eva). */
export const deleteEvalucomRepos = internalMutation({
  args: {},
  returns: v.object({ reposScheduled: v.number() }),
  handler: async (ctx) => {
    const allRepos = await ctx.db.query("githubRepos").collect();
    const targets = allRepos.filter(
      (r) =>
        r.owner === "evalucom" || (r.owner === "vvedantb" && r.name === "eva"),
    );

    console.log(
      `[cleanup] Scheduling deletion for ${targets.length} evalucom repos`,
    );
    await scheduleRepoDeletions(ctx, targets);

    return { reposScheduled: targets.length };
  },
});
