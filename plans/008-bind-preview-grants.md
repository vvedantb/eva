# Plan 008: Preview grants go only to their own sandbox host and only work on their own port

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/previewGrant.ts packages/backend/convex/_previewGrant packages/backend/convex/_sandbox_runtime/previewProxy.ts apps/web/src/routes/preview-auth.tsx packages/backend/tests/previewGrantReturnUrl.test.ts packages/backend/tests/previewProxyGrantPort.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plans 006 and 007 also edit
> `previewProxy.ts`; if they landed first, expect their changes and only check
> that the excerpts below are still present.)

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — a wrong host comparison blocks every cold/shared preview link sign-in.
- **Depends on**: none (all of 006/007/008 bump `SCRIPT_VERSION`)
- **Category**: security
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

A preview grant is a five-minute bearer token that the in-sandbox proxy swaps
for a 24-hour session cookie. The Eva route `/preview-auth` mints one for the
signed-in user with no click and sends it to the `return` URL, which it checks
only for "https and hostname ends in `.vercel.run`". Anyone can create a Vercel
sandbox and so own a `*.vercel.run` host. A link to
`/preview-auth?sandbox=<victim sandbox>&repo=<victim repo>&return=https://<attacker>.vercel.run/`
makes a signed-in team member hand the attacker a valid grant for the victim's
sandbox, which the attacker then redeems on the real preview host. Separately,
the proxy ignores the grant's `port` claim, so a grant minted for one surface
(e.g. Preview on 3000) also opens the Desktop (6080) or Editor (8080) proxy of
the same sandbox. After this plan, the backend refuses to mint unless the return
host is that sandbox's own preview host for that port, and the proxy refuses a
grant whose port is not its own.

## Current state

Files:

- `apps/web/src/routes/preview-auth.tsx` — handshake route. Client-side allow-list and auto-mint.
- `packages/backend/convex/previewGrant.ts` — `"use node"`; `signPreviewGrant` (line 44) and public action `mintPreviewGrant` (line 69).
- `packages/backend/convex/_sandbox_runtime/previewProxy.ts` — builds the in-sandbox proxy script (a `String.raw` template from `function buildPreviewProxyScript`, line 152, written into the sandbox and run with `node`; nothing in it can be imported). `verifyGrant` at line 311.
- `packages/backend/convex/_sandbox_runtime/execution.ts` — `buildPreviewUrl` (~line 905) mints grants for the in-app iframe; it is the reference for which port goes into a grant.
- `packages/backend/convex/_sandbox/vercelProvider.ts:1135-1150` — `previewUrl(port)` returns `{ url: this.sandbox.domain(port), port }`.
- `packages/backend/convex/_sandbox_runtime/helpers.ts:579` — `getSandboxHandle(ctx, repoId, sandboxId)`.

`apps/web/src/routes/preview-auth.tsx:10-14, 28-37, 52-77`:

```tsx
// Open-redirect guard: only ever redirect back to a Vercel sandbox preview
// origin over https. ...
const VERCEL_PREVIEW_SUFFIX = ".vercel.run";
...
function parseAllowedReturn(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (!parsed.hostname.endsWith(VERCEL_PREVIEW_SUFFIX)) return null;
    return parsed;
  } catch {
    return null;
  }
}
...
  useEffect(() => {
    if (!isLoaded || !isSignedIn || ran.current) return;

    const parsedReturn = parseAllowedReturn(search.return);
    const port = Number(search.port);
    if (!parsedReturn || !search.repo || !search.sandbox || !Number.isFinite(port)) {
      setError("This preview link is invalid or points to an untrusted host.");
      return;
    }

    ran.current = true;
    mintPreviewGrant({
      sandboxId: search.sandbox,
      port,
      repoId: search.repo,
    })
      .then((grant) => {
        parsedReturn.searchParams.set(GRANT_PARAM, grant);
        window.location.replace(parsedReturn.toString());
      })
```

`packages/backend/convex/previewGrant.ts:69-98`:

```ts
export const mintPreviewGrant = action({
  args: {
    sandboxId: v.string(),
    port: v.number(),
    repoId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const repo = await ctx.runQuery(api.githubRepos.getByIdString, { repoId: args.repoId });
    if (!repo) {
      throw new Error("Not authorized to access this repository");
    }
    await assertActionSandboxAccess(ctx, repo._id, args.sandboxId);

    return await signPreviewGrant({
      sandboxId: args.sandboxId,
      port: args.port,
      sub: identity.subject,
    });
  },
});
```

`signPreviewGrant` puts `{ sandboxId, port }` in the JWT body (line 54).

`packages/backend/convex/_sandbox_runtime/previewProxy.ts:258-260` and `311-334`:

```js
// Port shown to /preview-auth and matched against grant claims. May differ from
// targetPort when the proxy fronts an internal-only upstream (Vercel desktop).
const AUTH_PORT = ${params.authPort ?? "targetPort"};
...
function verifyGrant(token) {
  if (!PUBLIC_KEY) return null;
  try {
    ...
    if (payload.iss !== EXPECTED_ISS) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (aud.indexOf(EXPECTED_AUD) === -1) return null;
    if (payload.sandboxId !== SANDBOX_ID) return null;
    return payload;
```

The comment says grants are "matched against" `AUTH_PORT`, but no code does it.
`verifyGrant` is called by `authorize` (line ~466) and by the WebSocket
`upgrade` handler (line ~1405).

Port consistency (verified at planning time) — every grant today carries the
proxy's `AUTH_PORT`, so the new check breaks nothing:

- `execution.ts:1016-1018`: `fixedVercelProxyPort = (port is 6080 or 8080) ? port : VERCEL_PREVIEW_PROXY_PORT` (3000).
- `execution.ts:1041`: proxy launched with `authPort: fixedVercelProxyPort ?? args.port`.
- `execution.ts:1072-1075`: iframe grant signed with `port: fixedVercelProxyPort ?? args.port` — the same expression.
- `/preview-auth` gets `port` from the proxy's bootstrap HTML, which writes `AUTH_PORT` (`buildAuthBootstrapHtml`, ~line 371).
- Desktop WebSocket: `DesktopPanel.tsx:77-80` forwards the 6080 grant onto the websockify path; the desktop proxy's `AUTH_PORT` is 6080.

Where the preview host lives: nowhere in the database. Vercel assigns an
opaque subdomain per exposed port (`@vercel/sandbox` `domain(p)` reads it from
the sandbox's `routes`), so the only source of truth is the Vercel API via
`handle.previewUrl(port)` — the same call `buildPreviewUrl` makes on every
preview open (`execution.ts:1063`).

### Design decision (made at planning time)

Two designs were considered for part (a):

1. **Chosen — server-side return-host check in `mintPreviewGrant`.** The action
   takes the return URL, resolves the sandbox's real preview URL for that port
   via `getSandboxHandle(...).previewUrl(port)`, and refuses to mint unless the
   hosts match. The grant then never leaves Eva for a foreign host. Cost: one
   Vercel API read per cold sign-in (rare: once per browser per 24 h session),
   which `buildPreviewUrl` already pays on every preview open.
2. Rejected — embed the expected host in the grant and have the proxy compare
   it with the request `Host` header. The proxy code says it "cannot know its
   own browser-facing URL" because Vercel's edge terminates TLS first
   (`previewProxy.ts:365-369`, `1092-1102`); the `Host` it sees is unverified
   and may not be the external host. It also still ships the grant to the
   attacker's host. Not safe to build on without a live test.

The client-side `.vercel.run` check stays as a fast first filter for obviously
bad links. No-click minting stays: once the host is bound, the grant can only
reach the sandbox the user already has access to.

Conventions (`CLAUDE.md`, `docs/eva-convex.md`):

- "No `any`, `unknown`, `as`, or non-null `!`. ... parse at the boundary (Zod)." — the return URL is parsed with `new URL` in a `try`.
- "Avoid importing `process.env` helpers into Convex isolate workflow files. If something needs env vars, keep it in `"use node"` actions." — `previewGrant.ts` is already `"use node"`; the new pure helper must not be.
- "Greenfield OK — breaking changes fine." — adding a required arg to `mintPreviewGrant` is acceptable; web and backend deploy together.
- "Avoid useEffect" — do not restructure the existing effect in `preview-auth.tsx`; only change the mutation call.
- `docs/eva-ui.md`: "Never use `window.location.href` for navigation" — the existing `window.location.replace` is a cross-origin navigation and stays.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Web typecheck | `pnpm --filter @eva/web typecheck` | exit 0 |
| New tests | `pnpm --filter @eva/backend test -- tests/previewGrantReturnUrl.test.ts tests/previewProxyGrantPort.test.ts` | all pass |
| Proxy + cycle tests | `pnpm --filter @eva/backend test -- tests/previewProxy tests/convexModuleCycleContract.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

Never run `npx convex codegen`, `convex dev` or `convex deploy` (the generated
`api` types pick up the new arg via the existing typecheck setup; if
`pnpm --filter @eva/web typecheck` cannot see the new arg, that is a STOP).
Run only targeted tests (5 unrelated backend tests already fail).

## Suggested executor toolkit

- `convex-rules` skill for action/validator style.

## Scope

**In scope**:

- `packages/backend/convex/_previewGrant/returnUrl.ts` (create; pure, no `"use node"`)
- `packages/backend/convex/previewGrant.ts`
- `packages/backend/convex/_sandbox_runtime/previewProxy.ts` (`verifyGrant` + `SCRIPT_VERSION` only)
- `apps/web/src/routes/preview-auth.tsx` (pass `returnUrl`)
- `packages/backend/tests/previewGrantReturnUrl.test.ts` (create)
- `packages/backend/tests/previewProxyGrantPort.test.ts` (create)
- `internal/changelog/2026-11.md`

**Out of scope**:

- `buildPreviewUrl` / `previewUrlForAuthorizedSandbox` in `execution.ts` — they put the grant on the URL Vercel itself returned; already bound.
- Grant TTL, session-cookie TTL, cookie attributes.
- The static-asset exception (plan 007) and `Location` handling (plan 006).
- Adding a confirmation click to `/preview-auth`.

## Git workflow

- Stay on the current branch; no branch, push, or PR unless told.
- Two commits are fine, e.g. `fix(backend): bind preview grant mint to the sandbox preview host` and `fix(backend): preview proxy rejects grants for another port`.

## Steps

### Step 1: Pure return-URL check

Create `packages/backend/convex/_previewGrant/returnUrl.ts`:

```ts
/**
 * True when `returnUrl` is an https URL on exactly the host of `previewUrl`
 * (the sandbox's own preview URL for the port). Guards /preview-auth: the
 * grant must never be sent to another *.vercel.run host.
 */
export function isPreviewReturnUrl(returnUrl: string, previewUrl: string): boolean {
  try {
    const target = new URL(returnUrl);
    const expected = new URL(previewUrl);
    if (target.protocol !== "https:") return false;
    if (target.username !== "" || target.password !== "") return false;
    return target.host === expected.host;
  } catch {
    return false;
  }
}
```

(`host` includes a non-default port, so `https://x.vercel.run:444` does not match `https://x.vercel.run`. `URL` lower-cases hostnames.)

Create `packages/backend/tests/previewGrantReturnUrl.test.ts` (plain vitest,
pattern: `packages/backend/tests/directory.test.ts`). Cases, with
`PREVIEW = "https://sb-abc.vercel.run"`:

1. `https://sb-abc.vercel.run/` → true
2. `https://sb-abc.vercel.run/__tab/54323/?x=1` → true
3. `https://SB-ABC.vercel.run/` → true
4. `https://other.vercel.run/` → false
5. `https://sb-abc.vercel.run.evil.example/` → false
6. `http://sb-abc.vercel.run/` → false
7. `https://sb-abc.vercel.run:444/` → false
8. `https://user@sb-abc.vercel.run/` → false
9. `not a url` → false; also `previewUrl` = `"garbage"` → false

**Verify**: `pnpm --filter @eva/backend test -- tests/previewGrantReturnUrl.test.ts` → 9+ pass.

### Step 2: Bind the mint to the host

In `packages/backend/convex/previewGrant.ts`:

1. Add `returnUrl: v.string()` to `mintPreviewGrant`'s `args`.
2. Imports: `import { getSandboxHandle } from "./_sandbox_runtime/helpers";` and `import { isPreviewReturnUrl } from "./_previewGrant/returnUrl";`.
3. After `await assertActionSandboxAccess(ctx, repo._id, args.sandboxId);` add:

```ts
    // The grant may only travel to this sandbox's own preview host for this
    // port. Any *.vercel.run host can be created by anyone, so a suffix check
    // let a crafted link hand a teammate's grant to someone else's sandbox.
    const handle = await getSandboxHandle(ctx, repo._id, args.sandboxId);
    const preview = await handle.previewUrl(args.port);
    if (!isPreviewReturnUrl(args.returnUrl, preview.url)) {
      throw new Error("This preview link does not match the sandbox.");
    }
```

4. Update the action's doc comment to say it checks the return host.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.
`pnpm --filter @eva/backend test -- tests/convexModuleCycleContract.test.ts` → pass (the new import must not create a module cycle; only `execution.ts` imports `previewGrant.ts` today).

### Step 3: Pass the return URL from the web route

In `apps/web/src/routes/preview-auth.tsx`, change the `mintPreviewGrant({...})`
call to add `returnUrl: parsedReturn.toString(),` (before the grant param is
set on `parsedReturn`). Keep `parseAllowedReturn` and update the comment above
`VERCEL_PREVIEW_SUFFIX` to say the backend does the binding check and this is
only a fast pre-filter. No other change in this file.

**Verify**: `pnpm --filter @eva/web typecheck` → exit 0.

### Step 4: Proxy checks the grant port

In the template in `previewProxy.ts`, in `verifyGrant`, after
`if (payload.sandboxId !== SANDBOX_ID) return null;` add:

```js
    // A grant opens one surface: Preview (3000), Desktop (6080) or Editor
    // (8080) each run their own proxy with their own AUTH_PORT.
    if (payload.port !== AUTH_PORT) return null;
```

Bump `SCRIPT_VERSION` by one from its current value.

Create `packages/backend/tests/previewProxyGrantPort.test.ts`:

- Build `verifyGrant` from shipped source: `new Function("crypto", "PUBLIC_KEY", "AUTH_PORT", body)` where `body` = `const EXPECTED_ISS = "eva-preview"; const EXPECTED_AUD = "eva-preview"; const SANDBOX_ID = "sb";` + `extractFunctionSource("function b64urlToBuf(s) {")` + `extractFunctionSource("function verifyGrant(token) {")` + `return verifyGrant;`. Pass Node's `crypto` (`import crypto from "node:crypto"`) — not the global Web Crypto.
- Keys: `crypto.generateKeyPairSync("ec", { namedCurve: "P-256" })` in the test (a throwaway test key, never a real one). Sign with `jose` (`SignJWT`, `alg: "ES256"`, issuer/audience `"eva-preview"`, expiry +5 min, body `{ sandboxId, port }`), passing the `KeyObject` private key.
- Cases with `AUTH_PORT = 3000`:
  1. `{ sandboxId: "sb", port: 3000 }` → returns payload with `port === 3000`.
  2. `{ sandboxId: "sb", port: 6080 }` → `null`.
  3. `{ sandboxId: "sb" }` (no port) → `null`.
  4. `{ sandboxId: "other", port: 3000 }` → `null`.
  5. `{ sandboxId: "sb", port: "3000" }` (string) → `null`.
- One case with `AUTH_PORT = 6080` and a 6080 grant → payload.

**Verify**: `pnpm --filter @eva/backend test -- tests/previewProxyGrantPort.test.ts tests/previewProxy` → all pass.

### Step 5: Changelog and lint

Add at the top of `internal/changelog/2026-11.md`:

```
## Preview grants bound to their sandbox host and port - 2026-11-09

- Cause: /preview-auth minted a grant without a click and sent it to any https `*.vercel.run` return URL, which anyone can own; the proxy also ignored the grant's `port`.
- `mintPreviewGrant` now takes `returnUrl` and refuses unless its host equals the sandbox's Vercel preview host for that port (`_previewGrant/returnUrl.ts`). The proxy's `verifyGrant` rejects a grant whose `port` is not its `AUTH_PORT`. SCRIPT_VERSION bumped.
```

**Verify**: `pnpm lint` → exit 0. `git status --short` → only in-scope files.

### Step 6: Hand the live check to the operator

You cannot deploy. Put this checklist in your final report, for after deploy:

1. Copy a raw sandbox Preview URL (without `__eva_grant`), open it in a fresh browser profile signed in to Eva → it passes through `/preview-auth` and loads the app.
2. Same for Desktop (6080) and Editor (8080) raw URLs.
3. Edit the `return` param on a `/preview-auth` URL to another `*.vercel.run` host → the page shows the error, and no redirect happens.
4. The in-app Preview, Desktop and Editor tabs still load (they use `buildPreviewUrl` grants).

If 1 or 2 fails with "does not match the sandbox", Vercel served the page on a
host other than `domain(port)`; report both hostnames (they are not secrets).

## Test plan

- `tests/previewGrantReturnUrl.test.ts` — 9+ pure cases (Step 1).
- `tests/previewProxyGrantPort.test.ts` — 6 cases on the shipped `verifyGrant` (Step 4).
- Regression: `tests/previewProxy*` and `tests/convexModuleCycleContract.test.ts`.
- Manual post-deploy checklist (Step 6). The `mintPreviewGrant` action itself is not unit tested: it calls the Vercel API.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` and `pnpm --filter @eva/web typecheck` exit 0
- [ ] `pnpm --filter @eva/backend test -- tests/previewGrantReturnUrl.test.ts tests/previewProxyGrantPort.test.ts tests/previewProxy tests/convexModuleCycleContract.test.ts` passes
- [ ] `grep -n "returnUrl" packages/backend/convex/previewGrant.ts apps/web/src/routes/preview-auth.tsx` → matches in both
- [ ] `grep -n "payload.port !== AUTH_PORT" packages/backend/convex/_sandbox_runtime/previewProxy.ts` → 1 match
- [ ] `head -1 packages/backend/convex/_previewGrant/returnUrl.ts` is not `"use node";`
- [ ] `SCRIPT_VERSION` bumped; `pnpm lint` exits 0; `git status --short` lists only in-scope files
- [ ] Final report contains the Step 6 checklist
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any excerpt above does not match the live code.
- A grant is minted anywhere with a port other than the proxy's `AUTH_PORT` (re-check `execution.ts` around `signPreviewGrant` and `authPort:`; grep `signPreviewGrant(` for new callers). The port check would break that surface.
- `SandboxHandle.previewUrl` no longer returns the Vercel `domain(port)` URL, or has gained side effects beyond the existing exposed-ports update.
- Importing `getSandboxHandle` into `previewGrant.ts` makes `convexModuleCycleContract.test.ts` fail.
- `pnpm --filter @eva/web typecheck` does not see the new `returnUrl` arg (generated API types stale) — do not run `convex codegen`; report.

## Maintenance notes

- If Vercel adds custom domains or a second host per port, extend `isPreviewReturnUrl` with the extra hosts from the provider; never go back to a suffix check.
- Every new grant minter must sign `port` = the target proxy's `AUTH_PORT`.
- Reviewer: check the host comparison uses `URL.host` (not `endsWith`), and that the proxy change is inside `verifyGrant` so both HTTP and WebSocket paths get it.
- Deferred: grants are still bearer tokens for 5 minutes on the URL; plan 006-style stripping already removes them from the iframe URL.
