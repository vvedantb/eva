import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { z } from "zod";
import type { JsonValue } from "../_jev/jsonValue";

// Leaf module shared by tools.ts and orchestratorTools.ts. Lives apart from
// tools.ts so the orchestrator registration does not close an import cycle
// (tools -> orchestratorTools -> tools), which would land in the "use node"
// action chunk and break the prod push.

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export function textResult(data: Record<string, unknown> | Array<unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Short Claude names the MCP tools advertise. `fable` is Eva's Fable model
 * (`claude:claude-fable-5-1`); opus/sonnet/haiku keep their existing aliases.
 * Kept as a tuple so every tool schema stays in lockstep.
 */
export const MCP_CLAUDE_MODELS = ["opus", "sonnet", "haiku", "fable"] as const;
export type McpClaudeModel = (typeof MCP_CLAUDE_MODELS)[number];

export interface McpCredentials {
  clerkUserId: string;
  scopedRepoId?: string;
  entityId?: string;
  entityKind?: "session" | "task" | "project";
  isOrchestrator?: boolean;
}

export interface RepoInfo {
  id: string;
  owner: string;
  name: string;
  rootDirectory: string | null;
  mcpRootPrompt: string | null;
}

/**
 * Calls one public Eva function (e.g. "automations:runNow") as the MCP caller,
 * so the tool inherits the same auth and repo-access checks the web UI hits.
 * The reply is parsed at this boundary with the caller's schema.
 */
export async function mcpCallAsUser<T>(
  ctx: ActionCtx,
  clerkUserId: string,
  call: {
    type: "query" | "mutation" | "action";
    path: string;
    args: Record<string, JsonValue>;
  },
  schema: z.ZodType<T>,
): Promise<T> {
  const raw = await ctx.runAction(internal.mcp.nodeActions.callAsUser, {
    clerkUserId,
    type: call.type,
    path: call.path,
    argsJson: JSON.stringify(call.args),
  });
  return schema.parse(JSON.parse(raw));
}

/**
 * Required on every tool that deletes or irreversibly removes something. The
 * agent must ask the user in chat first; the literal makes skipping that a
 * visible choice rather than a default.
 */
export const confirmedDeleteArg = z
  .literal(true)
  .describe(
    "Deletion safeguard. Ask the user in chat and get an explicit yes before calling this tool, then pass true. Never set it on your own judgement.",
  );

/** Resolves the caller's Eva user id (creating the row on first contact). */
export async function mcpGetContext(
  ctx: ActionCtx,
  clerkUserId: string,
): Promise<{ deployKey: string; userId: string }> {
  return ctx.runAction(internal.mcp.nodeActions.getContext, { clerkUserId });
}

/** Lists every repo the user can reach (own + team). */
export async function mcpListUserRepos(
  ctx: ActionCtx,
  userId: string,
): Promise<RepoInfo[]> {
  return ctx.runAction(internal.mcp.nodeActions.listUserRepos, { userId });
}

/** `owner/name` for a plain repo, `owner/name/app` for one app of a monorepo. */
export function repoRefLabel(repo: RepoInfo): string {
  if (!repo.rootDirectory) return `${repo.owner}/${repo.name}`;
  const app = repo.rootDirectory.split("/").pop() ?? repo.rootDirectory;
  return `${repo.owner}/${repo.name}/${app}`;
}

/**
 * Picks one repo out of the user's repos by name, disambiguating monorepo apps
 * by `rootDirectory`. Pure so both the repo-scoped and orchestrator tools can
 * share it.
 */
export function matchRepoByName(
  repos: RepoInfo[],
  repoName: string,
  app: string | undefined,
): { repo: RepoInfo } | ReturnType<typeof errorResult> {
  const normalizedInput = repoName.toLowerCase();
  const normalizedApp = app?.toLowerCase();

  const nameMatches = repos.filter((r) => {
    const fullName = `${r.owner}/${r.name}`.toLowerCase();
    return (
      fullName === normalizedInput || r.name.toLowerCase() === normalizedInput
    );
  });

  let repo: RepoInfo | undefined;
  if (nameMatches.length === 0) {
    repo = undefined;
  } else if (nameMatches.length === 1) {
    repo = nameMatches[0];
  } else if (normalizedApp) {
    repo = nameMatches.find((r) => {
      if (!r.rootDirectory) return false;
      const rootDir = r.rootDirectory.toLowerCase();
      return rootDir === normalizedApp || rootDir.endsWith(`/${normalizedApp}`);
    });
    if (!repo) {
      const apps = nameMatches
        .map((r) => r.rootDirectory ?? "(root)")
        .join(", ");
      return errorResult(
        `Multiple apps found for "${repoName}" but none matched app "${app}". Available apps: ${apps}`,
      );
    }
  } else {
    const apps = nameMatches.map((r) => r.rootDirectory ?? "(root)").join(", ");
    return errorResult(
      `Multiple apps found for "${repoName}". Specify the "app" parameter to disambiguate. Available apps: ${apps}`,
    );
  }

  if (!repo) {
    // App-qualified: a monorepo is several repo rows sharing one name, so the
    // bare `owner/name` list repeated the same string a dozen times and told
    // the caller nothing about which app to ask for.
    const available = repos.map(repoRefLabel).join(", ");
    return errorResult(`Repo "${repoName}" not found. Your repos: ${available}`);
  }

  return { repo };
}
