# Plan 017: OAuth callbacks finish only in the browser of the Eva user who started them

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (add a row if none exists) — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 478be7912..HEAD -- packages/backend/convex/http.ts packages/backend/convex/_github/userAuth.ts packages/backend/convex/_github/userTokens.ts packages/backend/convex/github.ts packages/backend/convex/connectedAccounts.ts packages/backend/convex/_connectors/tokens.ts packages/backend/convex/_validators/tableFields.ts apps/web/src/routes/_global/home/ReposClient.tsx apps/web/src/lib/hooks`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (changes a sign-in-adjacent flow; needs a manual check after deploy)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `478be7912`, 2026-11-12

## Why this matters

Eva links a user's GitHub account (and Linear/Figma accounts) with an OAuth
"authorize" hop. The `state` nonce records which Eva user started the hop, but
nothing checks that the browser which comes back is that user's browser. An
Eva user can start the hop, copy the GitHub authorize URL, and get a teammate
who has already authorised the Eva GitHub App to open it. GitHub redirects
without a consent screen, and Eva stores the teammate's GitHub token under the
first user's Eva account. That token is what Eva uses to prove "this user is a
member of installation N" before it lets them connect repositories, so the
first user gains the teammate's GitHub installation reach. The connector
callback has the same shape and would store a teammate's Linear or Figma
token. After this plan, the callback only forwards the `code` to the Eva web
app, and the exchange happens in an authenticated Convex action that rejects
any `state` not minted for the signed-in Clerk user.

## Current state

Files:

- `packages/backend/convex/http.ts` — HTTP routes. GitHub callback at lines
  797–839, connector callback at lines 853–894, return-URL helpers at
  767–772 (`githubAuthReturnUrl`) and 842–851 (`connectorAuthReturnUrl`).
- `packages/backend/convex/_github/userTokens.ts` — `startUserAuthorization`
  (line 82) mints the nonce; `consumeOauthState` (line 111) redeems it;
  `putStoredToken` (line 40) writes the token row.
- `packages/backend/convex/_github/userAuth.ts` (`"use node"`) —
  `exchangeCodeForUserToken` (line 106), `completeUserAuthorization`
  (line 121), `listInstallationReposForUser` (uses the stored token, line 194).
- `packages/backend/convex/github.ts` (`"use node"`) — public re-exports of
  `_github/*` actions (`api.github.*`).
- `packages/backend/convex/githubUserAuth.ts` — public re-export of
  `startUserAuthorization` (not `"use node"`, so it cannot re-export node actions).
- `packages/backend/convex/connectedAccounts.ts` — `startOAuth` (line 114)
  mints the connector nonce; `disconnect` (line 153) is an `authAction` example.
- `packages/backend/convex/_connectors/tokens.ts` — `consumeOauthState`
  (line 126); `insertOauthState` (line 102) has no callers.
- `packages/backend/convex/_connectors/oauth.ts` — `completeAuthorization`
  internal action (line 184) exchanges the code and stores the token.
- `apps/web/src/routes/_global/home/ReposClient.tsx` — `/home` page client
  (243 lines; `export function ReposClient()` at line 44).
- `apps/web/src/routes/preview-auth.tsx` — an existing "finish a hop in the
  signed-in browser" page; the pattern to follow for the web half.

State creation has no browser binding. `_github/userTokens.ts:82-104`:

```ts
export const startUserAuthorization = authMutation({
  args: { installationId: v.union(v.number(), v.null()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    await rejectSandboxCaller(ctx);
    const clientId = requiredEnv("GITHUB_CLIENT_ID");
    const siteUrl = requiredEnv("CONVEX_SITE_URL");
    const nonce = crypto.randomUUID();
    await ctx.db.insert("githubOauthStates", {
      nonce,
      userId: ctx.userId,
      installationId: args.installationId ?? undefined,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    });
    ...
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
```

The web app gets this URL from a WebSocket mutation and sets
`window.location.href = url` (`RepoSetupClient.tsx`, `handleAuthorizeGitHub`).
No cookie is set anywhere. `connectedAccounts.ts:114-148` (`startOAuth`) has the
same shape (it adds a server-side PKCE verifier, which binds nothing to the
browser because the verifier never leaves the server).

The callback trusts the nonce alone. `http.ts:806-829`:

```ts
    // The nonce is the only thing tying this request to an Eva account, and it
    // is single-use: ...
    const claim = await ctx.runMutation(
      internal._github.userTokens.consumeOauthState,
      { nonce: state },
    );
    ...
      await ctx.runAction(internal._github.userAuth.completeUserAuthorization, {
        userId: claim.userId,
        code,
      });
```

The exchange stores whatever GitHub account comes back. `_github/userAuth.ts:106-113`:

```ts
export async function exchangeCodeForUserToken(
  ctx: ActionCtx,
  userId: Id<"users">,
  code: string,
): Promise<void> {
  const { authentication } = await getOAuthApp().createToken({ code });
  await storeToken(ctx, userId, toResolvedToken(authentication));
}
```

`consumeOauthState` (`_github/userTokens.ts:111-133`) deletes the row, then
returns `{ userId, installationId }` or null when expired. The connector
version (`_connectors/tokens.ts:126-157`) returns
`{ userId, provider, actor, returnPath, codeVerifier }`.

Linked GitHub identity: **Eva stores none.** `userFields`
(`_validators/tableFields.ts:75-107`) has `clerkId` and `email` only;
`githubUserTokenFields` (lines 144–155) has no GitHub user id or login. No code
reads Clerk external accounts (`grep -rn "externalAccounts\|oauth_github"`
finds nothing in `packages/backend/convex` or `apps/web/src`). There is no
"disconnect GitHub" path: nothing deletes `githubUserTokens` rows.

Return paths today: `githubAuthReturnUrl(installationId)` → `${web}/setup/${id}`
or `${web}/home`. Connector `returnPath` is sanitised at insert by
`safeReturnPath` (`connectedAccounts.ts:39-44`: must start with `/settings`,
no `//`), and again in `connectorAuthReturnUrl`.

Conventions to honour (quoted from `CLAUDE.md`):

- "No `any`, `unknown`, `as`, or non-null `!`. ... parse at the boundary (Zod)."
- "Avoid useEffect; use it only when absolutely necessary" and "useCallback and
  useMemo are banned as React Compiler is enabled".
- "Prefer simplicity, small diffs, co-location ... No new deps unless necessary."
- "Eliminate duplication, centralise your changes".

From `docs/eva-ui.md`: "Never use `window.location.href` for navigation. Always
use `useNavigate` from `@tanstack/react-router`." `navigate({ to: someString })`
with a runtime string is already used (`lib/components/FollowOverlay.tsx:64`).
From `docs/eva-convex.md`: "Single source of truth for table fields: export
`const xxxFields = { ... }`" — new token fields go in `githubUserTokenFields`.

## Design decision (made at planning time)

Goal: only the browser of the Eva user who minted `state` can turn the `code`
into a stored token.

**Chosen — finish in the web app with Clerk identity.** The Convex HTTP
callback stops redeeming anything. It redirects the browser to
`${WEB_APP_URL}/home#evaOAuth=<flow>&state=<nonce>&code=<code>`. A hook on the
`/home` page reads the fragment, removes it from the address bar, and calls an
authenticated action (`api.github.finishUserAuthorization` or
`api.connectedAccounts.finishOAuth`). The action redeems the nonce only when
the row's `userId` equals `ctx.userId`, then exchanges the code. A victim's
browser is signed in as the victim (or not signed in), so the attacker's nonce
fails; the attacker's own browser never sees the code.

- Fragment, not query: a fragment is not sent to the web host, so the code does
  not land in Vercel request logs or analytics page URLs.
- No OAuth app configuration change: the registered `redirect_uri` stays the
  Convex URL. GitHub's `createToken({ code })` does not send a `redirect_uri`;
  connectors still send the same Convex URL they authorised with.
- No new route: a new TanStack file route needs `routeTree.gen.ts`
  regenerated, which only the Vite plugin does (no CLI in this repo).

**Rejected:**

1. HttpOnly cookie set at flow start. The flow starts from a WebSocket
   mutation, which cannot set a cookie on the `*.convex.site` origin. A Convex
   HTTP "start" route could set one, but the route cannot authenticate the user
   (a top-level navigation carries no Clerk token, and the Clerk session cookie
   belongs to the web app origin). An attacker can send the victim the start
   URL, so the victim's browser would get the cookie. Binds nothing.
2. Stash the code server-side in the state row and let the web app finish with
   the nonce only. The attacker owns the nonce and can call "finish" before the
   victim's browser does, so the race goes to the attacker. Rejected.
3. Change `redirect_uri` to a web app URL. Same security as the chosen design,
   but needs manual edits in the GitHub App, Linear and Figma app settings for
   every environment. Rejected for operational cost.

**GitHub identity check (lead item (a)).** Eva has no linked GitHub id to
compare with, so "reject unless it matches" cannot work today. This plan
records the GitHub user id and login on the token row (Step 2). Enforcing a
match is **an operator decision** (see STOP conditions): recommended *not* to
enforce now, because there is no disconnect path, so a user who switches
GitHub accounts would be locked out, and the browser binding already closes
the attack. Reading Clerk external accounts is rejected: no Eva sign-in path
evidently uses GitHub SSO, and it adds a Clerk API call to the hop.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Web typecheck | `pnpm --filter @eva/web typecheck` | exit 0 |
| New backend test | `pnpm --filter @eva/backend test -- tests/oauthCallbackBinding.test.ts` | all pass |
| Existing OAuth test | `pnpm --filter @eva/backend test -- tests/oauthStatePurge.test.ts` | all pass |
| New web test | `pnpm --filter @eva/web test -- src/lib/hooks/useFinishOAuthRedirect.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

Never run `npx convex codegen`, `convex dev` or `convex deploy`. Run only the
targeted test files: 2 unrelated tests in `tests/sessionChatTabs.test.ts`
already fail (removed `archive` mutation); they are not yours to fix. Lint rule
`eva/no-source-text-in-tests` bans tests that read source files; tests must
call functions.

## Scope

**In scope** (the only files you should modify):

- `packages/backend/convex/http.ts`
- `packages/backend/convex/_github/userTokens.ts`
- `packages/backend/convex/_github/userAuth.ts`
- `packages/backend/convex/github.ts`
- `packages/backend/convex/connectedAccounts.ts`
- `packages/backend/convex/_connectors/tokens.ts`
- `packages/backend/convex/_validators/tableFields.ts` (`githubUserTokenFields` only)
- `packages/backend/tests/oauthCallbackBinding.test.ts` (create)
- `apps/web/src/lib/hooks/useFinishOAuthRedirect.ts` (create)
- `apps/web/src/lib/hooks/useFinishOAuthRedirect.test.ts` (create)
- `apps/web/src/routes/_global/home/ReposClient.tsx` (one hook call)
- `internal/changelog/2026-11.md`

**Out of scope** (do NOT touch):

- `packages/backend/convex/_connectors/oauth.ts` — `completeAuthorization`
  stays as is; the new action calls it.
- `RepoSetupClient.tsx`, `ConnectionsClient.tsx` — they keep calling the
  start mutations and doing a full-page jump to the external authorize URL
  (`window.location.href` to another origin is correct there).
- `apps/web/src/routeTree.gen.ts` — generated; this plan adds no route.
- `/api/github/setup` route (`http.ts:785-795`) — the GitHub App Setup URL;
  unrelated to OAuth codes.
- Deleting or rotating existing `githubUserTokens` / `connectedAccounts` rows —
  operator decision (see Maintenance notes).
- MCP OAuth (`registerMcpRoutes`) — Clerk-issued, different flow.

## Git workflow

- Stay on the current branch. No new branch, push or PR unless the operator says so.
- Commit per logical unit, conventional commits, e.g.
  `fix(security): finish GitHub and connector OAuth in the signed-in browser`.

## Steps

### Step 1: Redeem a nonce only for its own user

`_github/userTokens.ts` `consumeOauthState`: add `userId: v.id("users")` to
`args`. Keep "find by nonce, delete the row first". Then return null when
`row.expiresAt < Date.now()` **or** `row.userId !== args.userId`. Update the
doc comment: the row is burned on any attempt, so a mismatched user also
destroys it.

Add, in the same file, an exported pure helper and use it from `http.ts`:

```ts
/** Where the web app lands after the GitHub hop: setup for a known installation. */
export function githubAuthReturnPath(installationId: number | null): string {
  return installationId === null ? "/home" : `/setup/${installationId}`;
}
```

In `http.ts`, make `githubAuthReturnUrl` return
`${webAppUrl}${githubAuthReturnPath(installationId)}` (it is still used by
`/api/github/setup`).

`_connectors/tokens.ts` `consumeOauthState`: the same `userId` arg and the same
mismatch rule.

**Verify**: `pnpm --filter @eva/backend typecheck` → fails only in `http.ts`
(the two callbacks still call `consumeOauthState` without `userId`). Any other
error is a STOP condition.

### Step 2: Record the GitHub account on the token row

`_validators/tableFields.ts`, `githubUserTokenFields`: add

```ts
  /** GitHub account the token belongs to. Absent on rows stored before 2026-11. */
  githubUserId: v.optional(v.number()),
  githubLogin: v.optional(v.string()),
```

Optional fields need no migration.

`_github/userTokens.ts` `putStoredToken`: add
`githubAccount: v.optional(v.object({ id: v.number(), login: v.string() }))`.
Add `githubUserId`/`githubLogin` to `fields` **only when `args.githubAccount`
is present** (spread a conditional object). The refresh path does not pass it,
and `ctx.db.patch` with an `undefined` value would delete the stored id.

`_github/userAuth.ts`: in `exchangeCodeForUserToken`, after `createToken`,
read the account with the new token and pass it through:

```ts
  const { data } = await new Octokit({
    auth: authentication.token,
  }).rest.users.getAuthenticated();
  await storeToken(ctx, userId, toResolvedToken(authentication), {
    id: data.id,
    login: data.login,
  });
```

Give `storeToken` an optional 4th parameter `githubAccount?: { id: number; login: string }`
and forward it to `putStoredToken` only when defined. Do **not** compare the id
with anything (see STOP conditions).

**Verify**: `pnpm --filter @eva/backend typecheck` → same `http.ts` errors as
Step 1, nothing new.

### Step 3: Authenticated finish actions

GitHub — in `_github/userAuth.ts`:

- Import `authAction` from `../functions` and `rejectSandboxCaller` from
  `../_auth/sandboxIdentity`, and `githubAuthReturnPath` from `./userTokens`
  (check it does not create an import cycle; `userTokens.ts` is not `"use node"`
  and does not import `userAuth.ts`).
- Export a message constant and the action:

```ts
export const OAUTH_STATE_REJECTED =
  "This authorization was started from another Eva account, or it expired. Start again.";

/**
 * Finishes the GitHub authorize hop in the browser that came back. The nonce
 * is redeemed only for the signed-in Clerk user, so a link started by one Eva
 * user and opened by another cannot attach the second user's GitHub token to
 * the first user's account.
 */
export const finishUserAuthorization = authAction({
  args: { state: v.string(), code: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    await rejectSandboxCaller(ctx);
    const claim = await ctx.runMutation(
      internal._github.userTokens.consumeOauthState,
      { nonce: args.state, userId: ctx.userId },
    );
    if (!claim) throw new Error(OAUTH_STATE_REJECTED);
    if (args.code !== undefined) {
      try {
        await exchangeCodeForUserToken(ctx, ctx.userId, args.code);
      } catch (error) {
        // Same as before: the return page re-checks and shows the prompt again.
        console.error("[githubUserAuth] code exchange failed", error);
      }
    }
    return githubAuthReturnPath(claim.installationId);
  },
});
```

- Delete `completeUserAuthorization` (its only caller was the HTTP callback).
  Update the `exchangeCodeForUserToken` doc comment: identity now comes from
  `finishUserAuthorization`'s Clerk user, not from the nonce.
- `github.ts`: add `export { finishUserAuthorization } from "./_github/userAuth";`.

Connectors — in `connectedAccounts.ts`:

- Extract the redirect URI used in `startOAuth` into one local helper
  `connectorRedirectUri(): string` (returns
  `` `${requiredEnv("CONVEX_SITE_URL").replace(/\/$/, "")}/api/connectors/oauth/callback` ``)
  and use it in `startOAuth`.
- Add:

```ts
/** Finishes the connector hop for the signed-in user only. Returns the path to land on. */
export const finishOAuth = authAction({
  args: { state: v.string(), code: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const claim = await ctx.runMutation(
      internal._connectors.tokens.consumeOauthState,
      { nonce: args.state, userId: ctx.userId },
    );
    if (!claim) {
      throw new Error(
        "This authorization was started from another Eva account, or it expired. Start again.",
      );
    }
    const returnPath = safeReturnPath(claim.returnPath ?? undefined);
    if (args.code === undefined) return returnPath;
    try {
      await ctx.runAction(internal._connectors.oauth.completeAuthorization, {
        userId: ctx.userId,
        provider: claim.provider,
        actor: claim.actor,
        code: args.code,
        redirectUri: connectorRedirectUri(),
        codeVerifier: claim.codeVerifier,
      });
    } catch (error) {
      console.error("[connectors] code exchange failed", error);
    }
    return returnPath;
  },
});
```

If TypeScript asks for an explicit return annotation because the handler
reaches back into `internal`, keep `Promise<string>` (pattern:
`_github/api.ts:169-171`).

**Verify**: `pnpm --filter @eva/backend typecheck` → only the `http.ts`
errors remain.

### Step 4: Callbacks forward to the web app and redeem nothing

In `http.ts`, add one helper above the GitHub callback and use it in both routes:

```ts
/**
 * Hands the OAuth result to the Eva web app, which finishes the exchange as the
 * signed-in Clerk user (`github.finishUserAuthorization`,
 * `connectedAccounts.finishOAuth`). Nothing is redeemed here: this request
 * carries no Eva identity, so redeeming the nonce here would let a link started
 * by one user store another user's token. The fragment keeps the code out of
 * web host logs and analytics.
 */
function oauthFinishRedirect(
  flow: "github" | "connector",
  params: URLSearchParams,
): Response {
  const state = params.get("state");
  if (!state) return new Response("Missing state", { status: 400 });
  const fragment = new URLSearchParams({ evaOAuth: flow, state });
  const code = params.get("code");
  if (code) fragment.set("code", code);
  return Response.redirect(
    `${tryGetEvaBaseUrl() ?? ""}/home#${fragment.toString()}`,
    302,
  );
}
```

Each route handler becomes
`httpAction(async (_ctx, request) => oauthFinishRedirect("github", new URL(request.url).searchParams))`
(and `"connector"`). Delete `connectorAuthReturnUrl` (now unused). Remove
`CONVEX_SITE_URL` reading from the connector route.

**Verify**:
- `pnpm --filter @eva/backend typecheck` → exit 0.
- `grep -n "consumeOauthState\|completeUserAuthorization\|connectorAuthReturnUrl" packages/backend/convex/http.ts` → no matches.
- `grep -rn "completeUserAuthorization" packages/backend/convex --include=*.ts | grep -v _generated` → no matches.

### Step 5: Web hook that finishes the hop

Create `apps/web/src/lib/hooks/useFinishOAuthRedirect.ts`:

```ts
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { z } from "zod";
import { api } from "@eva/backend";
import { toast, userFacingErrorMessage } from "@vvedantb/ui";

const oauthFragment = z.object({
  evaOAuth: z.enum(["github", "connector"]),
  state: z.string().min(1),
  code: z.string().min(1).optional(),
});
export type OAuthFragment = z.infer<typeof oauthFragment>;

/** Reads the fragment the Convex OAuth callback appends, or null. */
export function parseOAuthFragment(hash: string): OAuthFragment | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const parsed = oauthFragment.safeParse(Object.fromEntries(params));
  return parsed.success ? parsed.data : null;
}

/**
 * Finishes a GitHub or connector authorize hop as the signed-in user. The
 * backend redeems the nonce only for the user who started the hop.
 */
export function useFinishOAuthRedirect(): void {
  const navigate = useNavigate();
  const finishGitHub = useAction(api.github.finishUserAuthorization);
  const finishConnector = useAction(api.connectedAccounts.finishOAuth);

  // Effect: reads the one-time URL fragment and calls the backend once.
  useEffect(() => {
    const fragment = parseOAuthFragment(window.location.hash);
    if (!fragment) return;
    // Remove the code from the address bar and history first. A re-run of this
    // effect then finds no fragment, so the action runs once.
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    const args = {
      state: fragment.state,
      ...(fragment.code ? { code: fragment.code } : {}),
    };
    const finish =
      fragment.evaOAuth === "github" ? finishGitHub(args) : finishConnector(args);
    finish
      .then((path) => navigate({ to: path, replace: true }))
      .catch((error: Error) => {
        toast.error(
          userFacingErrorMessage(error, "Couldn't finish the authorization."),
        );
      });
  }, [finishGitHub, finishConnector, navigate]);
}
```

Adjust imports only if typecheck says a symbol lives elsewhere (`toast` and
`userFacingErrorMessage` come from `@vvedantb/ui` in `RepoSetupClient.tsx:6`).
Do not add `useRef`, `useMemo` or `useCallback`. Do not put a `try/finally`
in the file (React Compiler bails on `finally`).

In `ReposClient.tsx`, call `useFinishOAuthRedirect();` as the first line of
`ReposClient()` and add the import.

**Verify**: `pnpm --filter @eva/web typecheck` → exit 0.

### Step 6: Tests

See "Test plan". **Verify**: both test commands in the table pass.

### Step 7: Changelog and lint

Add at the top of `internal/changelog/2026-11.md`, directly under
`# Changelog — November 2026`:

```
## GitHub and connector OAuth finish only for the user who started them - 2026-11-12

- Cause: the OAuth callbacks trusted the `state` nonce alone, so a hop started by one Eva user and opened by another stored the second user's GitHub (or Linear/Figma) token on the first user's account.
- The Convex callbacks now forward `state` and `code` in a URL fragment to `/home`; `github.finishUserAuthorization` and `connectedAccounts.finishOAuth` redeem the nonce only for the signed-in Clerk user.
- GitHub token rows record `githubUserId` and `githubLogin` (not enforced yet).
```

**Verify**: `pnpm lint` → exit 0. `git status --short` lists only in-scope files.

## Test plan

Create `packages/backend/tests/oauthCallbackBinding.test.ts`, modelled on
`tests/oauthStatePurge.test.ts` and `tests/quickTaskSessions.test.ts`
(`convexTest(schema, modules)`, `t.withIdentity({ subject: CLERK_ID })`,
`TIMEOUT_MS = 30_000`). Fixture: users Alice and Bob; a `githubOauthStates`
row `{ nonce: "gh-alice", userId: alice, installationId: 7, expiresAt: now + 10 min }`;
a `connectorOauthStates` row `{ nonce: "conn-alice", userId: alice, provider: "linear", actor: "user", returnPath: "/settings/connections", expiresAt: now + 10 min }`.

1. GitHub, wrong user: `bob.action(api.github.finishUserAuthorization, { state: "gh-alice", code: "c" })` rejects with a message containing "another Eva account"; afterwards the `githubOauthStates` table is empty and `githubUserTokens` has no row.
2. GitHub, no code (user declined): `alice.action(api.github.finishUserAuthorization, { state: "gh-alice" })` resolves to `"/setup/7"`; the state row is gone.
3. GitHub, expired: a row with `expiresAt: now - 1 min`, called by its owner → rejects.
4. Connector, wrong user: `bob.action(api.connectedAccounts.finishOAuth, { state: "conn-alice", code: "c" })` rejects; the row is gone; `connectedAccounts` has no row.
5. Connector, no code: Alice → resolves to `"/settings/connections"`.
6. Callback redeems nothing: set `process.env.WEB_APP_URL = "https://eva.test"` (restore in `afterEach`), then
   `t.fetch("/api/github/oauth/callback?state=gh-alice&code=c")` → status 302,
   `Location` equals `https://eva.test/home#evaOAuth=github&state=gh-alice&code=c`, and the `gh-alice` row still exists. Same for `/api/connectors/oauth/callback` with `evaOAuth=connector`.
7. Missing state: `t.fetch("/api/github/oauth/callback?code=c")` → 400.

Do not test the success exchange: it calls GitHub/Linear over the network. If
`t.fetch` cannot load `http.ts` under convex-test, drop tests 6–7, note it in
your report, and do not STOP.

Create `apps/web/src/lib/hooks/useFinishOAuthRedirect.test.ts` (node
environment, pure function only):

8. `parseOAuthFragment("#evaOAuth=github&state=s&code=c")` → `{ evaOAuth: "github", state: "s", code: "c" }`.
9. Without `code` → object without `code`.
10. `""`, `"#foo=bar"`, `"#evaOAuth=other&state=s"`, `"#evaOAuth=github"` → `null`.

Expected: 7 (or 5) backend tests and 3 web tests, all passing.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` and `pnpm --filter @eva/web typecheck` exit 0
- [ ] `pnpm --filter @eva/backend test -- tests/oauthCallbackBinding.test.ts tests/oauthStatePurge.test.ts` passes
- [ ] `pnpm --filter @eva/web test -- src/lib/hooks/useFinishOAuthRedirect.test.ts` passes
- [ ] `grep -n "consumeOauthState" packages/backend/convex/http.ts` → no matches
- [ ] `grep -rn "completeUserAuthorization" packages/backend/convex --include=*.ts | grep -v _generated` → no matches
- [ ] `grep -c "userId !== args.userId\|row.userId !== args.userId" packages/backend/convex/_github/userTokens.ts packages/backend/convex/_connectors/tokens.ts` → 1 in each file
- [ ] `pnpm lint` exits 0; `git status --short` lists only in-scope files (plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- The callbacks in `http.ts` or `consumeOauthState` do not match the excerpts.
- `grep -rn "consumeOauthState\|completeAuthorization\|completeUserAuthorization" packages apps --include=*.ts --include=*.tsx | grep -v _generated`
  shows a caller not named in this plan (for example a mobile or extension flow
  that depends on the callback redeeming the nonce).
- `apps/mobile` or `apps/chrome-extension` start either OAuth hop
  (`grep -rn "startUserAuthorization\|startOAuth" apps/mobile apps/chrome-extension`).
  The fragment lands on the web app, so those clients would break.
- You are asked to enforce a GitHub-id match (reject a different GitHub
  account on re-link). That is an operator decision; the recommendation is
  "record only" until a disconnect path exists.
- Importing `githubAuthReturnPath` into `_github/userAuth.ts` creates an
  import cycle or a "use node" bundling error.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Manual end-to-end check after deploy (required; the executor cannot
  deploy).** No legal or external security review is needed. On a deployed
  environment: (1) Setup → "Authorize GitHub" lands back on `/setup/<id>` and
  lists repositories; (2) Settings → Connections → connect Linear lands back on
  Settings with the account shown; (3) start the GitHub hop as user A, copy the
  GitHub authorize URL before it redirects, open it in a browser signed in to
  Eva as user B → B sees the error toast and A gets no new token row.
- Operator decision: tokens stored before this fix cannot be tied to a GitHub
  account. Optionally clear `githubUserTokens` (users re-authorise
  automatically on the next `GITHUB_AUTH_REQUIRED`). Not done here.
- Any new OAuth provider must use the same pattern: the HTTP callback only
  forwards; an `authAction` redeems the nonce for `ctx.userId`.
- `_connectors/tokens.ts:insertOauthState` has no callers and duplicates the
  insert in `startOAuth`; delete it in a later clean-up.
- Reviewer: check the fragment (not the query string) carries the code, the
  hook clears it before the action call, and both `consumeOauthState` versions
  delete the row before the user check.
