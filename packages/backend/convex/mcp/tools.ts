import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  registerFleetTools,
  registerOrchestratorTools,
} from "./orchestratorTools";
import { registerEntityTools } from "./entityTools";
import { buildEvaOrchestratorContent } from "../_systemSkills/evaOrchestrator";
import {
  entityAccess,
  entityRefArgs,
  entitySummary,
  repoRefArgs,
} from "./entityRef";

import {
  errorResult,
  matchRepoByName,
  repoRefLabel,
  mcpGetContext,
  mcpListUserRepos,
  textResult,
  MCP_CLAUDE_MODELS,
  type McpCredentials,
  type RepoInfo,
} from "./toolShared";

interface RepoCredentials {
  convexUrl: string;
  deployKey: string;
}

export function registerTools(
  server: McpServer,
  credentials: McpCredentials,
  ctx: ActionCtx,
): void {
  const { clerkUserId, scopedRepoId, entityId, entityKind } = credentials;
  const isOrchestrator = credentials.isOrchestrator === true;

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper functions
  // ─────────────────────────────────────────────────────────────────────────────

  // Repo and chat resolution live in the shared leaf so every tool that acts on
  // an existing entity — here and in entityTools — runs the same access checks.
  const { assertRepoAccess, resolveRepoRef, resolveEntityTarget } =
    entityAccess(ctx, credentials);

  async function getContext(): Promise<{ deployKey: string; userId: string }> {
    return mcpGetContext(ctx, clerkUserId);
  }

  async function getUserRepos(userId: string): Promise<RepoInfo[]> {
    return mcpListUserRepos(ctx, userId);
  }

  async function resolveTargetWithAccess(
    repoId: string,
    _deployKey: string,
    userId: string,
    environment: "staging" | "prod",
  ): Promise<RepoCredentials> {
    await assertRepoAccess(repoId, userId);

    const repoCreds = await ctx.runAction(
      internal.mcp.nodeActions.getRepoConvexCredentials,
      { repoId, userId, environment },
    );
    if (!repoCreds) {
      const expected =
        environment === "prod"
          ? "PROD_CONVEX_URL and PROD_CONVEX_DEPLOY_KEY"
          : "CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL/VITE_CONVEX_URL) and CONVEX_DEPLOY_KEY";
      throw new Error(
        `Repo ${repoId} has no Convex credentials for environment "${environment}". Ensure ${expected} are set in its env vars in Eva.`,
      );
    }
    return repoCreds;
  }

  const environmentArg = z
    .enum(["staging", "prod"])
    .default("prod")
    .describe(
      'Which Convex deployment to query. "prod" (default) reads from PROD_CONVEX_URL/PROD_CONVEX_DEPLOY_KEY. "staging" reads from NEXT_PUBLIC_CONVEX_URL/CONVEX_DEPLOY_KEY.',
    );

  // ─────────────────────────────────────────────────────────────────────────────
  // list_repos
  // ─────────────────────────────────────────────────────────────────────────────

  server.tool(
    "list_repos",
    "List all GitHub repos you have access to. Call this first to discover available repos and their instructions for data routing (e.g. which backend to query for which data).",
    {},
    async () => {
      const { userId } = await getContext();
      const repos = await getUserRepos(userId);

      // Advertise which repos have a Postgres read replica configured, so the
      // agent can pick a postgres_query target without probing each repo.
      const replicaRepoIds = new Set(
        await ctx.runQuery(internal.mcp.queries.reposWithPostgresReplica, {
          repoIds: repos.map((r) => r.id),
        }),
      );

      const repoList = repos.map((r) => ({
        id: r.id,
        owner: r.owner,
        name: r.name,
        app: r.rootDirectory,
        hasPostgresReplica: replicaRepoIds.has(r.id),
        ...(r.mcpRootPrompt ? { mcpRootPrompt: r.mcpRootPrompt } : {}),
      }));

      const rootPrompts = repos
        .filter((r) => r.mcpRootPrompt)
        .map(
          (r) =>
            `[${r.owner}/${r.name}${r.rootDirectory ? ` (${r.rootDirectory})` : ""}]: ${r.mcpRootPrompt}`,
        );

      if (rootPrompts.length > 0) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(repoList, null, 2) },
            {
              type: "text" as const,
              text: `\n---\nRepo instructions:\n${rootPrompts.join("\n")}`,
            },
          ],
        };
      }

      return textResult(repoList);
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // list_tables
  // ─────────────────────────────────────────────────────────────────────────────

  server.tool(
    "list_tables",
    "List all tables in a repo's Convex deployment with their field definitions, indexes, and inferred shapes.",
    {
      ...repoRefArgs,
      environment: environmentArg,
    },
    async ({ repoId, repoName, app, environment }) => {
      const { deployKey, userId } = await getContext();
      const ref = await resolveRepoRef({ repoId, repoName, app }, userId);
      if ("isError" in ref) return ref;
      const target = await resolveTargetWithAccess(
        ref.repoId,
        deployKey,
        userId,
        environment,
      );

      const tables = await ctx.runAction(internal.mcp.nodeActions.listTables, {
        convexUrl: target.convexUrl,
        deployKey: target.deployKey,
      });

      return textResult(tables);
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // query_table
  // ─────────────────────────────────────────────────────────────────────────────

  server.tool(
    "query_table",
    "Read a page of documents from a Convex table. Returns documents ordered by creation time. Use the continueCursor for pagination.",
    {
      table: z.string().describe("Table name"),
      order: z
        .enum(["asc", "desc"])
        .default("desc")
        .describe("Sort order by creation time"),
      limit: z
        .number()
        .max(1000)
        .default(100)
        .describe("Max documents to return (default 100, max 1000)"),
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor from a previous query"),
      ...repoRefArgs,
      environment: environmentArg,
    },
    async ({
      table,
      order,
      limit,
      cursor,
      repoId,
      repoName,
      app,
      environment,
    }) => {
      const { deployKey, userId } = await getContext();
      const ref = await resolveRepoRef({ repoId, repoName, app }, userId);
      if ("isError" in ref) return ref;
      const target = await resolveTargetWithAccess(
        ref.repoId,
        deployKey,
        userId,
        environment,
      );

      const result = await ctx.runAction(internal.mcp.nodeActions.queryTable, {
        convexUrl: target.convexUrl,
        deployKey: target.deployKey,
        table,
        order,
        numItems: limit,
        cursor: cursor ?? null,
      });

      return textResult({
        page: result.page,
        isDone: result.isDone,
        continueCursor: result.continueCursor,
        count: result.page.length,
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // get_document
  // ─────────────────────────────────────────────────────────────────────────────

  server.tool(
    "get_document",
    "Get a single document by its Convex document ID.",
    {
      id: z
        .string()
        .describe('The document ID (e.g. "j572abc123..." or "kd83xyz...")'),
      ...repoRefArgs,
      environment: environmentArg,
    },
    async ({ id, repoId, repoName, app, environment }) => {
      if (!/^[a-zA-Z0-9_]+$/.test(id)) {
        return errorResult(
          "Invalid document ID format. IDs should be alphanumeric.",
        );
      }
      const { deployKey, userId } = await getContext();
      const ref = await resolveRepoRef({ repoId, repoName, app }, userId);
      if ("isError" in ref) return ref;
      const target = await resolveTargetWithAccess(
        ref.repoId,
        deployKey,
        userId,
        environment,
      );

      const result = await ctx.runAction(
        internal.mcp.nodeActions.runTestQuery,
        {
          convexUrl: target.convexUrl,
          deployKey: target.deployKey,
          code: `return await ctx.db.get(${JSON.stringify(id)});`,
        },
      );
      if (!result.ok) return errorResult(result.error);

      const output: { document: unknown; logLines?: string[] } = {
        document: result.value,
      };
      if (result.logLines.length > 0) {
        output.logLines = result.logLines;
      }

      return textResult(output);
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // run_query
  // ─────────────────────────────────────────────────────────────────────────────

  server.tool(
    "run_query",
    `Run arbitrary read-only Convex query code against a repo's database. This is the most powerful tool — use it for joins, aggregations, filters, and complex data retrieval.

Provide the body of an async handler function. The \`ctx\` object is available with:
- ctx.db.query("tableName") — query a table (supports .filter(), .order(), .collect(), .first(), .take(n))
- ctx.db.get(id) — get a document by ID

Example: "const users = await ctx.db.query('users').collect(); return users.filter(u => u.role === 'admin').length;"`,
    {
      code: z
        .string()
        .describe(
          "The handler body code. Must return a value. Example: \"return await ctx.db.query('users').collect();\"",
        ),
      ...repoRefArgs,
      environment: environmentArg,
    },
    async ({ code, repoId, repoName, app, environment }) => {
      const { deployKey, userId } = await getContext();
      const ref = await resolveRepoRef({ repoId, repoName, app }, userId);
      if ("isError" in ref) return ref;
      const target = await resolveTargetWithAccess(
        ref.repoId,
        deployKey,
        userId,
        environment,
      );

      const result = await ctx.runAction(
        internal.mcp.nodeActions.runTestQuery,
        {
          convexUrl: target.convexUrl,
          deployKey: target.deployKey,
          code,
        },
      );
      if (!result.ok) return errorResult(result.error);

      const output: { result: unknown; logLines?: string[] } = {
        result: result.value,
      };
      if (result.logLines.length > 0) {
        output.logLines = result.logLines;
      }

      return textResult(output);
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // count_table
  // ─────────────────────────────────────────────────────────────────────────────

  server.tool(
    "count_table",
    "Count the total number of documents in a table.",
    {
      table: z.string().describe("Table name"),
      ...repoRefArgs,
      environment: environmentArg,
    },
    async ({ table, repoId, repoName, app, environment }) => {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
        return errorResult(
          "Invalid table name. Use alphanumeric characters and underscores.",
        );
      }
      const { deployKey, userId } = await getContext();
      const ref = await resolveRepoRef({ repoId, repoName, app }, userId);
      if ("isError" in ref) return ref;
      const target = await resolveTargetWithAccess(
        ref.repoId,
        deployKey,
        userId,
        environment,
      );

      const result = await ctx.runAction(
        internal.mcp.nodeActions.runTestQuery,
        {
          convexUrl: target.convexUrl,
          deployKey: target.deployKey,
          code: `const docs = await ctx.db.query(${JSON.stringify(table)}).collect(); return docs.length;`,
        },
      );
      if (!result.ok) return errorResult(result.error);

      return textResult({ table, count: result.value });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // postgres_query
  // ─────────────────────────────────────────────────────────────────────────────

  server.tool(
    "postgres_query",
    `Run read-only SQL against a repo's Postgres read replica (the POSTGRES_READ_REPLICA_URL env var configured for the repo in Eva).

Constraints:
- Read-only: every query runs inside a READ ONLY transaction; writes fail.
- Single statement only — multi-statement SQL (e.g. "SELECT 1; SELECT 2") is rejected.
- 30 second statement timeout.
- Always add a LIMIT — large result sets are truncated to the limit and a ~1 MB byte cap.

For schema discovery, query information_schema (e.g. "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'").`,
    {
      sql: z.string().describe("A single read-only SQL statement to execute."),
      limit: z
        .number()
        .max(1000)
        .default(100)
        .describe("Max rows to return (default 100, max 1000)."),
      ...repoRefArgs,
    },
    async ({ sql, limit, repoId, repoName, app }) => {
      const { userId } = await getContext();
      const ref = await resolveRepoRef({ repoId, repoName, app }, userId);
      if ("isError" in ref) return ref;
      await assertRepoAccess(ref.repoId, userId);

      const result = await ctx.runAction(
        internal.mcp.postgres.runPostgresQuery,
        { repoId: ref.repoId, sql, maxRows: limit },
      );

      if (!result.ok) {
        if (result.errorCode === "missing_config") {
          return errorResult(
            `This repo has no Postgres read replica configured. Add a POSTGRES_READ_REPLICA_URL env var in the repo's Environment Variables settings in Eva (append "?sslmode=require" if the server needs TLS, and mark it as excluded from sandboxes so the URL never reaches task sandboxes).`,
          );
        }
        return errorResult(`Postgres query failed: ${result.error}`);
      }

      return textResult({
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rowCount,
        truncated: result.truncated,
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Task creation tools
  // ─────────────────────────────────────────────────────────────────────────────

  async function resolveRepoByName(
    repoName: string,
    app: string | undefined,
    userId: string,
  ): Promise<{ repo: RepoInfo } | ReturnType<typeof errorResult>> {
    return matchRepoByName(await getUserRepos(userId), repoName, app);
  }

  /** The master session's own id, carried on the orchestrator sandbox token. */
  const masterSessionId =
    isOrchestrator && entityKind === "session" ? entityId : undefined;

  /**
   * Registers a task the master just created so it is woken when that task
   * finishes. No-op for every non-orchestrator caller.
   */
  async function watchTaskAsOrchestrator(taskId: string): Promise<void> {
    if (masterSessionId === undefined) return;
    await ctx.runAction(internal.mcp.nodeActions.orchestratorSetWatch, {
      clerkUserId,
      kind: "task",
      id: taskId,
      masterSessionId,
    });
  }

  const taskArgs = {
    title: z.string().describe("Short task title"),
    description: z
      .string()
      .describe(
        "The full prompt, plan, or instructions for the task (plain text or markdown)",
      ),
    repoName: z
      .string()
      .describe(
        'Repo name (e.g. "eva" or "vvedantb/eva"). Resolved by matching against your connected repos.',
      ),
    // No `model` here on purpose: a task runs on the repo's configured default
    // model (createQuickTask: `args.model ?? repo.defaultModel`). The picker
    // used to be a Claude-only enum, which steered every MCP caller into
    // overriding repos that run other providers.
    baseBranch: z
      .string()
      .optional()
      .describe(
        "Branch to base work off of. If omitted, uses the repo's default base branch.",
      ),
    app: z
      .string()
      .optional()
      .describe(
        'App name within a monorepo (e.g. "web", "mcp", "chrome-extension"). Matches against rootDirectory. Required when a repo has multiple apps.',
      ),
    projectId: z
      .string()
      .optional()
      .describe(
        "Optional project ID (Convex ID from the projects table) to attach this task to. When provided, the task's number is automatically set to the next position in the project.",
      ),
  };

  type TaskInput = {
    title: string;
    description: string;
    repoName: string;
    baseBranch?: string;
    app?: string;
    projectId?: string;
  };

  async function createTaskForRepo(
    input: TaskInput,
    userId: string,
  ): Promise<
    { taskId: string; repoFullName: string } | ReturnType<typeof errorResult>
  > {
    const resolved = await resolveRepoByName(input.repoName, input.app, userId);
    if ("isError" in resolved) return resolved;
    const { repo } = resolved;

    const taskId = await ctx.runAction(internal.mcp.nodeActions.createTask, {
      clerkUserId,
      repoId: repo.id,
      title: input.title,
      description: input.description,
      baseBranch: input.baseBranch,
      projectId: input.projectId,
    });

    await watchTaskAsOrchestrator(taskId);

    return { taskId, repoFullName: `${repo.owner}/${repo.name}` };
  }

  server.tool(
    "create_and_run_task",
    "Create a task on the Eva platform and immediately start execution. Use this to send plans, prompts, or instructions to Eva for autonomous execution against a repo.",
    taskArgs,
    async (input) => {
      const { userId } = await getContext();
      const result = await createTaskForRepo(input, userId);
      if ("isError" in result) return result;

      await ctx.runAction(internal.mcp.nodeActions.startTaskExecution, {
        clerkUserId,
        taskId: result.taskId,
      });

      return textResult({
        taskId: result.taskId,
        repo: result.repoFullName,
        title: input.title,
        status: "execution_started",
      });
    },
  );

  server.tool(
    "create_task",
    "Create a task on the Eva platform without starting execution. Use this to queue tasks for later review or manual execution.",
    taskArgs,
    async (input) => {
      const { userId } = await getContext();
      const result = await createTaskForRepo(input, userId);
      if ("isError" in result) return result;

      return textResult({
        taskId: result.taskId,
        repo: result.repoFullName,
        title: input.title,
        status: "created",
      });
    },
  );

  server.tool(
    "create_tasks_batch",
    `Create multiple tasks at once with dependencies between them, and optionally group them into a project.

Each task in the array has a title, description, and optional dependsOn array of 0-based indices referencing other tasks in the same batch.

Example: [
  { "title": "Setup DB schema", "description": "..." },
  { "title": "Build API", "description": "...", "dependsOn": [0] },
  { "title": "Build UI", "description": "...", "dependsOn": [1] }
]

This creates 3 tasks where Build API depends on Setup DB schema, and Build UI depends on Build API.`,
    {
      repoName: z
        .string()
        .describe(
          'Repo name (e.g. "eva" or "vvedantb/eva"). Resolved by matching against your connected repos.',
        ),
      tasks: z
        .array(
          z.object({
            title: z.string().describe("Short task title"),
            description: z
              .string()
              .optional()
              .describe("Full prompt/instructions for the task"),
            dependsOn: z
              .array(z.number())
              .optional()
              .describe(
                "Array of 0-based indices of tasks this task depends on",
              ),
          }),
        )
        .describe("Ordered array of tasks to create"),
      projectTitle: z
        .string()
        .optional()
        .describe(
          "If provided, creates a project with this title and assigns all tasks to it",
        ),
      // Same as taskArgs: every task in the batch runs on the repo default.
      baseBranch: z
        .string()
        .optional()
        .describe(
          "Branch to base work off of. If omitted, uses the repo's default base branch.",
        ),
      app: z
        .string()
        .optional()
        .describe(
          'App name within a monorepo (e.g. "web", "mcp"). Required when a repo has multiple apps.',
        ),
    },
    async (input) => {
      const { userId } = await getContext();
      const resolved = await resolveRepoByName(
        input.repoName,
        input.app,
        userId,
      );
      if ("isError" in resolved) return resolved;
      const { repo } = resolved;

      const tasksForMutation = input.tasks.map((t) => ({
        title: t.title,
        description: t.description,
        dependsOn: t.dependsOn,
      }));

      const result = await ctx.runAction(
        internal.mcp.nodeActions.createTasksBatch,
        {
          clerkUserId,
          repoId: repo.id,
          tasks: tasksForMutation,
          projectTitle: input.projectTitle,
          baseBranch: input.baseBranch,
        },
      );

      // Result is typed as 'any' from Convex; launder to unknown, then narrow to
      // an object before spreading so no assertion is needed.
      const rawResult: unknown = result;
      const batchResult =
        typeof rawResult === "object" && rawResult !== null
          ? { ...rawResult }
          : {};

      const created = z
        .object({ taskIds: z.array(z.string()) })
        .safeParse(rawResult);
      if (created.success) {
        for (const taskId of created.data.taskIds) {
          await watchTaskAsOrchestrator(taskId);
        }
      }

      return textResult({
        repo: repoRefLabel(repo),
        ...batchResult,
        taskCount: input.tasks.length,
        status: "created",
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // send_chat_message
  //
  // The one write tool that targets work already in flight. Every caller gets
  // it — an OAuth connector, a sandbox token, the master session — because it
  // grants nothing beyond what the user can already do in that chat: the
  // repo-access check below is the same one the web mutations run.
  //
  // All three sandbox chat surfaces are reachable (session, quick task,
  // project), because all three are somewhere a person can type in the app and
  // all three run their turn on their own branch.
  // ─────────────────────────────────────────────────────────────────────────────

  server.tool(
    "send_chat_message",
    `Send a chat message into an EXISTING Eva session, quick task or project and run it there, exactly as typing in that chat does. Use this to carry on with a pull request Eva already opened. It never creates a new session, task or project.

Name the chat by its Convex "id", by its GitHub "prUrl", or by "numId" plus "kind" and a repo. An idle chat starts its sandbox and runs the message straight away; one mid-turn queues it to run next. The reply says which happened.

Sending wakes the chat's preview sandbox. Call stop_sandbox once you are done with it so the VM does not keep running.`,
    {
      message: z.string().describe("The message to post into the chat."),
      ...entityRefArgs,
      model: z
        .enum(MCP_CLAUDE_MODELS)
        .optional()
        .describe(
          'Claude model for this turn ("opus", "sonnet", "haiku", or "fable"). Omit to reuse the model that chat last ran on.',
        ),
    },
    async ({ message, model, ...ref }) => {
      if (message.trim().length === 0) {
        return errorResult("message cannot be empty.");
      }

      const { userId } = await getContext();
      const resolved = await resolveEntityTarget(ref, userId);
      if ("isError" in resolved) return resolved;
      const { target } = resolved;

      if (entityId !== undefined && target.targetId === entityId) {
        return errorResult(
          "That is this sandbox's own chat. Reply in your own turn instead of messaging yourself.",
        );
      }

      const result = await ctx.runAction(
        internal.mcp.nodeActions.orchestratorSendMessage,
        {
          clerkUserId,
          kind: target.kind,
          id: target.targetId,
          message,
          model,
          masterSessionId,
          // Any MCP send — master sandbox or user OAuth connector — stamps the
          // "via MCP" chat badge so it is not mistaken for a composer-typed turn.
          sentViaOrchestrator: true,
        },
      );

      return textResult({
        ...entitySummary(target),
        delivered: result.delivered,
        model: result.model,
      });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Eva document tools (the `docs` table — design docs/PRDs stored on Eva)
  //
  // NOTE: distinct from `get_document`, which reads a row from a CONNECTED
  // repo's database. These operate on Eva's own docs.
  // ─────────────────────────────────────────────────────────────────────────────

  server.tool(
    "create_eva_doc",
    "Create a design document (PRD) stored on the Eva platform, attached to one of your repos. This is Eva's own document store — NOT a connected repo's database (use get_document for that).",
    {
      repoName: z
        .string()
        .describe(
          'Repo to attach the doc to (e.g. "eva" or "vvedantb/eva"). Resolved against your connected repos.',
        ),
      title: z.string().describe("Document title"),
      content: z.string().describe("Document body as markdown"),
      app: z
        .string()
        .optional()
        .describe(
          'App name within a monorepo (e.g. "web"). Required when a repo has multiple apps.',
        ),
    },
    async ({ repoName, title, content, app }) => {
      const { userId } = await getContext();
      const resolved = await resolveRepoByName(repoName, app, userId);
      if ("isError" in resolved) return resolved;
      const { repo } = resolved;

      const docId = await ctx.runAction(internal.mcp.nodeActions.createEvaDoc, {
        clerkUserId,
        repoId: repo.id,
        title,
        content,
      });

      return textResult({
        docId,
        repo: repoRefLabel(repo),
        title,
        status: "created",
      });
    },
  );

  server.tool(
    "get_eva_doc",
    "Get a single Eva design document (PRD) by its Eva doc ID. Returns null if it does not exist or you lack access.",
    {
      docId: z
        .string()
        .describe("The Eva doc ID (from create_eva_doc or list_eva_docs)"),
    },
    async ({ docId }) => {
      // Resolve identity first (ensures the Eva user row exists) so the
      // as-user query can authenticate.
      await getContext();
      const doc = await ctx.runAction(internal.mcp.nodeActions.getEvaDoc, {
        clerkUserId,
        docId,
      });
      return textResult({ document: doc });
    },
  );

  server.tool(
    "list_eva_docs",
    "List all Eva design documents (PRDs) attached to one of your repos.",
    {
      repoName: z
        .string()
        .describe(
          'Repo whose docs to list (e.g. "eva"). Resolved against your connected repos.',
        ),
      app: z
        .string()
        .optional()
        .describe(
          "App name within a monorepo. Required when a repo has multiple apps.",
        ),
      kind: z
        .enum(["document", "pr-recap"])
        .optional()
        .describe("Filter by doc kind. Omit to list all docs."),
    },
    async ({ repoName, app, kind }) => {
      const { userId } = await getContext();
      const resolved = await resolveRepoByName(repoName, app, userId);
      if ("isError" in resolved) return resolved;
      const { repo } = resolved;

      const docs = await ctx.runAction(internal.mcp.nodeActions.listEvaDocs, {
        clerkUserId,
        repoId: repo.id,
        kind,
      });
      return textResult({ repo: repoRefLabel(repo), docs });
    },
  );

  server.tool(
    "update_eva_doc",
    "Update an Eva design document (PRD). Only the fields you pass are changed.",
    {
      docId: z.string().describe("The Eva doc ID to update"),
      title: z.string().optional().describe("New title"),
      content: z.string().optional().describe("New markdown body"),
      description: z.string().optional().describe("New short description"),
    },
    async ({ docId, title, content, description }) => {
      await getContext();
      await ctx.runAction(internal.mcp.nodeActions.updateEvaDoc, {
        clerkUserId,
        docId,
        title,
        content,
        description,
      });
      return textResult({ docId, status: "updated" });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Team + artifact tools
  // ─────────────────────────────────────────────────────────────────────────────

  async function getUserTeams(
    userId: string,
  ): Promise<{ id: string; name: string }[]> {
    return ctx.runAction(internal.mcp.nodeActions.listUserTeams, { userId });
  }

  async function resolveTeam(
    teamId: string | undefined,
    userId: string,
  ): Promise<{ teamId: string } | ReturnType<typeof errorResult>> {
    const teams = await getUserTeams(userId);
    if (teams.length === 0) {
      return errorResult(
        "You are not a member of any team. Create a team in Eva before saving artifacts.",
      );
    }

    let chosen: { id: string; name: string } | undefined;
    if (teamId) {
      chosen = teams.find((t) => t.id === teamId);
      if (!chosen) {
        const available = teams.map((t) => `${t.name} (${t.id})`).join(", ");
        return errorResult(
          `Team "${teamId}" not found or you are not a member. Your teams: ${available}`,
        );
      }
    } else if (teams.length === 1) {
      chosen = teams[0];
    } else {
      const available = teams.map((t) => `${t.name} (${t.id})`).join(", ");
      return errorResult(
        `You belong to multiple teams. Pass teamId to choose one (call list_teams). Your teams: ${available}`,
      );
    }

    if (!chosen) return errorResult("Could not resolve a team.");
    return { teamId: chosen.id };
  }

  server.tool(
    "list_teams",
    "List the teams you belong to on Eva. Use this to find a teamId for create_artifact.",
    {},
    async () => {
      const { userId } = await getContext();
      const teams = await getUserTeams(userId);
      return textResult(teams);
    },
  );

  server.tool(
    "create_artifact",
    `Save an HTML artifact to Eva and get back a hosted link to view it.

Provide a self-contained HTML document (inline CSS/JS, or CDN links). Eva stores it and hosts it in a sandboxed iframe at the returned viewUrl. The link is viewable by members of the bound team while signed in to Eva.

Do NOT use this for session walkthrough recordings, screen captures, or screenshots. For those, save the file under repo-root recordings/ or screenshots/ with agent-browser and leave it on disk — Eva attaches it to the chat message with the built-in video/image player.`,
    {
      name: z.string().describe("Artifact name/title"),
      html: z
        .string()
        .describe("The full, self-contained HTML document to host"),
      description: z.string().optional().describe("Optional short description"),
      teamId: z
        .string()
        .optional()
        .describe(
          "Team to bind the artifact to (from list_teams). Optional if you belong to exactly one team.",
        ),
      declaredTools: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of Eva MCP tool names the artifact calls (advisory).",
        ),
    },
    async ({ name, html, description, teamId, declaredTools }) => {
      const { userId } = await getContext();
      const resolved = await resolveTeam(teamId, userId);
      if ("isError" in resolved) return resolved;

      const result = await ctx.runAction(
        internal.mcp.nodeActions.createArtifact,
        {
          clerkUserId,
          name,
          html,
          description,
          boundTeamId: resolved.teamId,
          declaredTools: declaredTools ?? [],
        },
      );

      return textResult({
        artifactId: result.artifactId,
        viewUrl: result.viewUrl,
        name,
        status: "created",
      });
    },
  );

  server.tool(
    "get_artifact",
    "Get a saved Eva artifact by its ID, including its hosted view URL.",
    {
      artifactId: z
        .string()
        .describe("The artifact ID (from create_artifact or list_artifacts)"),
    },
    async ({ artifactId }) => {
      await getContext();
      const result = await ctx.runAction(internal.mcp.nodeActions.getArtifact, {
        clerkUserId,
        artifactId,
      });
      if (result === null) return textResult({ artifact: null });
      return textResult(result);
    },
  );

  server.tool(
    "list_artifacts",
    "List all Eva artifacts across the teams you belong to, each with its hosted view URL.",
    {},
    async () => {
      await getContext();
      const artifacts = await ctx.runAction(
        internal.mcp.nodeActions.listArtifacts,
        { clerkUserId },
      );
      return textResult({ artifacts });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Media tools (host a sandbox file at a public URL for PR comments/Linear issues)
  // ─────────────────────────────────────────────────────────────────────────────

  server.tool(
    "upload_media",
    `Host a sandbox file (screenshot, recording, image) so it can be embedded outside Eva — e.g. in a GitHub PR comment or a Linear issue. Returns a one-time uploadUrl: POST the raw bytes to it from the sandbox (\`curl -s -X POST '<uploadUrl>' -H 'Content-Type: image/png' --data-binary @screenshots/before.png\`), read the storageId from the JSON response, then call get_media_url with that storageId to get the permanent public URL.

Do NOT use this instead of leaving files in recordings/ / screenshots/ for chat — Eva attaches those automatically.`,
    {},
    async () => {
      await getContext();
      const uploadUrl = await ctx.runMutation(
        internal.mcp.media.generateUploadUrl,
        {},
      );
      return textResult({ uploadUrl });
    },
  );

  server.tool(
    "get_media_url",
    "Exchange a storageId from upload_media for the file's permanent public URL (plus contentType/size). Embed the URL in PR comments (`![before](url)`) or pass it to external APIs like Linear attachments.",
    {
      storageId: z
        .string()
        .describe("The storageId returned by upload_media's JSON response"),
    },
    async ({ storageId }) => {
      await getContext();
      const result = await ctx.runQuery(internal.mcp.media.getUrl, {
        storageId,
      });
      if (result === null) return errorResult("Unknown storageId.");
      return textResult(result);
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Browser tools (shared desktop Chrome via CDP — session/task/project sandboxes)
  // ─────────────────────────────────────────────────────────────────────────────

  function requireBrowserEntity():
    | { entityKind: "session" | "task" | "project"; entityId: string }
    | ReturnType<typeof errorResult> {
    if (entityKind === undefined || entityId === undefined) {
      return errorResult(
        "browser_* tools require a session, task, or project sandbox (token has no entity).",
      );
    }
    return { entityKind, entityId };
  }

  server.tool(
    "browser_start",
    "Start the sandbox's shared desktop Chrome (CDP on port 9222) so the user can watch live in the Browser tab. Then run `agent-browser connect 9222` once and use agent-browser commands against that browser.",
    {},
    async () => {
      const entity = requireBrowserEntity();
      if ("isError" in entity) return entity;

      const result = await ctx.runAction(
        internal.sandbox.startDesktopForBrowserEntity,
        {
          entityKind: entity.entityKind,
          entityId: entity.entityId,
          clerkUserId,
        },
      );
      if (!result.ok) return errorResult(result.message);
      return {
        content: [{ type: "text" as const, text: result.message }],
      };
    },
  );

  server.tool(
    "browser_lock",
    "Signal that you are actively driving the shared browser. Switches the user's UI to the Browser tab and shows a takeover overlay. Call before interacting; pair with browser_unlock when done.",
    {},
    async () => {
      const entity = requireBrowserEntity();
      if ("isError" in entity) return entity;

      await ctx.runMutation(internal.mcp.browserLock.setAgentBrowsingAt, {
        entityKind: entity.entityKind,
        entityId: entity.entityId,
        locked: true,
      });
      return textResult({ locked: true });
    },
  );

  server.tool(
    "browser_unlock",
    "Clear the agent-browsing soft lock so the user can interact freely in the Browser/Computer tab again.",
    {},
    async () => {
      const entity = requireBrowserEntity();
      if ("isError" in entity) return entity;

      await ctx.runMutation(internal.mcp.browserLock.setAgentBrowsingAt, {
        entityKind: entity.entityKind,
        entityId: entity.entityId,
        locked: false,
      });
      return textResult({ locked: false });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // get_skill
  // ─────────────────────────────────────────────────────────────────────────────

  server.tool(
    "get_skill",
    "Fetch the instructions for an Eva system skill (e.g. eva-ask, eva-plan, eva-capture). The stub SKILL.md in .agents/skills points here so the instructions stay current and are tailored to this repo.",
    {
      name: z
        .string()
        .describe('System skill name, e.g. "eva-capture" or "eva-audit".'),
      repoName: z
        .string()
        .optional()
        .describe(
          'Repo name (e.g. "eva" or "vvedantb/eva"). Only needed outside an Eva sandbox — inside one the repo is taken from the token.',
        ),
      app: z
        .string()
        .optional()
        .describe(
          'App name within a monorepo (e.g. "web"). Matches against rootDirectory. Used with repoName when a repo has multiple apps.',
        ),
    },
    async ({ name, repoName, app }) => {
      // The master's own skill is not repo-scoped and is never installed on a
      // repo — the launch path ships its stub, so serve it off the token claim.
      if (name === "eva-orchestrator" && isOrchestrator) {
        return {
          content: [
            { type: "text" as const, text: buildEvaOrchestratorContent() },
          ],
        };
      }

      const { userId } = await getContext();

      let repoId = scopedRepoId;
      if (!repoId) {
        if (!repoName) {
          return errorResult(
            'get_skill needs a "repoName" when called outside an Eva sandbox.',
          );
        }
        const resolved = await resolveRepoByName(repoName, app, userId);
        if ("isError" in resolved) return resolved;
        repoId = resolved.repo.id;
      }
      await assertRepoAccess(repoId, userId);

      const result = await ctx.runQuery(
        internal.repoSystemSkills.resolveForMcp,
        { repoId, name },
      );
      if (result.status === "repo_not_found") {
        return errorResult(`Repo ${repoId} was not found.`);
      }
      if (result.status === "not_installed") {
        return errorResult(
          `The skill "${name}" is not installed on this repo. Install it in Eva under Settings → Skills, then try again.`,
        );
      }
      return {
        content: [{ type: "text" as const, text: result.content }],
      };
    },
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Fleet tools — every MCP caller (OAuth connector included). Authz is the
  // same hasRepoAccess checks the backing actions already run as the user.
  // send_agent_message stays behind the orchestrator gate: it is the master
  // speaking, and needs the master sandbox token.
  // ─────────────────────────────────────────────────────────────────────────────

  registerFleetTools(server, credentials, ctx);

  // ─────────────────────────────────────────────────────────────────────────────
  // Entity tools — list_entities, start_sandbox, stop_sandbox and
  // cancel_queued_message. Same audience and same authz as send_chat_message:
  // every caller gets them, and each one resolves its target through the
  // shared repo-access check above.
  // ─────────────────────────────────────────────────────────────────────────────

  registerEntityTools(server, credentials, ctx);

  if (isOrchestrator) {
    registerOrchestratorTools(server, credentials, ctx);
  }
}
