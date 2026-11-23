import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  authMutation,
  EMPTY_PROJECT_PHASE,
  getProjectWithAccess,
  getRepoWithAccess,
  recomputeProjectPhase,
} from "../functions";
import { allocateNumId } from "../numId";
import { ensureSubscribed } from "../taskSubscribers";
import { parseSpec, getProjectGeneratedSpec } from "./helpers";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { resolveNewTaskBaseBranch } from "../_taskWorkflow/resolveBaseBranch";
import { createTaskRunSummary } from "../_agentTasks/runSummary";
import { insertTaskDependencies } from "../_agentTasks/dependencies";

/**
 * Old interview projects only: converts a finalized spec into tasks with
 * dependencies. The tasks wait for a person's approval; the phase follows
 * from them (`recomputeProjectPhase`). New projects plan in their
 * coordinator chat and never reach `finalized`.
 */
export const startDevelopment = authMutation({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
      "contributor",
    );
    if (project.phase !== "finalized") {
      throw new Error("Project must be finalized before starting development");
    }
    const generatedSpec = await getProjectGeneratedSpec(ctx.db, args.projectId);
    if (!generatedSpec) {
      throw new Error("Project has no generated spec");
    }
    const spec = parseSpec(generatedSpec);
    // Each child task opens its own PR to the repo default branch.
    const taskBaseBranch = resolveNewTaskBaseBranch(
      undefined,
      await ctx.db.get(project.repoId),
    );
    const taskIdMap = new Map<number, Id<"agentTasks">>();
    const now = Date.now();
    for (let i = 0; i < spec.tasks.length; i++) {
      const task = spec.tasks[i];
      const taskNumber = i + 1;
      const numId = await allocateNumId(ctx.db, project.repoId, "agentTasks");
      const taskId = await ctx.db.insert("agentTasks", {
        title: task.title,
        description: task.description,
        repoId: project.repoId,
        projectId: args.projectId,
        taskNumber,
        status: "todo",
        createdAt: now,
        updatedAt: now,
        createdBy: ctx.userId,
        baseBranch: taskBaseBranch,
        numId,
      });
      await createTaskRunSummary(ctx, taskId, project.repoId);
      await ensureSubscribed(ctx, taskId, ctx.userId);
      taskIdMap.set(taskNumber, taskId);
    }
    await insertTaskDependencies(
      ctx,
      spec.tasks.flatMap((task, i) => {
        const taskId = taskIdMap.get(i + 1);
        return taskId === undefined
          ? []
          : task.dependencies.flatMap((depNumber) => {
              const dependsOnId = taskIdMap.get(depNumber);
              return dependsOnId === undefined ? [] : [{ taskId, dependsOnId }];
            });
      }),
    );
    await ctx.db.patch(args.projectId, { description: spec.description });
    await recomputeProjectPhase(ctx, args.projectId);
    return null;
  },
});

/**
 * Creates a new project from existing tasks, assigning them sequential task
 * numbers. Like `projects.create`, it plans in its coordinator chat.
 */
export const createFromTasks = authMutation({
  args: {
    repoId: v.id("githubRepos"),
    title: v.string(),
    taskIds: v.array(v.id("agentTasks")),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    if (args.taskIds.length === 0) {
      throw new Error("At least one task is required");
    }
    const repo = await getRepoWithAccess(ctx.db, args.repoId, ctx.userId);
    // Only this repo's tasks may join the project: a foreign id would move
    // another team's task under a project the caller owns.
    const tasks = await Promise.all(args.taskIds.map((id) => ctx.db.get(id)));
    if (tasks.some((task) => task !== null && task.repoId !== args.repoId)) {
      throw new Error("Tasks must belong to this repository");
    }
    const projectNumId = await allocateNumId(ctx.db, args.repoId, "projects");
    const projectId = await ctx.db.insert("projects", {
      repoId: args.repoId,
      userId: ctx.userId,
      title: args.title,
      rawInput: args.title,
      phase: EMPTY_PROJECT_PHASE,
      baseBranch: repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH,
      projectStartDate: Date.now(),
      numId: projectNumId,
    });
    for (let i = 0; i < args.taskIds.length; i++) {
      const taskId = args.taskIds[i];
      if (tasks[i]) {
        await ctx.db.patch(taskId, {
          projectId,
          taskNumber: i + 1,
          updatedAt: Date.now(),
        });
      }
    }
    await recomputeProjectPhase(ctx, projectId);
    return projectId;
  },
});
