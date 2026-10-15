import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { repoBasePath } from "../_githubRepos/helpers";
import {
  errorResult,
  matchRepoByName,
  mcpGetContext,
  mcpListUserRepos,
  repoRefLabel,
  resolveAveThreadId,
  textResult,
  MCP_CLAUDE_MODELS,
  type McpCredentials,
  type RepoInfo,
} from "./toolShared";
import { defineTool, type EvaTool } from "./registry";

const agentKindArg = z
  .enum(["session", "task", "project"])
  .describe(
    'Which kind of agent: "session" (interactive chat session), "task" (quick task) or "project" (a project\'s sandbox chat).',
  );

const agentIdArg = z
  .string()
  .describe("The agent's Convex id, as returned by list_agents.");

const modelArg = z
  .enum(MCP_CLAUDE_MODELS)
  .optional()
  .describe(
    'Claude model ("opus", "sonnet", "haiku", or "fable"). Sessions are locked to the provider they were created with, so omit this to reuse the agent\'s own model — passing a model from another provider is rejected.',
  );

/**
 * Shared by the user-MCP fleet tools and the master-only send_agent_message.
 * Each backing action runs as the user against authQuery/authMutation, and
 * those hasRepoAccess checks are the enforcement — the tools skip the sandbox
 * token's single-repo pin so an OAuth connector can reach every agent the
 * user can already reach in Eva.
 */
function fleetHelpers(credentials: McpCredentials, ctx: ActionCtx) {
  const { clerkUserId, aveThreadId } = credentials;

  async function resolveRepoScope(
    repoName: string | undefined,
    app: string | undefined,
    userId: string,
  ): Promise<{ repos: RepoInfo[] } | ReturnType<typeof errorResult>> {
    const repos = await mcpListUserRepos(ctx, userId);
    if (!repoName) return { repos };
    const matched = matchRepoByName(repos, repoName, app);
    if ("isError" in matched) return matched;
    return { repos: [matched.repo] };
  }

  /**
   * Watch needs a live Manager Ave thread to wake. Ave's own run carries its
   * id; any other MCP caller registers against the user's live thread. There
   * is no way to wake an OAuth MCP client itself.
   */
  async function resolveWatchThreadId(): Promise<
    string | ReturnType<typeof errorResult>
  > {
    const threadId = await resolveAveThreadId(ctx, credentials);
    if (threadId === undefined) {
      return errorResult(
        "No Manager Ave chat to wake when this agent finishes. Send Manager Ave a message in Eva first, then retry — or poll get_agent_state. An MCP client cannot be woken itself.",
      );
    }
    return threadId;
  }

  return {
    clerkUserId,
    aveThreadId,
    resolveRepoScope,
    resolveWatchThreadId,
  };
}

/**
 * Fleet tools every MCP caller gets: list/inspect/stop/create-session/watch.
 * send_agent_message stays behind the Ave gate — it is the one tool defined as
 * speaking *as Manager Ave*.
 */
export function fleetTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): EvaTool[] {
  const tools: EvaTool[] = [];
  const { clerkUserId, aveThreadId, resolveRepoScope, resolveWatchThreadId } =
    fleetHelpers(credentials, ctx);
  const { entityId } = credentials;

  // ───────────────────────────────────────────────────────────────────────────
  // list_agents
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "list_agents",
      description:
        "List the other Eva agents running under your user across every repo you can access — sessions and quick tasks alike. Use this first to find an agent id for get_agent_state, send_agent_message, or stop_agent. Your own master session is never listed.",
      mutating: false,
      input: {
        repoName: z
          .string()
          .optional()
          .describe(
            'Limit to one repo (e.g. "eva" or "vvedantb/eva"). Omit to list agents across all your repos.',
          ),
        app: z
          .string()
          .optional()
          .describe(
            'App name within a monorepo (e.g. "web"). Used with repoName when a repo has multiple apps.',
          ),
        includeIdle: z
          .boolean()
          .default(false)
          .describe(
            "By default only agents with a turn in flight are returned. Set true to also include idle sessions and not-yet-started tasks.",
          ),
      },
      handler: async ({ repoName, app, includeIdle }) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const scope = await resolveRepoScope(repoName, app, userId);
        if ("isError" in scope) return scope;

        const agents = await ctx.runAction(
          internal.mcp.nodeActions.orchestratorListAgents,
          {
            clerkUserId,
            repos: scope.repos.map((repo) => ({
              id: repo.id,
              // App-qualified so a monorepo's app rows are distinguishable in
              // the fleet table (they are separate repo records sharing a name).
              fullName: repoRefLabel(repo),
            })),
            includeIdle,
            excludeEntityId: entityId,
          },
        );

        return textResult({ agents, count: agents.length });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // get_agent_state
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "get_agent_state",
      description:
        'Inspect one agent in depth: status, whether a turn is in flight, what it is doing right now (live activity), the tail of its transcript, how many messages are queued behind it, its preview deployment, and every pull request it holds ("pullRequests", primary first). Long messages are truncated. For a project, "status" is its phase, the transcript is its sandbox chat, "isExecuting" also counts a running build or spec workflow, and "buildRunning" says whether a build is in flight.',
      mutating: false,
      input: {
        kind: agentKindArg,
        id: agentIdArg,
        transcriptTail: z
          .number()
          .min(0)
          .max(50)
          .default(10)
          .describe("How many of the most recent messages to return."),
      },
      handler: async ({ kind, id, transcriptTail }) => {
        await mcpGetContext(ctx, clerkUserId);
        const state = await ctx.runAction(
          internal.mcp.nodeActions.orchestratorGetAgentState,
          { clerkUserId, kind, id, transcriptTail },
        );
        return textResult({ agent: state });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // stop_agent
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "stop_agent",
      description:
        'Cancel the agent\'s in-flight turn. WARNING: cancelling a session immediately starts its next queued message, so stopping a session with a backlog does not leave it idle — check get_agent_state first and expect to stop it again. For a project this stops only its sandbox chat; a running build keeps going and the reply says so with "buildRunning" (use cancel_project_build to stop it).',
      mutating: true,
      input: {
        kind: agentKindArg,
        id: agentIdArg,
      },
      handler: async ({ kind, id }) => {
        await mcpGetContext(ctx, clerkUserId);
        const { buildRunning } = await ctx.runAction(
          internal.mcp.nodeActions.orchestratorStopAgent,
          { clerkUserId, kind, id },
        );
        return textResult({
          kind,
          id,
          status: "cancel_requested",
          ...(buildRunning
            ? {
                buildRunning,
                note: "The project build is still running. Only its sandbox chat was cancelled; call cancel_project_build if the user wants the build stopped too.",
              }
            : {}),
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // create_session
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "create_session",
      description:
        "Start a new interactive session in any repo you can access and send it a first message. The session boots its own sandbox and runs the message as soon as that sandbox is ready. You are notified when it finishes.",
      mutating: true,
      input: {
        repoName: z
          .string()
          .describe(
            'Repo to open the session in (e.g. "eva" or "vvedantb/eva"). Resolved against your connected repos.',
          ),
        app: z
          .string()
          .optional()
          .describe(
            'App name within a monorepo (e.g. "web"). Required when a repo has multiple apps.',
          ),
        title: z
          .string()
          .optional()
          .describe("Session title. A title is generated if omitted."),
        message: z
          .string()
          .describe("The first message to run in the session."),
        // No `model`: the session runs on the repo's configured default model.
        baseBranch: z
          .string()
          .optional()
          .describe(
            "Branch to base work off of. If omitted, uses the repo's default base branch.",
          ),
        linkedRepos: z
          .array(z.string())
          .optional()
          .describe(
            'Extra repos to clone into the same sandbox beside repoName, each on its own branch and PR (e.g. ["eva", "vvedantb/other-repo"]). Same "name" or "owner/name" grammar as repoName. Mutually exclusive with "group".',
          ),
        group: z
          .string()
          .optional()
          .describe(
            'Name of a saved codebase group (see list_repos) whose linked repos prefill the selection. Its saved primary repo must match repoName. Mutually exclusive with "linkedRepos".',
          ),
        installDependencies: z
          .boolean()
          .optional()
          .describe(
            "Whether linked repos install dependencies on clone. Defaults to true.",
          ),
      },
      handler: async ({
        repoName,
        app,
        title,
        message,
        baseBranch,
        linkedRepos,
        group,
        installDependencies,
      }) => {
        const { userId } = await mcpGetContext(ctx, clerkUserId);
        const repos = await mcpListUserRepos(ctx, userId);
        const matched = matchRepoByName(repos, repoName, app);
        if ("isError" in matched) return matched;
        const { repo } = matched;

        if (linkedRepos && linkedRepos.length > 0 && group) {
          return errorResult(
            'Pass "linkedRepos" or "group", not both — they are two ways to pick the same session\'s extra repos.',
          );
        }

        let linkedRepoIds: string[] | undefined;
        if (linkedRepos && linkedRepos.length > 0) {
          linkedRepoIds = [];
          for (const linkedName of linkedRepos) {
            const matchedLinked = matchRepoByName(repos, linkedName, undefined);
            if ("isError" in matchedLinked) return matchedLinked;
            linkedRepoIds.push(matchedLinked.repo.id);
          }
        }

        let repoGroupId: string | undefined;
        if (group) {
          const groups = await ctx.runQuery(
            internal.repoGroups.listForUserInternal,
            { userId },
          );
          const normalized = group.trim().toLowerCase();
          const matches = groups.filter(
            (g) => g.name.toLowerCase() === normalized,
          );
          if (matches.length === 0) {
            const available = groups.map((g) => g.name).join(", ") || "(none)";
            return errorResult(
              `Codebase group "${group}" not found. Your groups: ${available}`,
            );
          }
          if (matches.length > 1) {
            return errorResult(
              `Multiple codebase groups are named "${group}". Rename one in Eva to disambiguate.`,
            );
          }
          const [found] = matches;
          if (found.primaryRepoId !== repo.id) {
            const primaryLabel = found.primaryRepo
              ? `${found.primaryRepo.owner}/${found.primaryRepo.name}`
              : "a repo you can no longer reach";
            return errorResult(
              `Codebase group "${group}" is saved for ${primaryLabel}, not ${repoRefLabel(repo)}. Pass repoName="${primaryLabel}", or drop "group".`,
            );
          }
          repoGroupId = String(found._id);
        }

        const created = await ctx.runAction(
          internal.mcp.nodeActions.orchestratorCreateSession,
          {
            clerkUserId,
            repoId: repo.id,
            title,
            message,
            baseBranch,
            aveThreadId,
            linkedRepoIds,
            repoGroupId,
            installDependencies,
          },
        );

        const basePath = repoBasePath({
          owner: repo.owner,
          name: repo.name,
          rootDirectory: repo.rootDirectory ?? undefined,
        });

        return textResult({
          sessionId: created.sessionId,
          numId: created.numId,
          repo: repoRefLabel(repo),
          path: `${basePath}/sessions/${created.numId}`,
          linkedRepos: created.linkedRepos,
          status: "created",
        });
      },
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // watch_agent / unwatch_agent
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "watch_agent",
      description:
        'Subscribe to an agent so Manager Ave is woken when it finishes its work. create_session, send_agent_message, and cross-repo task creation already do this for you — use this for agents you did not start. From any other MCP client this registers against your Manager Ave chat, not the client (which cannot be woken). For a project, you are woken when its sandbox chat finishes a turn, not when a build finishes.',
      mutating: true,
      input: {
        kind: agentKindArg,
        id: agentIdArg,
      },
      handler: async ({ kind, id }) => {
        const threadId = await resolveWatchThreadId();
        if (typeof threadId !== "string") return threadId;
        await mcpGetContext(ctx, clerkUserId);
        await ctx.runAction(internal.mcp.nodeActions.orchestratorSetWatch, {
          clerkUserId,
          kind,
          id,
          aveThreadId: threadId,
        });
        return textResult({ kind, id, watched: true });
      },
    }),
  );

  tools.push(
    defineTool({
      name: "unwatch_agent",
      description: "Stop being woken when this agent finishes.",
      mutating: true,
      input: {
        kind: agentKindArg,
        id: agentIdArg,
      },
      handler: async ({ kind, id }) => {
        await mcpGetContext(ctx, clerkUserId);
        await ctx.runAction(internal.mcp.nodeActions.orchestratorSetWatch, {
          clerkUserId,
          kind,
          id,
          aveThreadId: undefined,
        });
        return textResult({ kind, id, watched: false });
      },
    }),
  );

  return tools;
}

/**
 * Tools only Manager Ave's own run gets. send_agent_message stays here because
 * it is defined as Ave speaking.
 */
export function orchestratorTools(
  credentials: McpCredentials,
  ctx: ActionCtx,
): EvaTool[] {
  const tools: EvaTool[] = [];
  const { clerkUserId, aveThreadId } = fleetHelpers(credentials, ctx);

  // ───────────────────────────────────────────────────────────────────────────
  // send_agent_message
  // ───────────────────────────────────────────────────────────────────────────

  tools.push(
    defineTool({
      name: "send_agent_message",
      description: `Send a chat message to another agent as yourself. If the agent is mid-turn the message is queued and runs when the current turn finishes; if it is idle a new turn starts immediately. Returns which of the two happened.

The message is marked as sent via MCP, and the agent is registered so you are notified when it finishes.`,
      mutating: true,
      input: {
        kind: agentKindArg,
        id: agentIdArg,
        message: z.string().describe("The message to send to the agent."),
        model: modelArg,
      },
      handler: async ({ kind, id, message, model }) => {
        await mcpGetContext(ctx, clerkUserId);
        const result = await ctx.runAction(
          internal.mcp.nodeActions.orchestratorSendMessage,
          {
            clerkUserId,
            kind,
            id,
            message,
            model,
            aveThreadId,
            sentViaOrchestrator: true,
          },
        );
        return textResult({ kind, id, ...result });
      },
    }),
  );

  return tools;
}
