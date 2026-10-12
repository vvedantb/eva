import { z } from "zod";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/** Where the agent saves one screenshot per scenario, named `<scenarioId>.png`. */
export const ARENA_SCREENSHOT_DIR = "/tmp/eva-arena";

/** The spec is context only; scenarios carry the checks, so a long doc is cut. */
const MAX_SPEC_CHARS = 12_000;

export type ArenaScenarioSnapshot = {
  id: Id<"arenaScenarios">;
  title: string;
  instructions: string;
};

/** Prompt for one browser run: start-up wait, agent-browser usage, scenarios, JSON contract. */
export function buildBrowserRunPrompt(params: {
  docTitle: string;
  docContent: string;
  scenarios: ArenaScenarioSnapshot[];
  port: number;
  rootDirInstruction: string;
}): string {
  const spec =
    params.docContent.length > MAX_SPEC_CHARS
      ? `${params.docContent.slice(0, MAX_SPEC_CHARS)}\n\n[Specification truncated]`
      : params.docContent;
  const scenarios = params.scenarios
    .map(
      (s, i) =>
        `### Scenario ${i + 1} (id: ${s.id})\n**${s.title}**\n${s.instructions}`,
    )
    .join("\n\n");

  return `You are a QA tester. Test the running web app in a real browser and report whether each scenario passes.

## The app
The dev server is starting at http://localhost:${params.port}. A cold compile can take a few minutes. Before you test, retry \`curl -sf http://localhost:${params.port}\` for up to 5 minutes. If it never answers, read /tmp/devserver.log and report every scenario as failed with the reason.

## The browser
Drive Chrome with the \`agent-browser\` CLI through Bash. Run \`agent-browser skills get core\` once first to learn the commands. The usual loop is: \`agent-browser open <url>\`, \`agent-browser snapshot -i\` to list elements with refs like @e1, then \`click @e1\`, \`fill @e2 "text"\` or \`press Enter\`.

## Specification (context): ${params.docTitle}
${spec}

## Scenarios
${scenarios}

## Rules
1. Test each scenario in order, starting each one from a fresh page load.
2. Do not edit source code, commit or push. You may read files to find routes or test data.
3. A scenario passes only if you saw the expected outcome in the browser. If you could not finish it (sign-in wall, crash, missing page, server down), it fails. Say why.
4. At the end of each scenario, run \`mkdir -p ${ARENA_SCREENSHOT_DIR}\` and save a screenshot of the final state to \`${ARENA_SCREENSHOT_DIR}/<id>.png\`, using the scenario id above.

## Output
Output ONLY valid JSON, one result per scenario:
{"results": [{"scenarioId": "<id>", "passed": true, "notes": "What you did and what you saw, in 1-3 sentences."}], "summary": "One sentence on the overall result."}

No markdown and no text outside the JSON.${params.rootDirInstruction}`;
}

/** Lenient parse of the agent's JSON: bad entries drop out and are reported as missing. */
export const browserRunJsonSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            scenarioId: z.string(),
            passed: z.boolean(),
            notes: z.string().catch(""),
          })
          .nullable()
          .catch(null),
      )
      .catch([]),
    summary: z.string().catch("Browser run completed"),
  })
  .catch({ results: [], summary: "Browser run completed" });

/**
 * Schedules the GitHub check run update once a PR-triggered report reaches a
 * final state. Every terminal path (save, workflow failure, watchdog) calls
 * this, so the check never stays "in progress".
 */
export async function scheduleArenaCheckCompletion(
  ctx: MutationCtx,
  report: Doc<"evaluationReports">,
): Promise<void> {
  if (report.checkRunId === undefined) return;
  await ctx.scheduler.runAfter(0, internal.arenaActions.completeCheckRun, {
    reportId: report._id,
  });
}
