import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ActionCtx } from "../_generated/server";
import type { JsonValue } from "../_jev/jsonValue";
import { AI_MODEL_OPTIONS } from "../validators";
import { repoBasePath } from "../_githubRepos/helpers";
import { entityAccess, repoRefArgs } from "./entityRef";
import {
  confirmedDeleteArg,
  errorResult,
  mcpCallAsUser,
  mcpGetContext,
  mcpListUserRepos,
  repoRefLabel,
  textResult,
  type McpCredentials,
  type RepoInfo,
} from "./toolShared";
import { defineTool, type EvaTool } from "./registry";

// Every tool here calls the same public automations:* functions the web UI
// does, as the caller (mcpCallAsUser), so hasRepoAccess and the system
// automation guards apply unchanged.

const DURABLE_NOTE =
  "Automations are durable: they live in Eva and keep running on their schedule after this session ends, unlike an agent's own in-session cron or loop.";
const TIMEZONE_NOTE =
  'Schedules are standard 5-field cron expressions ("minute hour day-of-month month day-of-week") in UTC. The web UI shows them in the viewer\'s local time, so convert before writing one.';

/** Long run text is cut to this many characters so one reply stays readable. */
const SUMMARY_LIMIT = 2000;
const FINDING_TEXT_LIMIT = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Reply shapes, parsed at the boundary
// ─────────────────────────────────────────────────────────────────────────────

const automationSchema = z.object({
  _id: z.string(),
  numId: z.number().optional(),
  repoId: z.string(),
  title: z.string(),
  description: z.string(),
  cronSchedule: z.string(),
  model: z.string().optional(),
  enabled: z.boolean(),
  readOnly: z.boolean().optional(),
  actionsEnabled: z.boolean().optional(),
  shared: z.boolean().optional(),
  sendEmail: z.boolean().optional(),
  systemKey: z.string().optional(),
});
type Automation = z.infer<typeof automationSchema>;

const runSchema = z.object({
  _id: z.string(),
  status: z.enum(["queued", "running", "success", "error", "cancelled"]),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  resultSummary: z.string().optional(),
  prUrl: z.string().optional(),
  error: z.string().optional(),
  findings: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        severity: z.string(),
        filePaths: z.array(z.string()).optional(),
        taskId: z.string().optional(),
        triage: z
          .object({
            severity: z.string(),
            duplicateOfNumId: z.number().optional(),
            duplicateProbability: z.number(),
          })
          .optional(),
      }),
    )
    .optional(),
});
type Run = z.infer<typeof runSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Cron: the backend hands the spec to @convex-dev/crons (UTC, cron-parser),
// which throws "Invalid cronspec" only when the automation is enabled. This
// checks the same 5-field grammar up front so a disabled automation cannot
// store a spec that would break the moment someone enables it, and gives the
// list a readable description and next run without a new dependency.
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface CronField {
  raw: string;
  values: Set<number>;
}

interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dayOfMonth: CronField;
  month: CronField;
  dayOfWeek: CronField;
}

/** Swaps JAN/MON-style names for their numbers; month names count from 1. */
function replaceNames(raw: string, names: string[], offset: number): string {
  return raw
    .toUpperCase()
    .replace(/[A-Z]{3}/g, (name) => {
      const index = names.indexOf(name);
      return index === -1 ? name : String(index + offset);
    });
}

function parseCronField(
  raw: string,
  min: number,
  max: number,
): CronField | null {
  const values = new Set<number>();
  for (const item of raw.split(",")) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(item);
    if (!match) return null;
    const [, range, stepText] = match;
    const step = stepText === undefined ? 1 : Number(stepText);
    let start = min;
    let end = max;
    if (range !== "*") {
      const [from, to] = range.split("-").map(Number);
      start = from;
      // "5/15" means 5, 20, 35, ... up to the field's max, as in cron-parser.
      end = to ?? (stepText === undefined ? from : max);
    }
    if (step < 1 || start < min || end > max || start > end) return null;
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return { raw, values };
}

function parseCron(expression: string): ParsedCron | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts;
  const minute = parseCronField(minuteRaw, 0, 59);
  const hour = parseCronField(hourRaw, 0, 23);
  const dayOfMonth = parseCronField(domRaw, 1, 31);
  const month = parseCronField(replaceNames(monthRaw, MONTH_NAMES, 1), 1, 12);
  const dayOfWeek = parseCronField(replaceNames(dowRaw, DAY_NAMES, 0), 0, 7);
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null;
  // 7 is Sunday too.
  if (dayOfWeek.values.has(7)) dayOfWeek.values.add(0);
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

/** Standard cron: when both day fields are restricted, either may match. */
function dayMatches(cron: ParsedCron, date: Date): boolean {
  const domOk = cron.dayOfMonth.values.has(date.getUTCDate());
  const dowOk = cron.dayOfWeek.values.has(date.getUTCDay());
  const domStar = cron.dayOfMonth.raw === "*";
  const dowStar = cron.dayOfWeek.raw === "*";
  if (!domStar && !dowStar) return domOk || dowOk;
  if (!domStar) return domOk;
  if (!dowStar) return dowOk;
  return true;
}

/** Next UTC fire time after `from`, or null if nothing matches within ~5 years. */
function nextCronRun(cron: ParsedCron, from: number): number | null {
  const date = new Date(from);
  date.setUTCSeconds(0, 0);
  date.setUTCMinutes(date.getUTCMinutes() + 1);
  for (let step = 0; step < 100_000; step++) {
    if (!cron.month.values.has(date.getUTCMonth() + 1)) {
      date.setUTCMonth(date.getUTCMonth() + 1, 1);
      date.setUTCHours(0, 0);
    } else if (!dayMatches(cron, date)) {
      date.setUTCDate(date.getUTCDate() + 1);
      date.setUTCHours(0, 0);
    } else if (!cron.hour.values.has(date.getUTCHours())) {
      date.setUTCHours(date.getUTCHours() + 1, 0);
    } else if (!cron.minute.values.has(date.getUTCMinutes())) {
      date.setUTCMinutes(date.getUTCMinutes() + 1);
    } else {
      return date.getTime();
    }
  }
  return null;
}

function fieldPhrase(raw: string, unit: string): string {
  if (raw === "*") return `every ${unit}`;
  const step = /^\*\/(\d+)$/.exec(raw);
  if (step) return `every ${step[1]} ${unit}s`;
  return `${unit} ${raw}`;
}

function describeCron(cron: ParsedCron): string {
  const { minute, hour, dayOfMonth, month, dayOfWeek } = cron;
  const isPlain = (raw: string) => /^\d+$/.test(raw);
  let time: string;
  if (isPlain(minute.raw) && isPlain(hour.raw)) {
    time = `At ${hour.raw.padStart(2, "0")}:${minute.raw.padStart(2, "0")} UTC`;
  } else if (isPlain(minute.raw)) {
    time = `At minute ${minute.raw} past ${fieldPhrase(hour.raw, "hour")} (UTC)`;
  } else {
    time = `${fieldPhrase(minute.raw, "minute")}, ${fieldPhrase(hour.raw, "hour")} (UTC)`;
  }
  const days: string[] = [];
  if (dayOfWeek.raw !== "*") {
    const named = replaceNames(dayOfWeek.raw, DAY_NAMES, 0).replace(
      /\d+/g,
      (n) => DAY_NAMES[Number(n) % 7],
    );
    days.push(`on ${named}`);
  }
  if (dayOfMonth.raw !== "*") days.push(`on day ${dayOfMonth.raw} of the month`);
  if (month.raw !== "*") days.push(`in month ${month.raw}`);
  return `${time}, ${days.length > 0 ? days.join(", ") : "every day"}`;
}

function scheduleSummary(automation: Automation) {
  const raw = automation.cronSchedule.trim();
  if (raw === "") {
    return {
      schedule: { cron: "", description: "Manual only (no schedule)" },
      nextRunAt: null,
    };
  }
  const cron = parseCron(raw);
  const next =
    cron && automation.enabled ? nextCronRun(cron, Date.now()) : null;
  return {
    schedule: {
      cron: raw,
      timezone: "UTC",
      description: cron ? describeCron(cron) : "Unrecognised cron expression",
    },
    nextRunAt: next === null ? null : new Date(next).toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

function truncate(text: string, limit: number): string {
  return text.length > limit
    ? `${text.slice(0, limit)}… [${text.length - limit} more characters]`
    : text;
}

function isoTime(ms: number | undefined): string | null {
  return ms === undefined ? null : new Date(ms).toISOString();
}

/** Strips the HTTP client's request-id and stack noise from a Convex error. */
function cleanErrorMessage(error: Error): string {
  const uncaught = /Uncaught Error: ([^\n]*)/.exec(error.message);
  return uncaught ? uncaught[1] : error.message;
}

async function guarded(
  run: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error) return errorResult(cleanErrorMessage(error));
    throw error;
  }
}

/** Claude short names the other tools accept, mapped to Eva model ids. */
const MODEL_ALIASES: Record<string, string> = {
  opus: "claude:opus",
  sonnet: "claude:sonnet",
  haiku: "claude:haiku",
  fable: "claude:claude-fable-5-1",
};
const MODEL_IDS: string[] = AI_MODEL_OPTIONS.map((option) => option.id);

const modelArg = z
  .string()
  .optional()
  .transform((model) =>
    model === undefined ? undefined : (MODEL_ALIASES[model] ?? model),
  )
  .refine((model) => model === undefined || MODEL_IDS.includes(model), {
    message: `Unknown model. Use "opus", "sonnet", "haiku", "fable" or one of: ${MODEL_IDS.join(", ")}`,
  })
  .describe(
    `Model the automation runs on: "opus", "sonnet", "haiku", "fable", or a full Eva model id (${MODEL_IDS.join(", ")}). Omit to keep the current one (new automations use the repo default).`,
  );

const scheduleArg = z
  .string()
  .optional()
  .describe(
    'Cron expression in UTC, e.g. "0 6 * * *" (daily 06:00 UTC), "0 6 * * MON-FRI", "0 */6 * * *". Pass "" for manual-only (runs only via run_automation_now).',
  );

const settingsArgs = {
  description: z
    .string()
    .optional()
    .describe(
      "The prompt the agent runs each time, in full. An automation without one cannot run.",
    ),
  cronSchedule: scheduleArg,
  model: modelArg,
  enabled: z
    .boolean()
    .optional()
    .describe(
      "true starts the schedule, false pauses it. Disabled automations can still be run by hand.",
    ),
  readOnly: z
    .boolean()
    .optional()
    .describe(
      "true: the agent only reports (summary and findings) and opens no PR. false: it may change code and open a PR.",
    ),
  actionsEnabled: z
    .boolean()
    .optional()
    .describe(
      "Read-only automations only: lets the agent take actions (e.g. comment, create tasks) while still not editing code. Turned off whenever readOnly is false.",
    ),
  sendEmail: z
    .boolean()
    .optional()
    .describe(
      "true emails each successful run's summary to every user with email notifications on.",
    ),
};

/** Rejects a schedule the crons component would refuse on enable. */
function scheduleError(cronSchedule: string | undefined) {
  if (cronSchedule === undefined || cronSchedule.trim() === "") return null;
  if (parseCron(cronSchedule)) return null;
  return errorResult(
    `"${cronSchedule}" is not a valid 5-field cron expression (minute hour day-of-month month day-of-week, UTC). Use numbers, *, ranges (1-5), lists (1,3), steps (*/15) and JAN/MON-style names.`,
  );
}

/** Builds the automations:update args, mirroring the UI's readOnly/actions coupling. */
function buildUpdateArgs(
  id: string,
  fields: {
    title?: string;
    description?: string;
    cronSchedule?: string;
    model?: string;
    enabled?: boolean;
    readOnly?: boolean;
    actionsEnabled?: boolean;
    sendEmail?: boolean;
  },
): Record<string, JsonValue> | ReturnType<typeof errorResult> {
  if (fields.readOnly === false && fields.actionsEnabled === true) {
    return errorResult(
      "actionsEnabled only applies to read-only automations; set readOnly true as well, or leave actionsEnabled out.",
    );
  }
  const args: Record<string, JsonValue> = { id };
  if (fields.title !== undefined) args.title = fields.title;
  if (fields.description !== undefined) args.description = fields.description;
  if (fields.cronSchedule !== undefined)
    args.cronSchedule = fields.cronSchedule.trim();
  if (fields.model !== undefined) args.model = fields.model;
  if (fields.enabled !== undefined) args.enabled = fields.enabled;
  if (fields.readOnly !== undefined) args.readOnly = fields.readOnly;
  if (fields.readOnly === false) args.actionsEnabled = false;
  else if (fields.actionsEnabled !== undefined)
    args.actionsEnabled = fields.actionsEnabled;
  if (fields.sendEmail !== undefined) args.sendEmail = fields.sendEmail;
  return args;
}

const automationIdArg = z
  .string()
  .describe("The automation's id, as returned by list_automations.");

/**
 * Tools that manage Eva automations: scheduled prompts that run an agent
 * against a repo, report a summary and findings, and (unless read-only) open
 * a PR. Findings can be turned into quick tasks.
 *
 * Deliberately absent: installing catalog system automations. That stays a
 * Hub choice in the UI; installed ones are listed and can be scheduled,
 * enabled, run and removed here like any other.
 */
export function automationTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): EvaTool[] {
  const tools: EvaTool[] = [];
  const { clerkUserId } = credentials;
  const { assertUserRepoAccess, resolveRepoRef } = entityAccess(
    ctx,
    credentials,
  );

  function getAutomation(id: string): Promise<Automation | null> {
    return mcpCallAsUser(
      ctx,
      clerkUserId,
      { type: "query", path: "automations:get", args: { id } },
      automationSchema.nullable(),
    );
  }

  function listRuns(automationId: string): Promise<Run[]> {
    return mcpCallAsUser(
      ctx,
      clerkUserId,
      { type: "query", path: "automations:listRuns", args: { automationId } },
      z.array(runSchema),
    );
  }

  const notFound = () =>
    errorResult(
      "No automation matched that id, or you do not have access to it. Use list_automations to find one.",
    );

  /** Resolves the optional repo ref to repos, or every repo the user can reach. */
  async function targetRepos(ref: {
    repoId?: string;
    repoName?: string;
    app?: string;
  }): Promise<RepoInfo[] | ReturnType<typeof errorResult>> {
    const { userId } = await mcpGetContext(ctx, clerkUserId);
    const repos = await mcpListUserRepos(ctx, userId);
    if (ref.repoId === undefined && ref.repoName === undefined) return repos;
    const resolved = await resolveRepoRef(ref, userId);
    if ("isError" in resolved) return resolved;
    await assertUserRepoAccess(resolved.repoId, userId);
    return repos.filter((repo) => repo.id === resolved.repoId);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // list_automations
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "list_automations",
      description: `List Eva automations for one repo, or across every repo you can reach when no repo is given. An automation is a saved prompt that an agent runs against its repo on a schedule, reporting a summary and findings and, unless read-only, opening a PR. ${DURABLE_NOTE}

Each row has the "id" the other automation tools take, the schedule as raw cron plus a plain-English description, "enabled", "nextRunAt" (null when disabled or manual-only), and the latest run's status and times. "systemKey" marks a catalog system automation: its title, prompt and mode are managed by Eva, only its schedule, model, enabled and email settings can change. ${TIMEZONE_NOTE}

A shared monorepo automation appears once, under the first app that surfaces it. Prompts are cut to ${FINDING_TEXT_LIMIT} characters here; get_automation_runs shows the full prompt.`,
      mutating: false,
      input: { ...repoRefArgs },
      handler: (ref) =>
        guarded(async () => {
          const repos = await targetRepos(ref);
          if ("isError" in repos) return repos;

          const perRepo = await Promise.all(
            repos.map(async (repo) => ({
              repo,
              automations: await mcpCallAsUser(
                ctx,
                clerkUserId,
                {
                  type: "query",
                  path: "automations:list",
                  args: { repoId: repo.id },
                },
                z.array(automationSchema),
              ),
            })),
          );

          const seen = new Set<string>();
          const rows: Array<{ repo: RepoInfo; automation: Automation }> = [];
          for (const { repo, automations } of perRepo) {
            for (const automation of automations) {
              if (seen.has(automation._id)) continue;
              seen.add(automation._id);
              rows.push({ repo, automation });
            }
          }

          const automations = await Promise.all(
            rows.map(async ({ repo, automation }) => {
              const [lastRun] = await listRuns(automation._id);
              return {
                id: automation._id,
                numId: automation.numId ?? null,
                title: automation.title,
                repo: repoRefLabel(repo),
                path:
                  automation.numId === undefined
                    ? null
                    : `${repoBasePath({ owner: repo.owner, name: repo.name, rootDirectory: repo.rootDirectory ?? undefined })}/automations/${automation.numId}`,
                enabled: automation.enabled,
                ...scheduleSummary(automation),
                prompt: truncate(automation.description, FINDING_TEXT_LIMIT),
                model: automation.model ?? "repo default",
                readOnly: automation.readOnly === true,
                actionsEnabled: automation.actionsEnabled === true,
                shared: automation.shared === true,
                sendEmail: automation.sendEmail === true,
                systemKey: automation.systemKey ?? null,
                lastRun: lastRun
                  ? {
                      id: lastRun._id,
                      status: lastRun.status,
                      startedAt: isoTime(lastRun.startedAt),
                      finishedAt: isoTime(lastRun.finishedAt),
                    }
                  : null,
              };
            }),
          );

          return textResult({ count: automations.length, automations });
        }),
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // get_automation_runs
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "get_automation_runs",
      description: `Recent runs of one automation, newest first, with the automation's full prompt. Each run has its status ("queued", "running", "success", "error", "cancelled"), start and finish times (UTC), PR link, error, a summary cut to ${SUMMARY_LIMIT} characters, and its findings.

Each finding has an "id" for create_tasks_from_automation_findings, a severity, and "taskId" once a task was made from it. "triage" is Eva's own ranking: its severity and, when it looks like open work already covers it, the duplicate task's number and probability. Finding descriptions are cut to ${FINDING_TEXT_LIMIT} characters. At most 50 runs are kept for listing.`,
      mutating: false,
      input: {
        automationId: automationIdArg,
        limit: z
          .number()
          .min(1)
          .max(50)
          .default(10)
          .describe("Max runs to return (default 10, max 50)."),
      },
      handler: ({ automationId, limit }) =>
        guarded(async () => {
          // automations:get is the access check; listRuns itself does not
          // check the repo, so it is only called after this succeeds.
          const automation = await getAutomation(automationId);
          if (!automation) return notFound();
          const runs = (await listRuns(automationId)).slice(0, limit);
          return textResult({
            automation: {
              id: automation._id,
              title: automation.title,
              enabled: automation.enabled,
              ...scheduleSummary(automation),
              prompt: truncate(automation.description, SUMMARY_LIMIT),
            },
            runs: runs.map((run) => ({
              id: run._id,
              status: run.status,
              startedAt: isoTime(run.startedAt),
              finishedAt: isoTime(run.finishedAt),
              prUrl: run.prUrl ?? null,
              error:
                run.error === undefined
                  ? null
                  : truncate(run.error, FINDING_TEXT_LIMIT),
              summary:
                run.resultSummary === undefined
                  ? null
                  : truncate(run.resultSummary, SUMMARY_LIMIT),
              findings: (run.findings ?? []).map((finding) => ({
                id: finding.id,
                title: finding.title,
                severity: finding.severity,
                description: truncate(finding.description, FINDING_TEXT_LIMIT),
                filePaths: finding.filePaths ?? [],
                taskId: finding.taskId ?? null,
                triage: finding.triage ?? null,
              })),
            })),
          });
        }),
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // create_automation / update_automation
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "create_automation",
      description: `Create a new automation in one repo: a prompt an agent runs on a schedule. ${DURABLE_NOTE} ${TIMEZONE_NOTE}

New automations start disabled unless you pass enabled: true, and use the repo's default model unless you pass one. An enabled automation with no schedule never fires on its own; start it with run_automation_now. Replies with the new automation's id and its schedule as Eva will run it. If the settings step fails, the automation still exists with just its title; fix it with update_automation using the returned id.`,
      mutating: true,
      input: {
        ...repoRefArgs,
        title: z.string().min(1).describe("Short name shown in the Eva UI."),
        ...settingsArgs,
        shared: z
          .boolean()
          .optional()
          .describe(
            "Monorepo only: true stores it on the parent repo so every app sees it.",
          ),
      },
      handler: ({ repoId, repoName, app, title, shared, ...fields }) =>
        guarded(async () => {
          const badSchedule = scheduleError(fields.cronSchedule);
          if (badSchedule) return badSchedule;
          const { userId } = await mcpGetContext(ctx, clerkUserId);
          const ref = await resolveRepoRef({ repoId, repoName, app }, userId);
          if ("isError" in ref) return ref;
          await assertUserRepoAccess(ref.repoId, userId);

          // The UI creates with a title, then saves settings through update;
          // this follows the same two calls.
          const id = await mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "mutation",
              path: "automations:create",
              args: { repoId: ref.repoId, title },
            },
            z.string(),
          );
          const updateArgs = buildUpdateArgs(id, fields);
          if ("isError" in updateArgs) return updateArgs;
          if (shared !== undefined) {
            updateArgs.shared = shared;
            updateArgs.contextRepoId = ref.repoId;
          }
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            { type: "mutation", path: "automations:update", args: updateArgs },
            z.null(),
          );

          const created = await getAutomation(id);
          if (!created) return notFound();
          return textResult({
            id,
            title: created.title,
            enabled: created.enabled,
            ...scheduleSummary(created),
          });
        }),
    }),
  );

  tools.push(
    defineTool({
      name: "update_automation",
      description: `Change an existing automation: prompt, schedule, model, mode, email, or enable/disable it. Only the fields you pass change. ${TIMEZONE_NOTE}

System automations (listed with a "systemKey") only accept cronSchedule, model, enabled and sendEmail; title, description, readOnly and actionsEnabled are managed by Eva and are rejected. Replies with the automation's schedule and enabled state after the change.`,
      mutating: true,
      input: {
        automationId: automationIdArg,
        title: z.string().min(1).optional().describe("New name."),
        ...settingsArgs,
      },
      handler: ({ automationId, ...fields }) =>
        guarded(async () => {
          const badSchedule = scheduleError(fields.cronSchedule);
          if (badSchedule) return badSchedule;
          const updateArgs = buildUpdateArgs(automationId, fields);
          if ("isError" in updateArgs) return updateArgs;
          if (Object.keys(updateArgs).length === 1) {
            return errorResult("Pass at least one field to change.");
          }
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            { type: "mutation", path: "automations:update", args: updateArgs },
            z.null(),
          );
          const updated = await getAutomation(automationId);
          if (!updated) return notFound();
          return textResult({
            id: updated._id,
            title: updated.title,
            enabled: updated.enabled,
            ...scheduleSummary(updated),
          });
        }),
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // run_automation_now / cancel_automation_run
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "run_automation_now",
      description: `Start one run of an automation immediately, outside its schedule. Works whether or not the automation is enabled; the schedule is unchanged.

Rejected when the automation has no prompt or already has a run queued or running. Replies with the new run's id and status; the run takes minutes, so check it later with get_automation_runs, or stop it with cancel_automation_run.`,
      mutating: true,
      input: { automationId: automationIdArg },
      handler: ({ automationId }) =>
        guarded(async () => {
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "mutation",
              path: "automations:runNow",
              args: { automationId },
            },
            z.null(),
          );
          const [run] = await listRuns(automationId);
          return textResult({
            started: true,
            runId: run?._id ?? null,
            status: run?.status ?? null,
          });
        }),
    }),
  );

  tools.push(
    defineTool({
      name: "cancel_automation_run",
      description: `Cancel an automation run that is still queued or running: stops its workflow and marks it "cancelled" (not an error). Finished runs are left alone and the call is rejected. The automation and its schedule are not affected; to stop future runs, use update_automation with enabled: false.`,
      mutating: true,
      input: {
        automationId: automationIdArg,
        runId: z
          .string()
          .describe(
            "The run's id, from get_automation_runs or run_automation_now.",
          ),
      },
      handler: ({ automationId, runId }) =>
        guarded(async () => {
          const automation = await getAutomation(automationId);
          if (!automation) return notFound();
          const run = (await listRuns(automationId)).find(
            (candidate) => candidate._id === runId,
          );
          if (!run) {
            return errorResult(
              "That run is not among this automation's recent runs.",
            );
          }
          if (run.status !== "queued" && run.status !== "running") {
            return errorResult(
              `That run already finished with status "${run.status}"; there is nothing to cancel.`,
            );
          }
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            { type: "mutation", path: "automations:cancelRun", args: { runId } },
            z.null(),
          );
          return textResult({ cancelled: true, runId });
        }),
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // delete_automation
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "delete_automation",
      description: `Delete an automation: its schedule stops and it disappears from Eva. Run history is kept on the server but no longer shown; a deleted system automation comes back with its history if reinstalled from the Hub. There is no undo for a custom automation from here.

Ask the user first and pass confirmed: true only after they say yes. To pause instead, use update_automation with enabled: false.`,
      mutating: true,
      input: { automationId: automationIdArg, confirmed: confirmedDeleteArg },
      handler: ({ automationId }) =>
        guarded(async () => {
          const automation = await getAutomation(automationId);
          if (!automation) return notFound();
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "mutation",
              path: "automations:remove",
              args: { id: automationId },
            },
            z.null(),
          );
          return textResult({
            deleted: true,
            id: automationId,
            title: automation.title,
          });
        }),
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // create_tasks_from_automation_findings
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "create_tasks_from_automation_findings",
      description: `Turn findings from one automation run into Eva quick tasks in the automation's repo, as the Findings panel's "Create tasks" does. Each task gets the finding's title, description, files and suggested fix, and the automation's model.

Findings that already have a task are skipped, so repeating a call does not duplicate work. autoRun: true also starts each new task's agent straight away. Replies with the ids of the tasks created (empty when every finding already had one).`,
      mutating: true,
      input: {
        runId: z
          .string()
          .describe("The run's id, from get_automation_runs."),
        findingIds: z
          .array(z.string())
          .min(1)
          .describe("Finding ids from that run, from get_automation_runs."),
        autoRun: z
          .boolean()
          .default(false)
          .describe(
            "true starts each new task immediately; false (default) leaves them in todo.",
          ),
      },
      handler: ({ runId, findingIds, autoRun }) =>
        guarded(async () => {
          const taskIds = await mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "mutation",
              path: "automations:createTasksFromFindings",
              args: { runId, findingIds, autoRun },
            },
            z.array(z.string()),
          );
          return textResult({ created: taskIds.length, taskIds, autoRun });
        }),
    }),
  );

  return tools;
}
