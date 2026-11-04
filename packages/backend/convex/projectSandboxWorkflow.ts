import { v } from "convex/values";
import { internal } from "./_generated/api";
import { workflow } from "./workflowManager";

/** Starts a project preview sandbox (checkout project branch + run startup commands) as a durable workflow step. */
export const projectPreviewSandboxStartupWorkflow = workflow.define({
  args: {
    projectId: v.id("projects"),
    existingSandboxId: v.optional(v.string()),
    installationId: v.number(),
    repoOwner: v.string(),
    repoName: v.string(),
    branchName: v.string(),
    baseBranch: v.string(),
    repoId: v.id("githubRepos"),
    forceStartupCommands: v.optional(v.boolean()),
    /** Fences ready / failure writes to this start; see `_sandbox/transitions.ts`. */
    startAttempt: v.optional(v.number()),
  },
  handler: async (step, args): Promise<void> => {
    await step.runAction(internal.sandbox.startProjectPreviewSandbox, {
      projectId: args.projectId,
      existingSandboxId: args.existingSandboxId,
      installationId: args.installationId,
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      branchName: args.branchName,
      baseBranch: args.baseBranch,
      repoId: args.repoId,
      forceStartupCommands: args.forceStartupCommands,
      startAttempt: args.startAttempt,
    });
  },
});
