import { v } from "convex/values";
import { findPrimaryPullRequest } from "../_pullRequests/store";
import { startTaskRun } from "../_taskWorkflow/startRun";
import { resolveProjectBaseBranch } from "../_taskWorkflow/resolveBaseBranch";
import { resolveProjectBranchName } from "../_git/branchNames";
import { authMutation, getProjectWithAccess, hasActiveRun } from "../functions";
import { isProjectBuilding } from "./buildState";

/**
 * Starts a resolve-conflicts run on the project's open PR, carried by its
 * most recently updated task. Refused while a build or another task run is
 * active.
 */
export const resolveProjectConflicts = authMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await getProjectWithAccess(
      ctx.db,
      args.projectId,
      ctx.userId,
    );

    const primaryPr = await findPrimaryPullRequest(ctx.db, {
      kind: "project",
      projectId: project._id,
    });
    if (
      !primaryPr ||
      primaryPr.state === "merged" ||
      primaryPr.state === "closed"
    ) {
      throw new Error("Project has no open PR to resolve conflicts for");
    }
    if (isProjectBuilding(project)) {
      throw new Error(
        "Cannot resolve conflicts while a build is active. Stop the build first.",
      );
    }

    const repo = await ctx.db.get(project.repoId);
    if (!repo) throw new Error("Repository not found");

    const projectTasks = await ctx.db
      .query("agentTasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const pt of projectTasks) {
      if (await hasActiveRun(ctx.db, pt._id)) {
        throw new Error(
          "Another task in this project is already running. Wait for it to finish.",
        );
      }
    }

    const carrier = projectTasks
      .filter((t) => t.status !== "draft")
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];

    if (!carrier) {
      throw new Error("No task in project to carry a resolve-conflicts run");
    }

    await startTaskRun(ctx, {
      task: carrier,
      repo,
      userId: ctx.userId,
      baseBranch: resolveProjectBaseBranch(project, repo),
      isFirstTaskOnBranch: false,
      branchName: resolveProjectBranchName(args.projectId, project),
      projectId: args.projectId,
      mode: "resolve_conflicts",
      clearPendingChangeRequest: false,
      rollbackStatus: carrier.status,
    });

    return null;
  },
});
