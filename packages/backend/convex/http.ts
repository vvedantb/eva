import { httpRouter } from "convex/server";
import { z } from "zod";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { SANDBOX_JWT_ISSUER } from "./sandboxAuthConfig";
import { parseHarnessCatalogReport } from "./_harnessSkills/report";
import { streamingHeartbeatHmacMessage } from "./_sandbox_runtime/callbackAuth";

const http = httpRouter();

/** Compares two strings in constant time to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let mismatch = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    mismatch |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return mismatch === 0;
}

/** Verifies the MCP bootstrap authorization token from the request header. */
function verifyMcpBootstrapToken(request: Request): boolean {
  const auth = request.headers.get("Authorization");
  if (!auth) return false;
  const expected = process.env.MCP_BOOTSTRAP_SECRET;
  if (!expected) return false;
  return timingSafeEqual(auth, `MCPBootstrap ${expected}`);
}

/** Verifies the EVA deploy key from the request Authorization header. */
function verifyDeployKey(request: Request): boolean {
  const auth = request.headers.get("Authorization");
  if (!auth) return false;
  const expected = process.env.EVA_DEPLOY_KEY;
  if (!expected) return false;
  return timingSafeEqual(auth, `Convex ${expected}`);
}

/**
 * Computes the scoped HMAC a launched sandbox must present for a heartbeat.
 * The message is domain-separated from every other callback credential.
 */
async function computeScopedHmac(message: string): Promise<string | null> {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Reads a required form field from an x-www-form-urlencoded request body. */
function requiredFormValue(
  params: URLSearchParams,
  key: string,
): string | null {
  const value = params.get(key);
  if (value === null || value.length === 0) return null;
  return value;
}

http.route({
  path: "/api/streaming/heartbeat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const entityId = requiredFormValue(params, "entityId");
    const hmac = requiredFormValue(params, "hmac");
    const touchOnly = params.get("touchOnly") === "1";
    const currentActivity = requiredFormValue(params, "currentActivity");
    if (!entityId || !hmac || (!touchOnly && !currentActivity)) {
      return new Response("Missing required heartbeat fields", {
        status: 400,
      });
    }

    const expected = await computeScopedHmac(
      streamingHeartbeatHmacMessage(entityId),
    );
    if (!expected) {
      return new Response("ENCRYPTION_KEY is not configured", {
        status: 500,
      });
    }
    const validCurrent = timingSafeEqual(hmac, expected);
    // Warm callbacks launched before domain separation still sign their raw
    // entity id. Keep that narrow compatibility path, but never for the old
    // catalog namespace whose credential caused the cross-route collision.
    const legacyExpected = validCurrent
      ? null
      : await computeScopedHmac(entityId);
    const validLegacy =
      !entityId.startsWith("harness-catalog:") &&
      legacyExpected !== null &&
      timingSafeEqual(hmac, legacyExpected);
    if (!validCurrent && !validLegacy) {
      return new Response("Invalid heartbeat signature", { status: 401 });
    }

    const turnId = params.get("turnId");
    if (turnId !== null) {
      const leaseGeneration = Number(params.get("leaseGeneration"));
      if (!Number.isSafeInteger(leaseGeneration) || leaseGeneration <= 0) {
        return new Response("Invalid turn lease generation", { status: 400 });
      }
      const lease = await ctx.runMutation(internal.turns.heartbeat, {
        turnId,
        leaseGeneration,
        entityId,
        touchOnly,
        currentActivity: currentActivity ?? undefined,
        currentContent: params.get("currentContent") ?? "",
        pendingQuestion: params.get("pendingQuestion") ?? undefined,
      });
      return Response.json({ ok: true, lease });
    }

    const accepted = await ctx.runMutation(internal.turns.legacyHeartbeat, {
      entityId,
      touchOnly,
      currentActivity: currentActivity ?? undefined,
      currentContent: params.get("currentContent") ?? "",
      pendingQuestion: params.get("pendingQuestion") ?? undefined,
    });
    return Response.json({
      ok: true,
      accepted,
      lease: accepted
        ? null
        : { status: "terminal", reason: "superseded" },
    });
  }),
});

/**
 * Records the built-in slash-command catalog a sandbox's harness CLI ships
 * with. A short-lived, single-use token is issued for one sandbox launch, so a
 * value exposed to repo code cannot become a permanent fleet-wide write key.
 */
http.route({
  path: "/api/harness-skills/report",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const params = new URLSearchParams(await request.text());
    const provider = requiredFormValue(params, "provider");
    const token = requiredFormValue(params, "token");
    const sandboxId = requiredFormValue(params, "sandboxId");
    const repoId = requiredFormValue(params, "repoId");
    if (!provider || !token || !sandboxId || !repoId) {
      return new Response("Missing required catalog report fields", {
        status: 400,
      });
    }

    const report = parseHarnessCatalogReport({
      provider,
      cliVersion: requiredFormValue(params, "cliVersion"),
      skillsJson: requiredFormValue(params, "skills"),
    });
    if (!report) {
      return new Response("Malformed catalog report", { status: 400 });
    }

    const authorized = await ctx.runMutation(
      internal.harnessSkills.consumeReportToken,
      {
        tokenHash: await sha256Hex(token),
        provider: report.provider,
        sandboxId,
        repoId,
      },
    );
    if (!authorized) {
      return new Response("Invalid or expired catalog report token", {
        status: 401,
      });
    }

    await ctx.runMutation(internal.harnessSkills.upsertForProvider, {
      provider: report.provider,
      cliVersion: report.cliVersion,
      commands: report.commands,
    });
    return Response.json({ ok: true });
  }),
});

/** Parses and validates the request body for the env-vars endpoint. */
const envVarsBodySchema = z.object({
  repoId: z.string().min(1),
  userId: z.string().min(1),
});

function parseEnvVarsBody(
  body: unknown,
): { repoId: string; userId: string } | null {
  const parsed = envVarsBodySchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

http.route({
  path: "/api/mcp/bootstrap",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    if (!verifyMcpBootstrapToken(request)) {
      return new Response("Unauthorized", { status: 401 });
    }
    const deployKey = process.env.EVA_DEPLOY_KEY;
    if (!deployKey) {
      return new Response(
        "EVA_DEPLOY_KEY is not configured in Convex env vars",
        { status: 500 },
      );
    }
    return Response.json({ deployKey });
  }),
});

http.route({
  path: "/api/mcp/env-vars",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyDeployKey(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = parseEnvVarsBody(body);
    if (!parsed) {
      return new Response("Invalid request body: repoId and userId required", {
        status: 400,
      });
    }

    const hasAccess: boolean = await ctx.runQuery(
      internal.mcp.queries.checkRepoAccessForUser,
      { repoId: parsed.repoId, userId: parsed.userId },
    );
    if (!hasAccess) {
      return new Response("Access denied", { status: 403 });
    }

    const vars = await ctx.runAction(
      internal.mcp.routes.getDecryptedRepoEnvVars,
      { repoId: parsed.repoId },
    );
    return Response.json(vars);
  }),
});

/** Extracts the bearer secret from an Authorization header, or null if absent/malformed. */
function extractBearerSecret(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const prefix = "Bearer ";
  if (!auth.startsWith(prefix)) return null;
  const secret = auth.slice(prefix.length).trim();
  return secret.length > 0 ? secret : null;
}

/** The repository git asked about, sent by the in-sandbox credential helper. */
const gitCredentialsBodySchema = z.object({ path: z.string().optional() });

/** Reads the requested repository path from the helper's body, if any. */
function parseGitCredentialsPath(body: unknown): string | undefined {
  const parsed = gitCredentialsBodySchema.safeParse(body);
  return parsed.success ? parsed.data.path : undefined;
}

http.route({
  path: "/api/git-credentials",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = extractBearerSecret(request);
    if (!secret) {
      return new Response("Unauthorized", { status: 401 });
    }
    const body: unknown = await request.json().catch(() => null);
    const resolved = await ctx.runQuery(
      internal.sandboxGitCredentials.resolveCredentialRequest,
      { secret, path: parseGitCredentialsPath(body) },
    );
    if (resolved.kind === "denied") {
      console.warn(`[git-credentials][denied] ${resolved.reason}`);
      return new Response("Forbidden", { status: 403 });
    }
    if (resolved.kind === "sibling") {
      console.log(
        `[git-credentials][sibling-read] sandbox=${resolved.sandboxId} user=${resolved.userId} repo=${resolved.owner}/${resolved.name} installation=${resolved.installationId}`,
      );
      const siblingToken: string = await ctx.runAction(
        internal.githubAuth.mintReadOnlyRepoToken,
        {
          installationId: resolved.installationId,
          githubId: resolved.githubId,
          name: resolved.name,
        },
      );
      return Response.json({
        username: "x-access-token",
        token: siblingToken,
      });
    }
    const token: string = await ctx.runAction(
      internal.githubAuth.mintInstallationToken,
      { installationId: resolved.installationId },
    );
    return Response.json({ username: "x-access-token", token });
  }),
});

http.route({
  path: "/.well-known/openid-configuration",
  method: "GET",
  handler: httpAction(async () => {
    const siteUrl = SANDBOX_JWT_ISSUER;
    return new Response(
      JSON.stringify({
        issuer: siteUrl,
        jwks_uri: `${siteUrl}/.well-known/jwks.json`,
        id_token_signing_alg_values_supported: ["ES256"],
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      },
    );
  }),
});

http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: httpAction(async () => {
    const jwks = process.env.SANDBOX_JWT_JWKS;
    if (!jwks) {
      return new Response("SANDBOX_JWT_JWKS not configured", { status: 500 });
    }
    return new Response(jwks, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }),
});

const EXTENSION_ID = process.env.EXTENSION_ID ?? "eva-extension";

http.route({
  path: "/api/updates/extension/updates.xml",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const release = await ctx.runQuery(
      internal.extensionReleases.getLatestInternal,
      {},
    );

    if (!release) {
      const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${EXTENSION_ID}'>
    <updatecheck status='noupdate' />
  </app>
</gupdate>`;
      return new Response(xml, {
        headers: {
          "Content-Type": "application/xml",
          "Cache-Control": "no-cache",
        },
      });
    }

    const siteUrl = process.env.CONVEX_SITE_URL ?? "";
    const crxUrl = release.crxUrl ?? `${siteUrl}/api/updates/extension/eva.crx`;

    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${EXTENSION_ID}'>
    <updatecheck codebase='${crxUrl}' version='${release.version}' />
  </app>
</gupdate>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "no-cache",
      },
    });
  }),
});

http.route({
  path: "/api/updates/extension/eva.crx",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const release = await ctx.runQuery(
      internal.extensionReleases.getLatestInternal,
      {},
    );

    if (!release?.crxUrl) {
      return Response.json(
        { error: "No extension release found. Run ext:release first." },
        { status: 404 },
      );
    }

    return Response.redirect(release.crxUrl, 302);
  }),
});

// Boundary schema for the GitHub pull_request webhook. Only `action` and
// `pull_request.html_url` are required — a payload missing them is ignored with
// a 200 (matching the old early-returns). Every other field is lenient:
// `.nullable().catch(null)` turns a missing/mistyped value into null, exactly
// like the previous getString/getBoolean/getNumber helpers.
const nullableString = z.string().nullable().catch(null);
const loginObject = z.object({ login: nullableString }).nullable().catch(null);

const prWebhookSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    html_url: z.string(),
    merged: z.boolean().nullable().catch(null),
    draft: z.boolean().nullable().catch(null),
    number: z.number().nullable().catch(null),
    title: nullableString,
    merge_commit_sha: nullableString,
    head: z
      .object({ ref: nullableString, sha: nullableString })
      .nullable()
      .catch(null),
    user: loginObject,
  }),
  repository: z
    .object({ name: nullableString, owner: loginObject })
    .nullable()
    .catch(null),
});

const pushCommitPathsSchema = z.object({
  added: z.array(z.string()).optional().default([]),
  modified: z.array(z.string()).optional().default([]),
  removed: z.array(z.string()).optional().default([]),
});

const pushWebhookSchema = z.object({
  ref: z.string(),
  repository: z.object({
    name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
  commits: z.array(pushCommitPathsSchema).optional().default([]),
});

const SKILLS_ROOT_PREFIXES = [".agents/skills", ".claude/skills"];

/** True when a commit touches a supported skill root, or when GitHub sent no
 * path lists (force-push / truncated payloads) so we still resync. */
function pushTouchesSkills(
  commits: Array<{
    added: string[];
    modified: string[];
    removed: string[];
  }>,
): boolean {
  if (commits.length === 0) return true;
  let sawAnyPath = false;
  for (const commit of commits) {
    for (const path of [
      ...commit.added,
      ...commit.modified,
      ...commit.removed,
    ]) {
      sawAnyPath = true;
      if (
        SKILLS_ROOT_PREFIXES.some(
          (prefix) => path === prefix || path.startsWith(`${prefix}/`),
        )
      ) {
        return true;
      }
    }
  }
  return !sawAnyPath;
}

// Boundary schemas for the deploy-key-protected MCP OAuth endpoints. These are
// internal, so they are strict: any missing/mistyped field yields a 400.
const oauthClientSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
  redirectUris: z.array(z.string()).catch([]),
});

const oauthAuthCodeSchema = z.object({
  code: z.string().min(1),
  clerkUserId: z.string().min(1),
  codeChallenge: z.string().min(1),
  codeChallengeMethod: z.string().min(1),
  redirectUri: z.string().min(1),
  clientId: z.string().min(1),
  expiresAt: z.number(),
});

/** Verifies a GitHub webhook HMAC-SHA256 signature against the shared secret. */
async function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computed =
    "sha256=" +
    Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return timingSafeEqual(computed, signature);
}

http.route({
  path: "/api/github/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("X-Hub-Signature-256");
    const event = request.headers.get("X-GitHub-Event");
    const body = await request.text();

    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      return new Response("GITHUB_WEBHOOK_SECRET not configured", {
        status: 500,
      });
    }

    if (
      !signature ||
      !(await verifyWebhookSignature(body, signature, secret))
    ) {
      return new Response("Invalid signature", { status: 401 });
    }

    if (event === "pull_request") {
      const parsed = prWebhookSchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        return new Response("OK", { status: 200 });
      }

      const { action, pull_request: pullRequest } = parsed.data;
      const prUrl = pullRequest.html_url;
      if (!action || !prUrl) {
        return new Response("OK", { status: 200 });
      }

      const merged = pullRequest.merged;
      const draft = pullRequest.draft;

      // head.ref carries the source branch name. Passed through so the
      // closed-handler can fall back to branch-based reconciliation when no
      // run has the PR URL recorded (e.g. if it was lost during PR creation).
      const branchName = pullRequest.head?.ref ?? null;

      // Always sync session PR state for any state-changing action.
      const STATE_ACTIONS = new Set([
        "opened",
        "reopened",
        "ready_for_review",
        "converted_to_draft",
        "closed",
      ]);
      if (STATE_ACTIONS.has(action)) {
        await ctx.scheduler.runAfter(
          0,
          internal.githubWebhook.handleSessionPrEvent,
          {
            prUrl,
            action,
            draft: draft ?? undefined,
            merged: merged ?? undefined,
            prNumber: pullRequest.number ?? undefined,
            mergeCommitSha: pullRequest.merge_commit_sha ?? undefined,
          },
        );
        await ctx.scheduler.runAfter(
          0,
          internal.githubWebhook.handleProjectPrEvent,
          {
            prUrl,
            action,
            draft: draft ?? undefined,
          },
        );
      }

      // agentTasks/projects path stays as-is (close-only).
      if (action === "closed" && merged !== null) {
        await ctx.scheduler.runAfter(0, internal.githubWebhook.handlePrClosed, {
          prUrl,
          merged,
          branchName: branchName ?? undefined,
        });
      }
    }

    if (event === "push") {
      const parsed = pushWebhookSchema.safeParse(JSON.parse(body));
      if (parsed.success && parsed.data.ref.startsWith("refs/heads/")) {
        const branch = parsed.data.ref.slice("refs/heads/".length);
        await ctx.scheduler.runAfter(
          0,
          internal.githubWebhook.handlePushForSkillSync,
          {
            owner: parsed.data.repository.owner.login,
            name: parsed.data.repository.name,
            branch,
            touchedSkillsPath: pushTouchesSkills(parsed.data.commits),
          },
        );
      }
    }

    return new Response("OK", { status: 200 });
  }),
});

/**
 * Where to send the browser back to after the GitHub authorize hop. Known
 * installations resume setup; anything else lands on the codebase list.
 */
function githubAuthReturnUrl(installationId: number | null): string {
  const webAppUrl = process.env.WEB_APP_URL ?? "";
  return installationId === null
    ? `${webAppUrl}/home`
    : `${webAppUrl}/setup/${installationId}`;
}

/** Reads a positive integer query parameter, or null when absent/malformed. */
function integerParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

// The GitHub App's Setup URL. GitHub appends `?installation_id=` to whatever is
// configured, which a path-parameter route in the SPA cannot read, so the hop
// happens here and hands the id to /setup/:id.
http.route({
  path: "/api/github/setup",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const params = new URL(request.url).searchParams;
    return Response.redirect(
      githubAuthReturnUrl(integerParam(params, "installation_id")),
      302,
    );
  }),
});

http.route({
  path: "/api/github/oauth/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const params = new URL(request.url).searchParams;
    const state = params.get("state");
    if (!state) {
      return new Response("Missing state", { status: 400 });
    }

    // The nonce is the only thing tying this request to an Eva account, and it
    // is single-use: redeeming it here means a replayed callback cannot attach a
    // second token to somebody else's account.
    const claim = await ctx.runMutation(
      internal._github.userTokens.consumeOauthState,
      { nonce: state },
    );
    if (!claim) {
      return new Response("Authorization request expired. Start again.", {
        status: 400,
      });
    }

    // GitHub sends `error` instead of `code` when the user declines. Nothing to
    // store, so return them to the page that asked and let it re-prompt.
    const code = params.get("code");
    if (!code) {
      return Response.redirect(githubAuthReturnUrl(claim.installationId), 302);
    }

    try {
      await ctx.runAction(internal._github.userAuth.completeUserAuthorization, {
        userId: claim.userId,
        code,
      });
    } catch {
      // The redirect target re-checks authorization, so a failed exchange shows
      // the connect prompt again rather than a raw error page.
      return Response.redirect(githubAuthReturnUrl(claim.installationId), 302);
    }

    return Response.redirect(githubAuthReturnUrl(claim.installationId), 302);
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP OAuth State Endpoints
// ─────────────────────────────────────────────────────────────────────────────

http.route({
  path: "/api/mcp/oauth/clients",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyDeployKey(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const parsed = oauthClientSchema.safeParse(await request.json());
    if (!parsed.success) {
      return new Response("Invalid request body", { status: 400 });
    }

    await ctx.runMutation(internal.mcp.oauth.registerClient, {
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret,
      redirectUris: parsed.data.redirectUris,
    });

    return new Response("OK", { status: 200 });
  }),
});

http.route({
  path: "/api/mcp/oauth/clients/:clientId",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!verifyDeployKey(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const clientId = pathParts[pathParts.length - 1];

    if (!clientId) {
      return new Response("clientId required", { status: 400 });
    }

    const client = await ctx.runQuery(internal.mcp.oauth.getClient, {
      clientId,
      now: Date.now(),
    });

    if (!client) {
      return Response.json({ found: false }, { status: 404 });
    }

    return Response.json({ found: true, client });
  }),
});

http.route({
  path: "/api/mcp/oauth/auth-codes",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!verifyDeployKey(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const parsed = oauthAuthCodeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return new Response("Missing required fields", { status: 400 });
    }

    await ctx.runMutation(internal.mcp.oauth.storeAuthCode, parsed.data);

    return new Response("OK", { status: 200 });
  }),
});

http.route({
  path: "/api/mcp/oauth/auth-codes/:code",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    if (!verifyDeployKey(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const code = pathParts[pathParts.length - 1];

    if (!code) {
      return new Response("code required", { status: 400 });
    }

    const entry = await ctx.runMutation(internal.mcp.oauth.consumeAuthCode, {
      code,
    });

    if (!entry) {
      return Response.json({ found: false }, { status: 404 });
    }

    return Response.json({ found: true, entry });
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Convex-Native MCP Server (Node.js runtime)
// ─────────────────────────────────────────────────────────────────────────────

import {
  oauthMetadata,
  protectedResourceMetadata,
  register,
  authorizeGet,
  token,
  mcpHandler,
  health,
} from "./mcp/native";

// OAuth metadata endpoints
http.route({
  path: "/.well-known/oauth-authorization-server",
  method: "GET",
  handler: oauthMetadata,
});

http.route({
  path: "/.well-known/oauth-protected-resource",
  method: "GET",
  handler: protectedResourceMetadata,
});

// OAuth flow endpoints
http.route({
  path: "/mcp/oauth/register",
  method: "POST",
  handler: register,
});

http.route({
  path: "/mcp/oauth/authorize",
  method: "GET",
  handler: authorizeGet,
});

http.route({
  path: "/mcp/oauth/token",
  method: "POST",
  handler: token,
});

// MCP endpoint
http.route({
  path: "/mcp",
  method: "GET",
  handler: mcpHandler,
});

http.route({
  path: "/mcp",
  method: "POST",
  handler: mcpHandler,
});

http.route({
  path: "/mcp",
  method: "DELETE",
  handler: mcpHandler,
});

// Health check
http.route({
  path: "/health",
  method: "GET",
  handler: health,
});

export default http;
