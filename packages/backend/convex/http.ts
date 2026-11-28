import { httpRouter } from "convex/server";
import {
  registerMcpRoutes,
  sha256Hex,
  timingSafeEqual,
  verifyGithubStyleSignature,
} from "@vvedantb/server";
import { z } from "zod";
import { httpAction } from "./_generated/server";
import { registerPreviewCommentRoutes } from "./previewCommentsHttp";
import { internal } from "./_generated/api";
import { SANDBOX_JWT_ISSUER } from "./sandboxAuthConfig";
import { tryGetEvaBaseUrl } from "./_env/webAppUrl";
import { parseHarnessCatalogReport } from "./_harnessSkills/report";
import {
  previewActivityHmacMessage,
  streamingHeartbeatHmacMessage,
} from "./_sandbox_runtime/callbackAuth";
import {
  parseCiCompleted,
  parseCiPassed,
  parseRepoEvents,
} from "./_automationEvents/events";
import { parseAxiomAlert } from "./_automationEvents/axiomAlert";
import { AXIOM_ALERT_PATH_PREFIX } from "./_automations/alertWebhook";
import { prWatchUrls } from "./_pullRequests/watchEvaluate";
import { hmacSha256Hex } from "./_shared/hmac";
import {
  CHANGELOG_EMAIL_RATINGS,
  CHANGELOG_ITEM_VOTES,
  changelogVoteHmacMessage,
} from "./_changelog/entry";
import { buildChangelogVotePageHtml } from "./emailTemplates";
import {
  health,
  mcpHandler,
  oauthMetadata,
  protectedResourceMetadata,
} from "./mcp/native";

const http = httpRouter();
registerPreviewCommentRoutes(http);

function verifyDeployKey(request: Request): boolean {
  const auth = request.headers.get("Authorization");
  if (!auth) return false;
  const expected = process.env.EVA_DEPLOY_KEY;
  if (!expected) return false;
  return timingSafeEqual(auth, `Convex ${expected}`);
}

async function computeScopedHmac(message: string): Promise<string | null> {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) return null;
  return hmacSha256Hex(secret, message);
}

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
    if (!timingSafeEqual(hmac, expected)) {
      return new Response("Invalid heartbeat signature", { status: 401 });
    }

    const turnId = params.get("turnId");
    if (turnId === null) {
      return Response.json({
        ok: true,
        lease: { status: "terminal", reason: "unknown_turn" },
      });
    }
    const leaseGeneration = Number(params.get("leaseGeneration"));
    if (!Number.isSafeInteger(leaseGeneration) || leaseGeneration <= 0) {
      return new Response("Invalid turn lease generation", { status: 400 });
    }
    const memAvailableMb = params.get("memAvailableMb");
    if (memAvailableMb !== null) {
      console.log(
        `[heartbeat][vm] entityId=${entityId} turnId=${turnId} memAvailableMb=${memAvailableMb} memTotalMb=${params.get("memTotalMb") ?? "?"} swapUsedMb=${params.get("swapUsedMb") ?? "?"} oomKills=${params.get("oomKills") ?? "?"}`,
      );
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
  }),
});

http.route({
  path: "/api/preview/activity",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const params = new URLSearchParams(await request.text());
    const sandboxId = requiredFormValue(params, "sandboxId");
    const hmac = requiredFormValue(params, "hmac");
    if (!sandboxId || !hmac) {
      return new Response("Missing required activity fields", { status: 400 });
    }
    const expected = await computeScopedHmac(
      previewActivityHmacMessage(sandboxId),
    );
    if (!expected) {
      return new Response("ENCRYPTION_KEY is not configured", {
        status: 500,
      });
    }
    if (!timingSafeEqual(hmac, expected)) {
      return new Response("Invalid activity signature", { status: 401 });
    }
    await ctx.runMutation(internal._sandbox.activity.touchBySandbox, {
      sandboxId,
      source: "preview-page",
      clerkUserId: params.get("subject") || undefined,
    });
    return Response.json({ ok: true });
  }),
});

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

function extractBearerSecret(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const prefix = "Bearer ";
  if (!auth.startsWith(prefix)) return null;
  const secret = auth.slice(prefix.length).trim();
  return secret.length > 0 ? secret : null;
}

const gitCredentialsBodySchema = z.object({ path: z.string().optional() });

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
    const body: unknown = await request.json().catch(() => ({}));
    const resolved = await ctx.runQuery(
      internal.sandboxGitCredentials.resolveCredentialRequest,
      { secret, path: parseGitCredentialsPath(body) },
    );
    if (resolved.kind === "denied") {
      console.warn(`[git-credentials][denied] ${resolved.reason}`);
      return new Response("Forbidden", { status: 403 });
    }
    if (resolved.kind === "read_only") {
      const readOnly = await ctx.runAction(
        internal.githubAuth.mintReadOnlyRepoToken,
        {
          installationId: resolved.installationId,
          githubId: resolved.githubId,
          name: resolved.name,
        },
      );
      return Response.json({ username: "x-access-token", ...readOnly });
    }
    if (resolved.kind === "sibling") {
      console.log(
        `[git-credentials][sibling] sandbox=${resolved.sandboxId} user=${resolved.userId} repo=${resolved.owner}/${resolved.name} installation=${resolved.installationId}`,
      );
      const sibling = await ctx.runAction(
        internal.githubAuth.mintSiblingRepoToken,
        {
          installationId: resolved.installationId,
          githubId: resolved.githubId,
          name: resolved.name,
        },
      );
      return Response.json({ username: "x-access-token", ...sibling });
    }
    if (resolved.kind === "linked") {
      console.log(
        `[git-credentials][linked-repo] sandbox=${resolved.sandboxId} repo=${resolved.owner}/${resolved.name} installation=${resolved.installationId}`,
      );
    }

    const credential = await ctx.runAction(
      internal.githubAuth.mintInstallationToken,
      { installationId: resolved.installationId },
    );
    return Response.json({ username: "x-access-token", ...credential });
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
      .object({
        ref: nullableString,
        sha: nullableString,
        repo: z.object({ full_name: nullableString }).nullable().catch(null),
      })
      .nullable()
      .catch(null),
    base: z.object({ ref: nullableString }).nullable().catch(null),
    user: loginObject,
  }),
  repository: z
    .object({
      name: nullableString,
      full_name: nullableString,
      owner: loginObject,
    })
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
const EVA_CONFIG_ROOT_PREFIXES = [".eva"];

function pushTouchesRoots(
  commits: Array<{
    added: string[];
    modified: string[];
    removed: string[];
  }>,
  prefixes: ReadonlyArray<string>,
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
        prefixes.some(
          (prefix) => path === prefix || path.startsWith(`${prefix}/`),
        )
      ) {
        return true;
      }
    }
  }
  return !sawAnyPath;
}

const MAX_ALERT_BODY_BYTES = 256 * 1024;

http.route({
  pathPrefix: AXIOM_ALERT_PATH_PREFIX,
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const automationId = new URL(request.url).pathname.slice(
      AXIOM_ALERT_PATH_PREFIX.length,
    );
    const body = await request.text();
    if (body.length > MAX_ALERT_BODY_BYTES) {
      return new Response("Alert body too large", { status: 413 });
    }
    const auth = request.headers.get("Authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

    const parsed = parseAxiomAlert(body);
    if (parsed.kind === "invalid") {
      return new Response("Expected Axiom's default webhook JSON", {
        status: 400,
      });
    }
    const result = await ctx.runMutation(
      internal._automationEvents.dispatch.receiveAlert,
      {
        automationId,
        secretHash: token === "" ? null : await sha256Hex(token),
        alert: parsed.kind === "alert" ? parsed.alert : null,
      },
    );
    switch (result) {
      case "unauthorized":
        return new Response("Invalid secret", { status: 401 });
      case "not_found":
        return new Response("Unknown alert webhook", { status: 404 });
      default:
        return new Response(result, { status: 200 });
    }
  }),
});

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

    if (!(await verifyGithubStyleSignature(secret, body, signature))) {
      return new Response("Invalid signature", { status: 401 });
    }

    const repoEvents = parseRepoEvents(event ?? "", body);
    const ciPassed = parseCiPassed(event ?? "", body);
    for (const repoEvent of repoEvents) {
      await ctx.scheduler.runAfter(
        0,
        internal._automationEvents.dispatch.dispatch,
        { event: repoEvent },
      );
    }
    for (const passed of ciPassed) {
      await ctx.scheduler.runAfter(
        0,
        internal._automationEvents.dispatch.noteCiPassed,
        { passed },
      );
    }
    const ciCompleted = parseCiCompleted(event ?? "", body);
    const watchUrls = prWatchUrls(repoEvents, ciCompleted);
    if (watchUrls.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal._pullRequests.watch.noteActivity,
        { prUrls: watchUrls },
      );
    }
    if (ciCompleted?.kind === "status" && ciCompleted.branches.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal._pullRequests.watch.noteHeadStatus,
        {
          owner: ciCompleted.owner,
          name: ciCompleted.name,
          branches: ciCompleted.branches,
        },
      );
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

      const repository = parsed.data.repository;
      const headRepo = pullRequest.head?.repo?.full_name ?? null;
      const baseRepo = repository?.full_name ?? null;
      const headInSameRepo =
        headRepo !== null && baseRepo !== null
          ? headRepo.toLowerCase() === baseRepo.toLowerCase()
          : undefined;
      await ctx.scheduler.runAfter(
        0,
        internal.githubWebhook.handlePullRequestEvent,
        {
          prUrl,
          action,
          draft: pullRequest.draft ?? undefined,
          merged: pullRequest.merged ?? undefined,
          mergeCommitSha: pullRequest.merge_commit_sha ?? undefined,
          title: pullRequest.title ?? undefined,
          headBranch: pullRequest.head?.ref ?? undefined,
          baseBranch: pullRequest.base?.ref ?? undefined,
          repoOwner: repository?.owner?.login ?? undefined,
          repoName: repository?.name ?? undefined,
          headInSameRepo,
        },
      );

      const ARENA_ACTIONS = new Set([
        "opened",
        "reopened",
        "synchronize",
        "ready_for_review",
      ]);
      const headRef = pullRequest.head?.ref;
      const headSha = pullRequest.head?.sha;
      const prNumber = pullRequest.number;
      if (
        ARENA_ACTIONS.has(action) &&
        pullRequest.draft !== true &&
        headInSameRepo === true &&
        repository?.name &&
        repository.owner?.login &&
        headRef &&
        headSha &&
        prNumber !== null
      ) {
        await ctx.scheduler.runAfter(
          0,
          internal.arenaBrowserWorkflow.startPrRuns,
          {
            owner: repository.owner.login,
            name: repository.name,
            prNumber,
            headRef,
            headSha,
          },
        );
      }
    }

    if (event === "push") {
      const parsed = pushWebhookSchema.safeParse(JSON.parse(body));
      if (parsed.success && parsed.data.ref.startsWith("refs/heads/")) {
        const branch = parsed.data.ref.slice("refs/heads/".length);
        await ctx.scheduler.runAfter(
          0,
          internal._pullRequests.watch.noteBasePush,
          {
            owner: parsed.data.repository.owner.login,
            name: parsed.data.repository.name,
            branch,
          },
        );
        await ctx.scheduler.runAfter(
          0,
          internal.githubWebhook.handlePushToBaseBranch,
          {
            owner: parsed.data.repository.owner.login,
            name: parsed.data.repository.name,
            branch,
            touchedSkillsPath: pushTouchesRoots(
              parsed.data.commits,
              SKILLS_ROOT_PREFIXES,
            ),
            touchedEvaConfig: pushTouchesRoots(
              parsed.data.commits,
              EVA_CONFIG_ROOT_PREFIXES,
            ),
          },
        );
      }
    }

    return new Response("OK", { status: 200 });
  }),
});

function githubAuthReturnUrl(installationId: number | null): string {
  const webAppUrl = tryGetEvaBaseUrl() ?? "";
  return installationId === null
    ? `${webAppUrl}/home`
    : `${webAppUrl}/setup/${installationId}`;
}

function integerParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

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

    const claim = await ctx.runMutation(
      internal._github.userTokens.consumeOauthState,
      { nonce: state },
    );
    if (!claim) {
      return new Response("Authorization request expired. Start again.", {
        status: 400,
      });
    }

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
      return Response.redirect(githubAuthReturnUrl(claim.installationId), 302);
    }

    return Response.redirect(githubAuthReturnUrl(claim.installationId), 302);
  }),
});

function connectorAuthReturnUrl(returnPath: string | null): string {
  const webAppUrl = tryGetEvaBaseUrl() ?? "";
  const path =
    returnPath &&
    returnPath.startsWith("/settings") &&
    !returnPath.includes("//")
      ? returnPath
      : "/settings/connections";
  return `${webAppUrl}${path}`;
}

http.route({
  path: "/api/connectors/oauth/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const requestUrl = new URL(request.url);
    const params = requestUrl.searchParams;
    const state = params.get("state");
    if (!state) {
      return new Response("Missing state", { status: 400 });
    }

    const claim = await ctx.runMutation(
      internal._connectors.tokens.consumeOauthState,
      { nonce: state },
    );
    if (!claim) {
      return new Response("Authorization request expired. Start again.", {
        status: 400,
      });
    }

    const code = params.get("code");
    if (!code) {
      return Response.redirect(connectorAuthReturnUrl(claim.returnPath), 302);
    }

    const siteUrl = (process.env.CONVEX_SITE_URL ?? "").replace(/\/$/, "");
    try {
      await ctx.runAction(internal._connectors.oauth.completeAuthorization, {
        userId: claim.userId,
        provider: claim.provider,
        actor: claim.actor,
        code,
        redirectUri: `${siteUrl}/api/connectors/oauth/callback`,
        codeVerifier: claim.codeVerifier,
      });
    } catch {
      return Response.redirect(connectorAuthReturnUrl(claim.returnPath), 302);
    }

    return Response.redirect(connectorAuthReturnUrl(claim.returnPath), 302);
  }),
});

registerMcpRoutes(http, {
  authorizationServerMetadata: oauthMetadata,
  protectedResourceMetadata,
  endpoints: [{ handler: mcpHandler }],
  health: { handler: health },
});

const changelogLinkFields = {
  run: z.string().min(1),
  user: z.string().min(1),
  sig: z.string().min(1),
};

const changelogFeedbackQuerySchema = z.union([
  z.object({
    ...changelogLinkFields,
    item: z.coerce.number().int().min(0),
    vote: z.enum(CHANGELOG_ITEM_VOTES),
  }),
  z.object({
    ...changelogLinkFields,
    vote: z.enum(CHANGELOG_EMAIL_RATINGS),
  }),
]);

http.route({
  path: "/api/changelog/vote",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const parsed = changelogFeedbackQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) {
      return new Response("Invalid vote link", { status: 400 });
    }
    const { run, user, sig } = parsed.data;
    const expected = await computeScopedHmac(
      changelogVoteHmacMessage(run, user),
    );
    const appUrl = tryGetEvaBaseUrl();
    if (!expected || !appUrl) {
      return new Response("ENCRYPTION_KEY or WEB_APP_URL is not configured", {
        status: 500,
      });
    }
    if (!timingSafeEqual(sig, expected)) {
      return new Response("Invalid vote signature", { status: 401 });
    }
    const recorded = await ctx.runMutation(internal.changelog.recordVote, {
      runId: run,
      userId: user,
      itemIndex: "item" in parsed.data ? parsed.data.item : undefined,
      vote: parsed.data.vote,
    });
    return new Response(buildChangelogVotePageHtml({ appUrl, recorded }), {
      status: recorded ? 200 : 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }),
});

export default http;
