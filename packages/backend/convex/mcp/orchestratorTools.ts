import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
  textResult,
  MCP_CLAUDE_MODELS,
  type McpCredentials,
  type RepoInfo,
} from "./toolShared";

const agentKindArg = z
  .enum(["session", "task"])
  .describe(
    'Which kind of agent: "session" (interactive chat session) or "task" (quick task).',
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
  const { clerkUserId, entityId, entityKind } = credentials;

  /** The master's own session id, carried on its sandbox token when present. */
  const tokenMasterSessionId =
    entityKind === "session" ? entityId : undefined;

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
   * Watch needs a live Manager Ave session to wake. The orchestrator sandbox
   * token carries that id; a user OAuth token does not, so we look the user's
   * Ave up instead. There is no way to wake the OAuth MCP client itself.
   */
  async function resolveWatchMasterSessionId(): Promise<
    string | ReturnType<typeof errorResult>
  > {
    if (tokenMasterSessionId !== undefined) return tokenMasterSessionId;
    const { userId } = await mcpGetContext(ctx, clerkUserId);
    const masterSessionId = await ctx.runQuery(
      internal.mcp.queries.getLiveOrchestratorSessionIdForUser,
      { userId },
    );
    if (masterSessionId === null) {
      return errorResult(
        "No Manager Ave session to wake when this agent finishes. Open Manager Ave in Eva first, then retry — or poll get_agent_state. An OAuth MCP client cannot be woken the way the master sandbox can.",
      );
    }
    return masterSessionId;
  }

  return {
    clerkUserId,
    entityId,
    tokenMasterSessionId,
    resolveRepoScope,
    resolveWatchMasterSessionId,
  };
}

/**
 * Fleet tools every MCP caller gets: list/inspect/stop/create-session/watch.
 * send_agent_message stays behind the orchestrator gate — it is the one tool
 * that is defined as speaking *as the master session*.
 */
export function registerFleetTools(
  server: McpServer,
  credentials: McpCredentials,
  ctx: ActionCtx,
): void {
  const {
    clerkUserId,
    entityId,
    tokenMasterSessionId,
    resolveRepoScope,
    resolveWatchMasterSessionId,
  } = fleetHelpers(credentials, ctx);

  // ───────────────────────────────────────────────────────────────────────────
  // list_agents
  // ───────────────────────────────────────────────────────────────────────────

  server.tool(
    "list_agents",
    "List the other Eva agents running under your user across every repo you can access — sessions and quick tasks alike. Use this first to find an agent id for get_agent_state, send_agent_message, or stop_agent. Your own master session is never listed.",
    {
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
    async ({ repoName, app, includeIdle }) => {
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
  );

  // ───────────────────────────────────────────────────────────────────────────
  // get_agent_state
  // ───────────────────────────────────────────────────────────────────────────

  server.tool(
    "get_agent_state",
    "Inspect one agent in depth: status, whether a turn is in flight, what it is doing right now (live activity), the tail of its transcript, how many messages are queued behind it, and its preview deployment. Long messages are truncated.",
    {
      kind: agentKindArg,
      id: agentIdArg,
      transcriptTail: z
        .number()
        .min(0)
        .max(50)
        .default(10)
        .describe("How many of the most recent messages to return."),
    },
    async ({ kind, id, transcriptTail }) => {
      await mcpGetContext(ctx, clerkUserId);
      const state = await ctx.runAction(
        internal.mcp.nodeActions.orchestratorGetAgentState,
        { clerkUserId, kind, id, transcriptTail },
      );
      return textResult({ agent: state });
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // stop_agent
  // ───────────────────────────────────────────────────────────────────────────

  server.tool(
    "stop_agent",
    "Cancel the agent's in-flight turn. WARNING: cancelling a session immediately starts its next queued message, so stopping a session with a backlog does not leave it idle — check get_agent_state first and expect to stop it again.",
    {
      kind: agentKindArg,
      id: agentIdArg,
    },
    async ({ kind, id }) => {
      await mcpGetContext(ctx, clerkUserId);
      await ctx.runAction(internal.mcp.nodeActions.orchestratorStopAgent, {
        clerkUserId,
        kind,
        id,
      });
      return textResult({ kind, id, status: "cancel_requested" });
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // create_session
  // ───────────────────────────────────────────────────────────────────────────

  server.tool(
    "create_session",
    "Start a new interactive session in any repo you can access and send it a first message. The session boots its own sandbox and runs the message as soon as that sandbox is ready. You are notified when it finishes.",
    {
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
      message: z.string().describe("The first message to run in the session."),
      // No `model`: the session runs on the repo's configured default model.
      baseBranch: z
        .string()
        .optional()
        .describe(
          "Branch to base work off of. If omitted, uses the repo's default base branch.",
        ),
    },
    async ({ repoName, app, title, message, baseBranch }) => {
      const { userId } = await mcpGetContext(ctx, clerkUserId);
      const repos = await mcpListUserRepos(ctx, userId);
      const matched = matchRepoByName(repos, repoName, app);
      if ("isError" in matched) return matched;
      const { repo } = matched;

      const created = await ctx.runAction(
        internal.mcp.nodeActions.orchestratorCreateSession,
        {
          clerkUserId,
          repoId: repo.id,
          title,
          message,
          baseBranch,
          masterSessionId: tokenMasterSessionId,
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
        status: "created",
      });
    },
  );

  // ───────────────────────────────────────────────────────────────────────────
  // watch_agent / unwatch_agent
  // ───────────────────────────────────────────────────────────────────────────

  server.tool(
    "watch_agent",
    "Subscribe to an agent so Manager Ave is woken when it finishes its work. create_session, send_agent_message, and cross-repo task creation already do this for you — use this for agents you did not start. From a user MCP token this registers against your Manager Ave session, not the MCP client (which cannot be woken).",
    {
      kind: agentKindArg,
      id: agentIdArg,
    },
    async ({ kind, id }) => {
      const master = await resolveWatchMasterSessionId();
      if (typeof master !== "string") return master;
      await mcpGetContext(ctx, clerkUserId);
      await ctx.runAction(internal.mcp.nodeActions.orchestratorSetWatch, {
        clerkUserId,
        kind,
        id,
        masterSessionId: master,
      });
      return textResult({ kind, id, watched: true });
    },
  );

  server.tool(
    "unwatch_agent",
    "Stop being woken when this agent finishes.",
    {
      kind: agentKindArg,
      id: agentIdArg,
    },
    async ({ kind, id }) => {
      await mcpGetContext(ctx, clerkUserId);
      await ctx.runAction(internal.mcp.nodeActions.orchestratorSetWatch, {
        clerkUserId,
        kind,
        id,
        masterSessionId: undefined,
      });
      return textResult({ kind, id, watched: false });
    },
  );
}

/**
 * Tools that only the user's master ("orchestrator") session gets.
 * send_agent_message stays here because it is defined as the master speaking.
 */
export function registerOrchestratorTools(
  server: McpServer,
  credentials: McpCredentials,
  ctx: ActionCtx,
): void {
  const { clerkUserId, tokenMasterSessionId } = fleetHelpers(
    credentials,
    ctx,
  );

  // ───────────────────────────────────────────────────────────────────────────
  // send_agent_message
  // ───────────────────────────────────────────────────────────────────────────

  server.tool(
    "send_agent_message",
    `Send a chat message to another agent as yourself. If the agent is mid-turn the message is queued and runs when the current turn finishes; if it is idle a new turn starts immediately. Returns which of the two happened.

The message is marked as sent via MCP, and the agent is registered so you are notified when it finishes.`,
    {
      kind: agentKindArg,
      id: agentIdArg,
      message: z.string().describe("The message to send to the agent."),
      model: modelArg,
    },
    async ({ kind, id, message, model }) => {
      await mcpGetContext(ctx, clerkUserId);
      const result = await ctx.runAction(
        internal.mcp.nodeActions.orchestratorSendMessage,
        {
          clerkUserId,
          kind,
          id,
          message,
          model,
          masterSessionId: tokenMasterSessionId,
          sentViaOrchestrator: true,
        },
      );
      return textResult({ kind, id, ...result });
    },
  );
}
