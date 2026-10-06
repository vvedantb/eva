import { z } from "zod";
import type { Spec, UIElement } from "@json-render/core";
import { chatUiCatalog } from "@eva/shared/generativeUi";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { repoBasePath } from "../_githubRepos/helpers";
import { getEvaBaseUrl } from "../_taskWorkflow/urls";
import { buildChatUiCandidates } from "../_generativeUi/candidates";
import type { ChatUiBlock } from "../_generativeUi/schema";
import {
  entityAccess,
  entityRefArgs,
  entitySummary,
  withSelfDefault,
  type EntityRef,
  type EntityTarget,
} from "./entityRef";
import {
  errorResult,
  mcpCallAsUser,
  mcpGetContext,
  textResult,
  type McpCredentials,
} from "./toolShared";
import { defineTool, type EvaTool } from "./registry";
import type { ChatDetails } from "./chatSelfQueries";

const DEFAULT_LOG_LINES = 200;
const MAX_LOG_LINES = 2000;

/** Sandbox states in which the VM is not safe to exec on or relaunch into. */
const UNSETTLED_SANDBOX_STATUSES = new Set(["starting", "stopping", "closed"]);

const envVarScope = z.enum(["repo", "team"]);
type EnvVarScope = z.infer<typeof envVarScope>;

/** Only the name and flag survive: the UI's list also carries a masked value. */
const envVarNames = z.array(
  z.object({ key: z.string(), sandboxExclude: z.boolean() }),
);

/** Eva's settings page for one scope's env vars, as a path and, when configured, a full link. */
function envSettingsLink(
  target: EntityTarget,
  scope: EnvVarScope,
): { path: string; url?: string } {
  const path = `${repoBasePath({
    owner: target.repoOwner,
    name: target.repoName,
    rootDirectory: target.repoRootDirectory,
  })}/settings/env-variables/${scope}`;
  try {
    return { path, url: `${getEvaBaseUrl()}${path}` };
  } catch {
    return { path };
  }
}

/** PR number parsed off a GitHub pull request link. */
function prNumber(prUrl: string | undefined): number | undefined {
  const match = prUrl?.match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

/** The `{ kind, <kind>Id }` owner shape `sandboxPanes` mutations take. */
function sandboxOwner(target: EntityTarget): Record<string, string> {
  if (target.kind === "session") {
    return { kind: target.kind, sessionId: target.targetId };
  }
  if (target.kind === "task") {
    return { kind: target.kind, taskId: target.targetId };
  }
  return { kind: target.kind, projectId: target.targetId };
}

/**
 * The fixed request-a-secret panel, laid out here rather than by the layout
 * model: the arrangement never varies, so a model round trip would only add
 * latency and a failure mode. Elements come from the same candidate recipes
 * render_ui uses, so the chat renders them identically.
 */
function envRequestSpec(blocks: ChatUiBlock[], title: string): Spec {
  const candidates = buildChatUiCandidates(blocks, title);
  const elements: Record<string, UIElement> = {};
  const content: string[] = [];
  const buttons: string[] = [];
  blocks.forEach((block, index) => {
    const candidate = candidates.find((c) => c.id === `block_${index}`);
    if (!candidate) return;
    elements[candidate.id] = { ...candidate.element, children: [] };
    (block.kind === "button" ? buttons : content).push(candidate.id);
  });
  const panel = candidates.find((c) => c.id === "layout_panel");
  const row = candidates.find((c) => c.id === "layout_stack_horizontal");
  if (panel && row && buttons.length > 0) {
    elements.buttons = { ...row.element, children: buttons };
    content.push("buttons");
  }
  if (panel) elements.root = { ...panel.element, children: content };
  return { root: "root", elements };
}

/**
 * Tools an agent uses on the chat it is running in: what this chat is, what
 * its dev server is doing, how to recover its background and startup
 * commands, which env vars exist, and how to steer the user's Preview tab. Every tool defaults to the caller's own chat and also accepts
 * any other chat the user can reach.
 */
export function chatSelfTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): EvaTool[] {
  const tools: EvaTool[] = [];
  const { clerkUserId } = credentials;
  const { resolveEntityTarget } = entityAccess(ctx, credentials);

  /**
   * The sandbox id when the chat's sandbox is active and its VM is running
   * right now, otherwise an error naming why. Read without waking the VM.
   */
  async function runningSandboxId(
    target: EntityTarget,
    action: string,
  ): Promise<string | ReturnType<typeof errorResult>> {
    if (
      target.sandboxId === undefined ||
      target.sandboxStatus !== "active"
    ) {
      return errorResult(
        `This ${target.kind}'s sandbox is "${target.sandboxStatus}". ${action} only runs on an active sandbox; call start_sandbox first, or wait for it to settle.`,
      );
    }
    const vm = await ctx.runAction(
      internal.mcp.chatSelfNodeActions.sandboxVmState,
      { repoId: target.repoId, sandboxId: target.sandboxId },
    );
    if (!vm.running) {
      return errorResult(
        `The VM is "${vm.vmState}", not running, so nothing was run. Call start_sandbox first.`,
      );
    }
    return target.sandboxId;
  }

  /** The session row when the target is a session (orchestrators run no repo services). */
  async function sessionRow(target: EntityTarget) {
    return target.kind === "session"
      ? await ctx.runQuery(internal.sessions.getInternal, {
          id: target.targetId,
        })
      : null;
  }

  /** Resolves the named chat (or the caller's own) plus its details row. */
  async function resolveChat(
    ref: EntityRef,
  ): Promise<
    | { target: EntityTarget; details: ChatDetails }
    | ReturnType<typeof errorResult>
  > {
    const { userId } = await mcpGetContext(ctx, clerkUserId);
    const resolved = await resolveEntityTarget(
      withSelfDefault(ref, credentials),
      userId,
    );
    if ("isError" in resolved) return resolved;
    const { target } = resolved;
    const details = await ctx.runQuery(
      internal.mcp.chatSelfQueries.getChatDetails,
      { kind: target.kind, id: target.targetId, repoId: target.repoId },
    );
    if (!details) {
      return errorResult("That chat or its repo no longer exists.");
    }
    return { target, details };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // get_chat_context
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "get_chat_context",
      description: `Everything about the chat you are running in, in one call: what it is (kind, id, number, title, status, Eva path), which repo and branch it works on and off, its pull request if one is open, linked repos cloned beside it, and how its sandbox is set up — status, dev port and command, the repo's startup and background commands, which optional tabs (desktop, editor, custom app tabs) are on, and the tmux session the Preview Console dev server runs in.

Name no chat and it answers for your own. Use it before guessing at ports, branches or PR numbers. Read-only.`,
      mutating: false,
      input: entityRefArgs,
      handler: async (ref) => {
        const chat = await resolveChat(ref);
        if ("isError" in chat) return chat;
        const { target, details } = chat;
        return textResult({
          ...entitySummary(target),
          status: target.status,
          baseBranch: details.baseBranch,
          pr: details.prUrl
            ? {
                url: details.prUrl,
                number: prNumber(details.prUrl),
                state: details.prState,
              }
            : null,
          linkedRepos: details.linkedRepos,
          sandbox: {
            status: target.sandboxStatus,
            devPort: details.devPort,
            devCommand: details.devCommand,
            previewPath: details.previewPath,
            startupCommands: details.startupCommands,
            backgroundCommands: details.backgroundCommands,
            previewConsoleTmuxSession: details.consoleTmuxSession,
          },
          tabs: {
            desktop: details.vncEnabled,
            editor: details.vscodeEnabled,
            custom: details.customTabs,
          },
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // get_dev_server_logs
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "get_dev_server_logs",
      description: `The last lines of the chat's Preview Console — the tmux pane Eva runs the app dev server in — plus whether anything is listening on the app port. Use it when the preview is blank, erroring or stuck compiling, before deciding to restart.

Name no chat and it reads your own. "lines" defaults to ${DEFAULT_LOG_LINES} (max ${MAX_LOG_LINES}). It never wakes a stopped sandbox: when the VM is not running you get a note instead of logs. "portListening" false with a quiet log usually means the server crashed; restart_dev_server brings it back.`,
      mutating: false,
      input: {
        ...entityRefArgs,
        lines: z
          .number()
          .int()
          .min(1)
          .max(MAX_LOG_LINES)
          .default(DEFAULT_LOG_LINES)
          .describe(
            `How many lines of Console history to return (default ${DEFAULT_LOG_LINES}, max ${MAX_LOG_LINES}).`,
          ),
      },
      handler: async ({ lines, ...ref }) => {
        const chat = await resolveChat(ref);
        if ("isError" in chat) return chat;
        const { target, details } = chat;
        const summary = {
          ...entitySummary(target),
          sandboxStatus: target.sandboxStatus,
          devPort: details.devPort,
          tmuxSession: details.consoleTmuxSession,
        };

        if (target.sandboxId === undefined || target.sandboxStatus !== "active") {
          return textResult({
            ...summary,
            logs: null,
            note: `This ${target.kind}'s sandbox is "${target.sandboxStatus}", so there is no dev server to read. Call start_sandbox first.`,
          });
        }
        if (details.devPort === undefined) {
          return textResult({
            ...summary,
            logs: null,
            note: "No dev port is recorded for this chat yet; the sandbox may still be setting up.",
          });
        }

        const result = await ctx.runAction(
          internal.mcp.chatSelfNodeActions.tailDevServerLogs,
          {
            repoId: target.repoId,
            sandboxId: target.sandboxId,
            ownerKey: details.ownerKey,
            devPort: details.devPort,
            lines,
          },
        );
        if (!result.running) {
          return textResult({
            ...summary,
            logs: null,
            note: `The VM is "${result.vmState}", not running. Logs are not read from a stopped VM because that would wake it; call start_sandbox if you need it.`,
          });
        }
        return textResult({
          ...summary,
          listenPort: result.listenPort,
          portListening: result.portListening,
          logs: result.output,
          ...(result.consoleSessionExists
            ? {}
            : {
                note: "The Preview Console tmux session does not exist, so no dev server was launched through Eva. Use restart_dev_server to start it.",
              }),
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // restart_dev_server
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "restart_dev_server",
      description: `Stop whatever is serving the chat's app port and relaunch the dev server in the Preview Console, with the chat's own dev command and port — the same launch Eva does at sandbox start. Use this instead of ever starting your own dev server (no \`pnpm dev &\`, no second server on another port): a server you start yourself is invisible in the Console and fights Eva's for the port.

Name no chat and it restarts your own. Refused while the sandbox is starting, stopping or closed, and it never wakes a stopped VM. The reply means the launch was sent, not that the app is up: a cold compile takes 1-2 minutes, so follow with get_dev_server_logs or get_preview_url.`,
      mutating: true,
      input: entityRefArgs,
      handler: async (ref) => {
        const chat = await resolveChat(ref);
        if ("isError" in chat) return chat;
        const { target, details } = chat;

        if (
          target.sandboxId === undefined ||
          UNSETTLED_SANDBOX_STATUSES.has(target.sandboxStatus)
        ) {
          return errorResult(
            `This ${target.kind}'s sandbox is "${target.sandboxStatus}". Restart only runs on an active sandbox; while it is starting, Eva launches the dev server itself.`,
          );
        }
        if (details.devPort === undefined || details.devCommand === undefined) {
          return errorResult(
            "No dev command or port is recorded for this chat or its repo, so there is nothing to relaunch. Set them in the repo's app settings.",
          );
        }

        const result = await ctx.runAction(
          internal.mcp.chatSelfNodeActions.restartDevServer,
          {
            repoId: target.repoId,
            sandboxId: target.sandboxId,
            ownerKey: details.ownerKey,
            devPort: details.devPort,
            devCommand: details.devCommand,
            rootDirectory: target.repoRootDirectory ?? "",
          },
        );
        if (!result.restarted) {
          return errorResult(
            `The VM is "${result.vmState}", not running, so nothing was restarted. Call start_sandbox first.`,
          );
        }
        return textResult({
          ...entitySummary(target),
          restarted: true,
          devPort: details.devPort,
          listenPort: result.listenPort,
          devCommand: details.devCommand,
          note: "Launch sent. Give it a minute to compile, then check get_dev_server_logs.",
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // list_env_vars
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "list_env_vars",
      description: `The names of the environment variables configured for the chat's repo and its team — names only, never values. Each row says its scope ("repo" or "team") and whether it is excluded from the sandbox (an excluded var exists in Eva but is not in your environment).

Name no chat and it lists for your own. Use it to check whether a secret you need exists before asking for it; if it is missing, use request_env_var. The reply includes the Eva settings page where the user manages them.`,
      mutating: false,
      input: entityRefArgs,
      handler: async (ref) => {
        const chat = await resolveChat(ref);
        if ("isError" in chat) return chat;
        const { target, details } = chat;

        const repoVars = await mcpCallAsUser(
          ctx,
          clerkUserId,
          {
            type: "query",
            path: "repoEnvVars:list",
            args: { repoId: target.repoId },
          },
          envVarNames,
        );
        const teamVars =
          details.repoTeamId === undefined
            ? []
            : await mcpCallAsUser(
                ctx,
                clerkUserId,
                {
                  type: "query",
                  path: "teamEnvVars:list",
                  args: { teamId: details.repoTeamId },
                },
                envVarNames,
              );

        const envVars = [
          ...repoVars.map((row) => ({ ...row, scope: "repo" })),
          ...teamVars.map((row) => ({ ...row, scope: "team" })),
        ].map((row) => ({
          name: row.key,
          scope: row.scope,
          excludedFromSandbox: row.sandboxExclude,
        }));

        return textResult({
          ...entitySummary(target),
          envVars,
          count: envVars.length,
          settings: {
            repo: envSettingsLink(target, "repo"),
            ...(details.repoTeamId === undefined
              ? {}
              : { team: envSettingsLink(target, "team") }),
          },
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // request_env_var
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "request_env_var",
      description: `Ask the user to add a missing environment variable. Posts a panel into the chat naming the key and why you need it, with a button to Eva's env settings page and a button the user presses to tell you it is done (that press comes back to you as a chat message).

Use it when list_env_vars shows a secret is missing — never ask the user to paste a secret into chat, and never put a value here: this tool takes the name only. A newly added var may only reach your environment after the sandbox restarts. Name no chat and it posts into your own.`,
      mutating: true,
      input: {
        ...entityRefArgs,
        key: z
          .string()
          .regex(
            /^[A-Za-z_][A-Za-z0-9_]{0,127}$/,
            "Must be an env var name: letters, digits and underscores, not starting with a digit.",
          )
          .describe('The variable name, e.g. "STRIPE_SECRET_KEY".'),
        reason: z
          .string()
          .min(1)
          .max(500)
          .describe(
            "One or two sentences on what needs it and what breaks without it. Shown to the user.",
          ),
        scope: envVarScope
          .default("repo")
          .describe(
            'Where it should live: "repo" (this repo only, the default) or "team" (every repo on the team).',
          ),
      },
      handler: async ({ key, reason, scope, ...ref }) => {
        const chat = await resolveChat(ref);
        if ("isError" in chat) return chat;
        const { target } = chat;
        const settings = envSettingsLink(target, scope);

        const blocks: ChatUiBlock[] = [
          { kind: "callout", title: key, text: reason, tone: "warning" },
          {
            kind: "keyValue",
            items: [
              { label: "Key", value: key },
              {
                label: "Add it under",
                value: scope === "team" ? "Team env vars" : "Repo env vars",
              },
            ],
          },
          {
            kind: "text",
            text: "Add the value in Eva settings, not in this chat.",
            emphasis: "muted",
          },
        ];
        if (settings.url !== undefined) {
          blocks.push({
            kind: "button",
            label: "Open env settings",
            url: settings.url,
            variant: "primary",
          });
        }
        blocks.push({
          kind: "button",
          label: `I added ${key}`,
          reply: `I added ${key} in Eva's ${scope} env settings.`,
          variant: "secondary",
        });
        const title = "Environment variable needed";
        const spec = envRequestSpec(blocks, title);
        if (!chatUiCatalog.validate(spec).success) {
          return errorResult("Could not build the request panel.");
        }

        const panelId = await ctx.runMutation(internal.chatUi.create, {
          entityKind: target.kind,
          entityId: target.targetId,
          prompt: `request_env_var ${key}`,
          title,
          spec: JSON.stringify(spec),
          elementCount: Object.keys(spec.elements).length,
        });
        if (panelId === null) {
          return errorResult("That chat no longer exists.");
        }
        return textResult({
          ...entitySummary(target),
          panelId,
          status: "requested",
          key,
          scope,
          settings,
          note: "The user has been asked. Wait for their reply before relying on the var, and restart the sandbox if it must be in your environment.",
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // set_preview_path
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "set_preview_path",
      description: `Point the user's Preview tab at a route and/or port, the same as typing it into the Preview address bar. Use it to show the user the page you just built ("/settings/billing") or an app on another port.

Name no chat and it steers your own. Pass "path", "port" or both. The choice sticks for that chat. Changing "port" also changes which port Eva treats as the app port for that chat (get_preview_url, restart_dev_server), so only set it to a port something is serving.`,
      mutating: true,
      input: {
        ...entityRefArgs,
        path: z
          .string()
          .max(2000)
          .optional()
          .describe('Route to show, e.g. "/dashboard?tab=usage".'),
        port: z
          .number()
          .int()
          .min(1)
          .max(65535)
          .optional()
          .describe("Port to preview, e.g. 3001."),
      },
      handler: async ({ path, port, ...ref }) => {
        if (path === undefined && port === undefined) {
          return errorResult('Pass "path", "port" or both.');
        }
        const chat = await resolveChat(ref);
        if ("isError" in chat) return chat;
        const { target } = chat;
        const owner = sandboxOwner(target);

        if (port !== undefined) {
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "mutation",
              path: "sandboxPanes:setPreviewPort",
              args: { owner, port },
            },
            z.null(),
          );
        }
        if (path !== undefined) {
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            {
              type: "mutation",
              path: "sandboxPanes:setPreviewPath",
              args: { owner, path },
            },
            z.null(),
          );
        }
        return textResult({
          ...entitySummary(target),
          ...(path !== undefined ? { previewPath: path } : {}),
          ...(port !== undefined ? { previewPort: port } : {}),
          updated: true,
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // restart_background_commands
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "restart_background_commands",
      description: `Relaunch the repo's configured background commands — long-running daemons such as \`npx convex dev\` or \`supabase start\` — in the chat's sandbox. Use it when one of them died while the sandbox kept running (get_chat_context lists them; each logs to /tmp/bg-<index>.log). Eva already launches them on every sandbox start and resume, so this is only for recovery.

Every command is relaunched, including ones still alive: each is stopped first (its whole process group, and any stray Convex backend for a Convex command), then started again. So it never leaves duplicate daemons, but it does briefly interrupt the healthy ones. If the VM turns out to be wedged, Eva may stop and resume it once.

Name no chat and it relaunches your own. Refused unless the sandbox is active and its VM running; it never wakes a stopped VM, and it errors when the repo has no background commands. For sessions the reply lists launch errors; for tasks and projects the launch is queued and the reply means it was sent. Background commands never re-run startup commands (seeds, imports) — that is rerun_startup_commands.`,
      mutating: true,
      input: entityRefArgs,
      handler: async (ref) => {
        const chat = await resolveChat(ref);
        if ("isError" in chat) return chat;
        const { target, details } = chat;

        if (details.backgroundCommands.length === 0) {
          return errorResult(
            "This repo has no background commands configured, so there is nothing to relaunch. Add them in the repo's app settings.",
          );
        }
        const sandboxId = await runningSandboxId(
          target,
          "Relaunching background commands",
        );
        if (typeof sandboxId !== "string") return sandboxId;

        const summary = {
          ...entitySummary(target),
          backgroundCommands: details.backgroundCommands,
        };
        if (target.kind === "task" || target.kind === "project") {
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            target.kind === "task"
              ? {
                  type: "mutation",
                  path: "agentTasks:runBackgroundCommands",
                  args: { taskId: target.targetId },
                }
              : {
                  type: "mutation",
                  path: "projects:runProjectBackgroundCommands",
                  args: { projectId: target.targetId },
                },
            z.null(),
          );
          return textResult({
            ...summary,
            relaunched: "queued",
            note: "Relaunch queued. Check /tmp/bg-<index>.log in the sandbox in a few seconds to confirm each daemon came up.",
          });
        }

        // Sessions have no public mutation for this; resolveChat has already
        // access-checked the chat, so the launcher is called directly.
        const session = await sessionRow(target);
        const result = await ctx.runAction(
          internal.sandbox.runBackgroundCommands,
          {
            sandboxId,
            repoId: target.repoId,
            ...(session ? { sessionId: session._id } : {}),
          },
        );
        return textResult({
          ...summary,
          relaunched: result.commandCount,
          errors: result.errors,
          note:
            result.errors.length > 0
              ? "Some commands failed to launch; see errors."
              : "Launched. Check /tmp/bg-<index>.log in the sandbox to confirm each daemon came up.",
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // rerun_startup_commands
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "rerun_startup_commands",
      description: `Re-run the repo's startup commands — the one-time setup Eva runs on a fresh sandbox, such as seeding a database, importing data or running migrations — even though they already ran. Use it to recover when a seed or import failed.

WARNING: startup commands can reset, reseed or overwrite the sandbox's local data, and for tasks and projects this restarts the whole sandbox startup flow (the sandbox goes to "starting", and a stopped one is started). If local data might be lost, ask the user before calling this. It is not the fix for a dead daemon; use restart_background_commands for that.

Name no chat and it runs for your own. Refused while the sandbox is starting or stopping, and it errors when the repo has no startup commands. Sessions: only on an active sandbox with a running VM (it never wakes a stopped one); the commands run in the background, each for up to 10 minutes, alongside whatever is already running. The reply means the run was started, not that it finished.`,
      mutating: true,
      input: entityRefArgs,
      handler: async (ref) => {
        const chat = await resolveChat(ref);
        if ("isError" in chat) return chat;
        const { target, details } = chat;

        if (details.startupCommands.length === 0) {
          return errorResult(
            "This repo has no startup commands configured, so there is nothing to re-run. Add them in the repo's app settings.",
          );
        }
        const summary = {
          ...entitySummary(target),
          startupCommands: details.startupCommands,
        };

        if (target.kind === "task" || target.kind === "project") {
          if (
            target.sandboxStatus === "starting" ||
            target.sandboxStatus === "stopping"
          ) {
            return errorResult(
              `This ${target.kind}'s sandbox is "${target.sandboxStatus}". Wait for it to settle before re-running startup commands.`,
            );
          }
          // The public mutation applies the status and phase gates and starts
          // the regular startup workflow with the force flag set.
          await mcpCallAsUser(
            ctx,
            clerkUserId,
            target.kind === "task"
              ? {
                  type: "mutation",
                  path: "agentTasks:retryStartupCommands",
                  args: { taskId: target.targetId },
                }
              : {
                  type: "mutation",
                  path: "projects:retryProjectStartupCommands",
                  args: { projectId: target.targetId },
                },
            z.null(),
          );
          return textResult({
            ...summary,
            rerun: "started",
            note: "The sandbox startup flow is running with startup commands forced. Its status is \"starting\" until it finishes; check get_chat_context, then get_dev_server_logs.",
          });
        }

        const sandboxId = await runningSandboxId(
          target,
          "Re-running startup commands",
        );
        if (typeof sandboxId !== "string") return sandboxId;

        // Sessions have no startup workflow to restart, so the forced run is
        // scheduled on its own (the action is too long to await in-line).
        // resolveChat has already access-checked the chat.
        await ctx.scheduler.runAfter(0, internal.sandbox.runStartupCommands, {
          sandboxId,
          repoId: target.repoId,
          force: true,
        });
        return textResult({
          ...summary,
          rerun: "scheduled",
          note: "Startup commands are running in the background. There is no progress signal: check the effect (for example, the seeded data) after a few minutes.",
        });
      },
    }),
  );

  return tools;
}
