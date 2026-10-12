"use node";

import { generateText } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { getActionRepoWithAccess } from "./functions";
import { getInstallationOctokit } from "./githubAuth";
import { llmJson } from "./_taskWorkflow/helpers";
import { execHandle, getSandboxHandle } from "./_sandbox_runtime/helpers";
import {
  launchDevServerInBackground,
  startSessionServices,
} from "./_sandbox_runtime/devServer";
import { buildHttpReadyProbeCommand } from "./_sandbox_runtime/httpReadyProbe";
import { ARENA_SCREENSHOT_DIR } from "./_arena/browserRun";

/** Gateway model for drafting scenarios: same one Ave uses, known to be on the gateway. */
const DRAFT_MODEL = "openai/gpt-6-luna";
const MAX_DRAFTED_SCENARIOS = 6;
/** A screenshot past this is skipped rather than half-read. */
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

const draftJsonSchema = z
  .object({
    scenarios: z
      .array(
        z
          .object({ title: z.string(), instructions: z.string() })
          .nullable()
          .catch(null),
      )
      .catch([]),
  })
  .catch({ scenarios: [] });

/**
 * Drafts browser scenarios from the doc (and its user flows) and appends them
 * to the doc's list for the user to edit. Returns how many were added.
 */
export const draftScenarios = action({
  args: { docId: v.id("docs") },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const context = await ctx.runQuery(
      internal.arenaScenarios.getDraftContext,
      { docId: args.docId },
    );
    if (!context) throw new Error("Document not found");
    await getActionRepoWithAccess(ctx, context.repoId);
    if (context.content.trim().length === 0 && context.userFlows.length === 0) {
      throw new Error("Add content to this document before drafting scenarios");
    }

    const flows = context.userFlows
      .map((f) => `- ${f.name}: ${f.steps.join(" → ")}`)
      .join("\n");
    const existing = context.existingTitles.map((t) => `- ${t}`).join("\n");

    const { text } = await generateText({
      model: DRAFT_MODEL,
      prompt: `You write browser test scenarios for a web app, from its specification. An AI agent will run each scenario in a real browser against the app's dev server and decide pass or fail.

## Specification: ${context.title}
${context.content.slice(0, 20_000)}
${flows ? `\n## User flows\n${flows}\n` : ""}${existing ? `\n## Scenarios that already exist (do not repeat them)\n${existing}\n` : ""}
## Task
Write up to ${MAX_DRAFTED_SCENARIOS} scenarios that cover the most important user-visible behaviour. Each scenario:
- "title": a short name, under 60 characters.
- "instructions": plain English. Numbered steps a user takes, then one line starting "Pass when" that states the outcome to see on screen. Describe pages and controls by what the user sees, not by CSS selectors.

Output ONLY valid JSON: {"scenarios": [{"title": "...", "instructions": "..."}]}`,
    });

    const { json } = llmJson.extract(text);
    if (json.length === 0) throw new Error("Could not draft scenarios");
    const scenarios = draftJsonSchema
      .parse(json[0])
      .scenarios.flatMap((s) => (s ? [s] : []))
      .slice(0, MAX_DRAFTED_SCENARIOS);

    return await ctx.runMutation(internal.arenaScenarios.insertDrafted, {
      docId: args.docId,
      scenarios,
    });
  },
});

/**
 * Starts the app dev server in a browser-run sandbox with the repo's dev
 * settings, then waits up to ~3 minutes for it to answer. A slow compile is
 * not an error here: the agent keeps waiting and reports a dead server.
 */
export const startAppForRun = internalAction({
  args: { sandboxId: v.string(), repoId: v.id("githubRepos") },
  returns: v.object({ port: v.number() }),
  handler: async (ctx, args): Promise<{ port: number }> => {
    const repo = await ctx.runQuery(internal.githubRepos.getInternal, {
      id: args.repoId,
    });
    if (!repo) throw new Error("Repository not found");

    const handle = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    const { port, devCommand } = await startSessionServices(
      handle,
      repo.rootDirectory ?? "",
      { devPort: repo.devPort, devCommand: repo.devCommand },
    );
    await launchDevServerInBackground(handle, devCommand, port);
    await execHandle(
      handle,
      buildHttpReadyProbeCommand({
        url: `http://localhost:${port}`,
        attempts: 90,
        sleepSec: 2,
        onReady: "exit 0",
        onTimeout: "exit 0",
      }),
      200,
    );
    return { port };
  },
});

/** Uploads each scenario's screenshot from the sandbox to storage. Missing ones are skipped. */
export const collectScreenshots = internalAction({
  args: {
    sandboxId: v.string(),
    repoId: v.id("githubRepos"),
    scenarioIds: v.array(v.id("arenaScenarios")),
  },
  returns: v.array(
    v.object({
      scenarioId: v.id("arenaScenarios"),
      storageId: v.id("_storage"),
    }),
  ),
  handler: async (ctx, args) => {
    const handle = await getSandboxHandle(ctx, args.repoId, args.sandboxId);
    const stored: Array<{
      scenarioId: Id<"arenaScenarios">;
      storageId: Id<"_storage">;
    }> = [];
    for (const scenarioId of args.scenarioIds) {
      // Convex ids are alphanumeric, so the path needs no quoting.
      const path = `${ARENA_SCREENSHOT_DIR}/${scenarioId}.png`;
      try {
        const out = await execHandle(
          handle,
          `if [ -f ${path} ] && [ $(wc -c < ${path}) -le ${MAX_SCREENSHOT_BYTES} ]; then base64 ${path} | tr -d '\\n'; fi`,
          30,
        );
        const base64 = out.trim();
        if (!base64) continue;
        const storageId = await ctx.storage.store(
          new Blob([Buffer.from(base64, "base64")], { type: "image/png" }),
        );
        stored.push({ scenarioId, storageId });
      } catch (error) {
        console.warn(`[arena] screenshot upload failed for ${scenarioId}`, error);
      }
    }
    return stored;
  },
});

const CHECK_NAME_PREFIX = "Eva Testing Arena";

/**
 * Opens an in-progress GitHub check run on the PR's head commit. Best-effort:
 * a missing "Checks: write" permission must not stop the browser run.
 */
export const createCheckRun = internalAction({
  args: { reportId: v.id("evaluationReports") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await ctx.runQuery(
      internal.arenaBrowserWorkflow.getCheckRunContext,
      { reportId: args.reportId },
    );
    if (!context || context.checkRunId !== undefined) return null;
    try {
      const octokit = await getInstallationOctokit(context.installationId);
      const { data } = await octokit.rest.checks.create({
        owner: context.owner,
        repo: context.name,
        name: `${CHECK_NAME_PREFIX}: ${context.docTitle}`,
        head_sha: context.headSha,
        status: "in_progress",
        details_url: context.detailsUrl,
        output: {
          title: "Running browser scenarios",
          summary: `Eva is testing ${context.scenarioCount} scenario${context.scenarioCount === 1 ? "" : "s"} from **${context.docTitle}** in a real browser.`,
        },
      });
      await ctx.runMutation(internal.arenaBrowserWorkflow.setCheckRunId, {
        reportId: args.reportId,
        checkRunId: data.id,
      });
    } catch (error) {
      console.error("[arena] could not create GitHub check run", error);
    }
    return null;
  },
});

/** Pipes and newlines would break the markdown table row. */
function tableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

/** Writes the final pass/fail result to the PR's check run. */
export const completeCheckRun = internalAction({
  args: { reportId: v.id("evaluationReports") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await ctx.runQuery(
      internal.arenaBrowserWorkflow.getCheckRunContext,
      { reportId: args.reportId },
    );
    if (!context || context.checkRunId === undefined) return null;

    const results = context.scenarioResults;
    const passed = results.filter((r) => r.passed).length;
    const finished = context.status === "completed";
    const conclusion =
      finished && passed === results.length ? "success" : "failure";
    const title = finished
      ? `${passed} of ${results.length} scenarios passed`
      : "Browser run did not finish";
    const summary = finished
      ? (context.summary ?? "")
      : (context.error ?? "The browser run stopped before it reported results.");
    const table =
      results.length > 0
        ? [
            "| Result | Scenario | Notes |",
            "| --- | --- | --- |",
            ...results.map(
              (r) =>
                `| ${r.passed ? "✅ Pass" : "❌ Fail"} | ${tableCell(r.title)} | ${tableCell(r.notes)} |`,
            ),
          ].join("\n")
        : undefined;

    try {
      const octokit = await getInstallationOctokit(context.installationId);
      await octokit.rest.checks.update({
        owner: context.owner,
        repo: context.name,
        check_run_id: context.checkRunId,
        status: "completed",
        conclusion,
        details_url: context.detailsUrl,
        output: {
          title,
          summary: `${summary}\n\n[Open in Eva](${context.detailsUrl})`,
          text: table,
        },
      });
    } catch (error) {
      console.error("[arena] could not complete GitHub check run", error);
    }
    return null;
  },
});
