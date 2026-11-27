"use node";

import { v, type Infer } from "convex/values";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authAction, getActionRepoWithAccess } from "./functions";
import {
  PROVIDER_PRIMARY_AUTH_KEY,
  usageLimitProviderValidator,
} from "./validators";
import { decryptValue } from "./encryption";
import { resolveAllEnvVars } from "./envVarResolver";
import https from "node:https";
import {
  claudeUsageBodyFromUnifiedHeaders,
  hasPlanRateLimits,
  readClaudeUsageWindows,
  type ClaudeUsageBody,
  type UsageWindow,
} from "./_usageLimits/claudeUsage";

const CLAUDE_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const USAGE_TIMEOUT_MS = 8_000;
const CLAUDE_USAGE_BETA = "oauth-2025-04-20";
const CLAUDE_API_VERSION = "2023-06-01";
const CLAUDE_USAGE_USER_AGENT = "claude-code/2.1.72";
const USAGE_PROBE_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-haiku-4-5",
] as const;

type UsageProvider = Infer<typeof usageLimitProviderValidator>;

const USAGE_PROVIDER: UsageProvider = usageLimitProviderValidator.value;

type RefreshFailure =
  | "no-token"
  | "unauthorized"
  | "network"
  | "unavailable"
  | "rate-limited";

type TokenLookup = { kind: "token"; token: string } | { kind: "missing" };

type UsageFetch =
  | { kind: "body"; body: ClaudeUsageBody }
  | { kind: "unauthorized" }
  | { kind: "network" }
  | { kind: "rate-limited" };

async function accountToken(
  ctx: ActionCtx,
  accountId: Id<"userProviderAccounts">,
  provider: UsageProvider,
  userId: Id<"users">,
): Promise<TokenLookup> {
  const account = await ctx.runQuery(
    internal.userProviderAccounts.getForLaunchInternal,
    { accountId, ownerUserId: userId },
  );
  if (account === null || account.provider !== provider) {
    throw new Error("Provider account not found");
  }
  const entry = account.credentials.find(
    (credential) => credential.key === PROVIDER_PRIMARY_AUTH_KEY[provider],
  );
  if (entry === undefined) return { kind: "missing" };
  return { kind: "token", token: decryptValue(entry.value) };
}

async function teamToken(
  ctx: ActionCtx,
  repoId: Id<"githubRepos">,
  provider: UsageProvider,
): Promise<TokenLookup> {
  const envVars = await resolveAllEnvVars(ctx, repoId);
  const token = envVars[PROVIDER_PRIMARY_AUTH_KEY[provider]];
  if (token === undefined || token.length === 0) return { kind: "missing" };
  return { kind: "token", token };
}

type HttpResult = {
  status: number;
  header: (name: string) => string | undefined;
};

function postHttps(input: {
  url: string;
  headers: Record<string, string>;
  body: string;
}): Promise<HttpResult | null> {
  return new Promise((resolve) => {
    const url = new URL(input.url);
    const req = https.request(
      {
        protocol: "https:",
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: input.headers,
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            header: (name) => readNodeHeader(res.headers[name.toLowerCase()]),
          });
        });
      },
    );
    req.on("error", (error: Error) => {
      console.warn("[usageLimits] Claude usage request failed", error.message);
      resolve(null);
    });
    req.setTimeout(USAGE_TIMEOUT_MS, () => {
      req.destroy();
      console.warn("[usageLimits] Claude usage request failed", "timeout");
      resolve(null);
    });
    req.write(input.body);
    req.end();
  });
}

function readNodeHeader(
  value: string | string[] | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    const first = value[0];
    return first === undefined || first.length === 0 ? undefined : first;
  }
  return value.length === 0 ? undefined : value;
}

function credentialKind(token: string): string {
  if (token.startsWith("sk-ant-oat")) return "oat";
  if (token.startsWith("sk-ant-api")) return "api-key";
  if (token.startsWith("sk-ant-sid")) return "session";
  return "other";
}

function httpOk(status: number): boolean {
  return status >= 200 && status < 300;
}

function usageHeaders(): Record<string, string> {
  return {
    "anthropic-beta": CLAUDE_USAGE_BETA,
    "User-Agent": CLAUDE_USAGE_USER_AGENT,
  };
}

async function requestInferenceUsage(token: string): Promise<UsageFetch> {
  for (const model of USAGE_PROBE_MODELS) {
    const body = JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "." }],
    });
    const response = await postHttps({
      url: CLAUDE_MESSAGES_URL,
      headers: {
        ...usageHeaders(),
        Authorization: `Bearer ${token}`,
        "anthropic-version": CLAUDE_API_VERSION,
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(body)),
      },
      body,
    });
    if (response === null) return { kind: "network" };
    if (response.status === 404) continue;
    if (response.status === 401 || response.status === 403) {
      console.warn(
        `[usageLimits] messages probe ${response.status} cred=${credentialKind(token)} model=${model}`,
      );
      return { kind: "unauthorized" };
    }
    if (response.status === 429) {
      console.warn("[usageLimits] messages probe returned 429");
      return { kind: "rate-limited" };
    }
    if (!httpOk(response.status)) {
      console.warn(
        `[usageLimits] messages probe returned ${response.status} model=${model}`,
      );
      return { kind: "network" };
    }
    const parsed = claudeUsageBodyFromUnifiedHeaders(response.header);
    if (parsed === null) {
      console.warn(
        `[usageLimits] messages probe 200 had no unified rate-limit headers model=${model}`,
      );
      return { kind: "network" };
    }
    console.warn(
      `[usageLimits] messages probe 200 cred=${credentialKind(token)} windows=${readClaudeUsageWindows(parsed).length}`,
    );
    return { kind: "body", body: parsed };
  }
  console.warn("[usageLimits] messages probe: no current Haiku model id");
  return { kind: "network" };
}

type RefreshTarget = {
  providerAccountId?: Id<"userProviderAccounts">;
  teamId?: Id<"teams">;
  accountLabel: string;
};

type RefreshResult = {
  accountLabel: string;
  ok: boolean;
  reason?: RefreshFailure;
};

async function refreshOne(
  ctx: ActionCtx & { userId: Id<"users"> },
  repoId: Id<"githubRepos">,
  target: RefreshTarget,
): Promise<{ ok: boolean; reason?: RefreshFailure }> {
  const accountId = target.providerAccountId;
  const lookup =
    accountId === undefined
      ? await teamToken(ctx, repoId, USAGE_PROVIDER)
      : await accountToken(ctx, accountId, USAGE_PROVIDER, ctx.userId);
  if (lookup.kind === "missing") return { ok: false, reason: "no-token" };

  const result = await requestInferenceUsage(lookup.token);
  if (result.kind === "unauthorized") {
    return { ok: false, reason: "unauthorized" };
  }
  if (result.kind === "rate-limited") {
    return { ok: false, reason: "rate-limited" };
  }
  if (result.kind === "network") return { ok: false, reason: "network" };
  if (!hasPlanRateLimits(result.body)) {
    return { ok: false, reason: "unavailable" };
  }

  const windows: UsageWindow[] = readClaudeUsageWindows(result.body);
  const accountArg =
    accountId === undefined ? {} : { providerAccountId: accountId };
  const stored = await ctx.runQuery(internal.usageLimits.getReadingInternal, {
    provider: USAGE_PROVIDER,
    ...accountArg,
    ...(target.teamId === undefined ? {} : { teamId: target.teamId }),
  });
  const subscriptionType = stored?.subscriptionType;
  await ctx.runMutation(api.usageLimits.report, {
    repoId,
    provider: USAGE_PROVIDER,
    ...accountArg,
    capturedAt: Date.now(),
    completeness: "partial",
    windows,
    ...(subscriptionType === undefined ? {} : { subscriptionType }),
  });
  return { ok: true };
}

/**
 * Refreshes every credential the caller may run on in this repo, in parallel.
 *
 * The target list comes from `usageLimits.listRefreshTargetsInternal`, the same
 * builder `usageLimits.getForViewer` uses, so the button and the card can never
 * disagree about which credentials exist.
 *
 * Each result carries its credential's label so the toast can name the one that
 * failed. A rejected probe is a result, not an exception: one expired token must
 * not cost every other credential its reading.
 */
export const refreshAll = authAction({
  args: { repoId: v.id("githubRepos") },
  returns: v.object({
    results: v.array(
      v.object({
        accountLabel: v.string(),
        ok: v.boolean(),
        reason: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<{ results: RefreshResult[] }> => {
    await getActionRepoWithAccess(ctx, args.repoId);
    const targets: RefreshTarget[] = await ctx.runQuery(
      internal.usageLimits.listRefreshTargetsInternal,
      { userId: ctx.userId, repoId: args.repoId },
    );
    const results = await Promise.all(
      targets.map(async (target): Promise<RefreshResult> => ({
        accountLabel: target.accountLabel,
        ...(await refreshOne(ctx, args.repoId, target)),
      })),
    );
    return { results };
  },
});
