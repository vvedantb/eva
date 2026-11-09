import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  authMutation,
  getProjectWithAccess,
  hasRepoAccess,
  recomputeProjectPhase,
} from "../functions";
import { allocateNumId } from "../numId";
import { ensureSubscribed } from "../taskSubscribers";
import {
  parseSpec,
  getProjectGeneratedSpec,
  setProjectConversation,
  buildProjectBranchName,
} from "./helpers";
import { FALLBACK_GIT_BASE_BRANCH } from "@eva/shared";
import { resolveProjectBaseBranch } from "../_taskWorkflow/resolveBaseBranch";
import { createTaskRunSummary } from "../_agentTasks/runSummary";

/** Converts a finalized project spec into tasks with dependencies and sets the project to business_review. */
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
    );
    if (project.phase !== "finalized") {
      throw new Error("Project must be finalized before starting development");
    }
    const generatedSpec = await getProjectGeneratedSpec(ctx.db, args.projectId);
    if (!generatedSpec) {
      throw new Error("Project has no generated spec");
    }
    const spec = parseSpec(generatedSpec);
    const branchName = buildProjectBranchName(args.projectId);
    const projectBaseBranch = resolveProjectBaseBranch(
      project,
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
        baseBranch: projectBaseBranch,
        numId,
      });
      await createTaskRunSummary(ctx, taskId, project.repoId);
      await ensureSubscribed(ctx, taskId, ctx.userId);
      taskIdMap.set(taskNumber, taskId);
    }
    for (let i = 0; i < spec.tasks.length; i++) {
      const task = spec.tasks[i];
      const taskNumber = i + 1;
      const taskId = taskIdMap.get(taskNumber);
      if (!taskId) continue;
      for (const depNumber of task.dependencies) {
        const depTaskId = taskIdMap.get(depNumber);
        if (depTaskId) {
          await ctx.db.insert("taskDependencies", {
            taskId,
            dependsOnId: depTaskId,
          });
        }
      }
    }
    await ctx.db.patch(args.projectId, {
      phase: "business_review",
      branchName,
      description: spec.description,
    });
    return null;
  },
});

/** Creates a new active project from existing tasks, assigning them sequential task numbers. */
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
    const repo = await ctx.db.get(args.repoId);
    if (!repo) throw new Error("Repository not found");
    if (!(await hasRepoAccess(ctx.db, args.repoId, ctx.userId))) {
      throw new Error("Not authorized");
    }
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
      phase: "business_review",
      planningMode: "tasks_only",
      baseBranch: repo.defaultBaseBranch ?? FALLBACK_GIT_BASE_BRANCH,
      projectStartDate: Date.now(),
      numId: projectNumId,
    });
    await setProjectConversation(ctx.db, projectId, []);
    await ctx.db.patch(projectId, {
      branchName: buildProjectBranchName(projectId),
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
