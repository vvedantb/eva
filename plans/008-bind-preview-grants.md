# Plan 008: Preview proxy rejects a grant minted for another port

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 478be7912..HEAD -- packages/backend/convex/_sandbox_runtime/previewProxy.ts packages/backend/convex/previewGrant.ts packages/backend/convex/_sandbox_runtime/execution.ts packages/backend/tests/previewProxyGrantPort.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plans 006 and 007 also edit
> `previewProxy.ts`; if they landed first, expect their changes and only check
> that the excerpts below are still present.)

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — every grant minted today already carries the receiving proxy's `AUTH_PORT` (verified below). A wrong check would block Preview, Desktop or Editor sign-in, so the post-deploy check matters.
- **Depends on**: none (all of 006/007/008 bump `SCRIPT_VERSION`)
- **Category**: security
- **Planned at**: commit `478be7912`, 2026-11-12
- Refreshed: 2026-11-12 (was planned at 2042a0ac7)

### Scope change at refresh

The original plan had two halves. The **return-host half is fixed on main**
and is removed from this plan:

- `apps/web/src/routes/preview-auth.tsx` now keeps only the path, query and
  hash of `return` (`returnPath`, line 22) and passes it as `path` (line 64).
  It navigates to the URL the backend returns (line 69).
- `packages/backend/convex/previewGrant.ts` `mintPreviewGrant` (line 78) now
  takes `path`, reads the origin from the provider with
  `getSandboxHandle(...).previewUrl(args.port)` (lines 104–105), copies only
  pathname/search/hash from `path` (lines 114–119), and returns the full URL.
- `packages/backend/tests/previewGrantRedirect.test.ts` covers it: an absolute
  `https://attacker.vercel.run/...`, a protocol-relative `//attacker.vercel.run/...`
  and a plain path all come back on the sandbox's own origin.

What is still open: the proxy ignores the grant's `port` claim.

## Why this matters

A preview grant is a five-minute ES256 bearer token. The in-sandbox proxy
swaps it for a 24-hour session cookie. Each exposed surface runs its own proxy:
Preview on 3000, Desktop (noVNC) on 6080, Editor (code-server) on 8080. The
grant body carries `{ sandboxId, port }`, but `verifyGrant` checks only
signature, `exp`, `iss`, `aud` and `sandboxId`. So a grant minted for Preview
also opens the Desktop or the Editor (a shell in the sandbox) of the same
sandbox. Grants travel on URLs (the in-app iframe URL, open-in-new-tab, the
`/preview-auth` redirect), so a Preview grant that leaks within its five
minutes gives more than Preview. After this plan, a proxy accepts only grants
whose `port` equals its own `AUTH_PORT`.

## Current state

Files:

- `packages/backend/convex/_sandbox_runtime/previewProxy.ts` — builds the
  in-sandbox proxy script (a `String.raw` template from
  `function buildPreviewProxyScript`, line 153, written into the sandbox and
  run with `node`; nothing in it can be imported). `verifyGrant` at line 312.
- `packages/backend/convex/previewGrant.ts` — `"use node"`; `signPreviewGrant`
  (line 47) puts `{ sandboxId, port }` in the JWT body (line 57);
  `mintPreviewGrant` (line 78).
- `packages/backend/convex/_sandbox_runtime/execution.ts` — the in-app grant
  minter (`buildPreviewUrl`); reference for which port goes into a grant.
- `packages/backend/convex/previewGrantConfig.ts` — `PREVIEW_GRANT_ISSUER` and
  `PREVIEW_GRANT_AUDIENCE` (both `"eva-preview"`), `PREVIEW_GRANT_PARAM`.
- `packages/backend/tests/_helpers/previewProxySource.ts` —
  `extractFunctionSource(signature)` lifts one function's shipped source.

`previewProxy.ts:194-199` and `259-261`:

```js
const PUBLIC_KEY_JWK = ${params.publicKeyJwk ? JSON.stringify(params.publicKeyJwk) : "null"};
const SANDBOX_ID = ${JSON.stringify(params.sandboxId)};
...
const EXPECTED_ISS = ${JSON.stringify(PREVIEW_GRANT_ISSUER)};
const EXPECTED_AUD = ${JSON.stringify(PREVIEW_GRANT_AUDIENCE)};
...
// Port shown to /preview-auth and matched against grant claims. May differ from
// targetPort when the proxy fronts an internal-only upstream (Vercel desktop).
const AUTH_PORT = ${params.authPort ?? "targetPort"};
```

The comment says grants are "matched against" `AUTH_PORT`, but no code does it.

`previewProxy.ts:283-287` and `310-336`:

```js
function b64urlToBuf(s) {
  let v = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (v.length % 4) v += "=";
  return Buffer.from(v, "base64");
}
...
// Verifies an ES256 grant JWT. JOSE signatures are raw r||s (IEEE P-1363), not
// the DER form node:crypto defaults to, hence dsaEncoding.
function verifyGrant(token) {
  if (!PUBLIC_KEY) return null;
  try {
    const parts = String(token).split(".");
    if (parts.length !== 3) return null;
    const signingInput = Buffer.from(parts[0] + "." + parts[1]);
    const ok = crypto.verify(
      "sha256",
      signingInput,
      { key: PUBLIC_KEY, dsaEncoding: "ieee-p1363" },
      b64urlToBuf(parts[2]),
    );
    if (!ok) return null;
    const payload = JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    if (payload.iss !== EXPECTED_ISS) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (aud.indexOf(EXPECTED_AUD) === -1) return null;
    if (payload.sandboxId !== SANDBOX_ID) return null;
    return payload;
  } catch {
    return null;
  }
}
```

`verifyGrant` is called by `authorize` (line 467) and by the WebSocket
`upgrade` handler (line 1406). A check inside `verifyGrant` covers both.

Port consistency (verified 2026-11-12) — every grant today carries the
receiving proxy's `AUTH_PORT`, so the new check breaks nothing:

- `execution.ts:962-966`: `fixedVercelProxyPort = (args.port === DESKTOP_PORT || args.port === EDITOR_PORT) ? args.port : VERCEL_PREVIEW_PROXY_PORT` (6080 / 8080 / 3000; constants in `packages/shared/src/sandboxPorts.ts` and `_sandbox_runtime/vercelAppPorts.ts:29`).
- `execution.ts:989`: proxy launched with `authPort: fixedVercelProxyPort ?? args.port`.
- `execution.ts:1020-1024`: iframe grant signed with `port: fixedVercelProxyPort ?? args.port` — the same expression — and placed on `handle.previewUrl(previewPort)` for that same port.
- `/preview-auth` gets `port` from the proxy's bootstrap HTML, which writes `AUTH_PORT` (`buildAuthBootstrapHtml`, line 371). `mintPreviewGrant` signs `port: args.port` (line 108) and sends it to `previewUrl(args.port)` (line 105) — the same proxy.
- Desktop WebSocket: `DesktopPanel.tsx:76-79` forwards the 6080 grant onto the websockify path of the same 6080 proxy.
- `grep -rn "signPreviewGrant(" packages/backend/convex` → only `previewGrant.ts:47` (definition), `previewGrant.ts:106` and `execution.ts:1020`.

The grant's `port` is a JSON number (`v.number()` arg; `signPreviewGrant`
types it `number`), so compare with `!==` against the numeric `AUTH_PORT`.

Conventions (`CLAUDE.md`):

- "No `any`, `unknown`, `as`, or non-null `!`." — applies to the test file.
- Lint rule `eva/no-source-text-in-tests`: tests must run code, not assert on source text. Lifting `verifyGrant` with `extractFunctionSource` and calling it is the allowed pattern (see `tests/previewProxyGrantStrip.test.ts`).
- Never put a real key in a test: generate a throwaway key pair in the test.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| New test | `pnpm --filter @eva/backend test -- tests/previewProxyGrantPort.test.ts` | all pass |
| Proxy + grant tests | `pnpm --filter @eva/backend test -- tests/previewProxy tests/previewGrantRedirect.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

Never run `npx convex codegen`, `convex dev` or `convex deploy`. Run only
targeted tests. At planning time 2 backend tests in
`tests/sessionChatTabs.test.ts` already fail; they are not yours to fix.

## Scope

**In scope**:

- `packages/backend/convex/_sandbox_runtime/previewProxy.ts` (`verifyGrant` + `SCRIPT_VERSION` only)
- `packages/backend/convex/previewGrant.ts` (doc comment only, lines 73–76)
- `packages/backend/tests/previewProxyGrantPort.test.ts` (create)
- `internal/changelog/2026-11.md`

**Out of scope**:

- The return-host binding (`preview-auth.tsx`, `mintPreviewGrant` logic) — already fixed on main.
- `buildPreviewUrl` in `execution.ts` — read only, for the port check above.
- Grant TTL, session-cookie TTL, cookie attributes; whether a session cookie is per port (each proxy has its own random `SESSION_SECRET`, so it already is).
- The static-asset exception (plan 007) and `Location` handling (plan 006).

## Git workflow

- Stay on the current branch; no branch, push, or PR unless told.
- One commit, e.g. `fix(backend): preview proxy rejects grants for another port`.

## Steps

### Step 1: Proxy checks the grant port

In the template in `previewProxy.ts`, in `verifyGrant`, after
`if (payload.sandboxId !== SANDBOX_ID) return null;` add:

```js
    // A grant opens one surface: Preview (3000), Desktop (6080) or Editor
    // (8080) each run their own proxy with their own AUTH_PORT.
    if (payload.port !== AUTH_PORT) return null;
```

Bump `SCRIPT_VERSION` by one from its live value (at planning time
`"stream-v31"` → `"stream-v32"`; if plan 006 or 007 already bumped it, add one
to the current value).

In `previewGrant.ts`, change the doc comment sentence "The grant is a bearer
token for the whole sandbox" (line 73) so it says the grant is a bearer token
for one sandbox port. Do not change any code in this file.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.
`grep -n "payload.port !== AUTH_PORT" packages/backend/convex/_sandbox_runtime/previewProxy.ts` → 1 match, inside `verifyGrant`.

### Step 2: Test the shipped `verifyGrant`

Create `packages/backend/tests/previewProxyGrantPort.test.ts`:

- Build `verifyGrant` from shipped source:
  `new Function("crypto", "PUBLIC_KEY", "AUTH_PORT", body)` where `body` =
  `const EXPECTED_ISS = "eva-preview"; const EXPECTED_AUD = "eva-preview"; const SANDBOX_ID = "sb";`
  + `extractFunctionSource("function b64urlToBuf(s) {")`
  + `extractFunctionSource("function verifyGrant(token) {")`
  + `return verifyGrant;`.
  You may import `PREVIEW_GRANT_ISSUER` / `PREVIEW_GRANT_AUDIENCE` from
  `../convex/previewGrantConfig` and interpolate them instead of the literals.
  Pass Node's `crypto` (`import crypto from "node:crypto"`) — not the global
  Web Crypto. `Buffer` is a Node global and needs no parameter.
- Keys: `crypto.generateKeyPairSync("ec", { namedCurve: "P-256" })` in the test
  (a throwaway test key, never a real one). Sign with `jose` (already a backend
  dependency): `new SignJWT({ sandboxId, port }).setProtectedHeader({ alg: "ES256" }).setIssuer(...).setAudience(...).setExpirationTime("5m").sign(privateKey)`, passing the `KeyObject` private key. Pass the `KeyObject` public key as `PUBLIC_KEY`.
- Cases with `AUTH_PORT = 3000`:
  1. `{ sandboxId: "sb", port: 3000 }` → returns a payload with `port === 3000`.
  2. `{ sandboxId: "sb", port: 6080 }` → `null`.
  3. `{ sandboxId: "sb" }` (no port) → `null`.
  4. `{ sandboxId: "other", port: 3000 }` → `null`.
  5. `{ sandboxId: "sb", port: "3000" }` (string) → `null`.
- Cases with `AUTH_PORT = 6080`:
  6. `{ sandboxId: "sb", port: 6080 }` → payload.
  7. `{ sandboxId: "sb", port: 3000 }` → `null` (a Preview grant cannot open the Desktop).

**Verify**: `pnpm --filter @eva/backend test -- tests/previewProxyGrantPort.test.ts` → 7 pass.
`pnpm --filter @eva/backend test -- tests/previewProxy tests/previewGrantRedirect.test.ts` → all pass.

### Step 3: Changelog and lint

Add at the top of `internal/changelog/2026-11.md`, directly under the
`# Changelog — November 2026` heading (format per
`internal/changelog/README.md`):

```
## Preview grants only open their own port - <today's date, YYYY-MM-DD>

- Cause: the preview proxy's `verifyGrant` ignored the grant's `port`, so a Preview grant also opened the Desktop and Editor proxies of the same sandbox.
- `verifyGrant` now rejects a grant whose `port` is not the proxy's `AUTH_PORT` (HTTP and WebSocket paths). SCRIPT_VERSION bumped.
```

**Verify**: `pnpm lint` → exit 0. `git status --short` → only in-scope files (plus `plans/README.md`).

### Step 4: Hand the live check to the operator

You cannot deploy. Put this checklist in your final report, for after deploy:

1. The in-app Preview, Desktop and Editor tabs still load (they use `buildPreviewUrl` grants). The Desktop must leave "Loading" (its WebSocket uses the grant too).
2. Copy a raw sandbox Preview URL (without `__eva_grant`), open it in a fresh browser profile signed in to Eva → it passes through `/preview-auth` and loads the app. Same for Desktop (6080) and Editor (8080) raw URLs.
3. Take a fresh Preview URL with its `__eva_grant` (from the in-app iframe) and put the same `__eva_grant` value on the Editor (8080) host in a fresh profile → the proxy does not set a session; it shows the sign-in bootstrap.

If 1 or 2 fails, a grant carries a port other than the proxy's `AUTH_PORT`;
report which surface and the `port` query param that `/preview-auth` received.

## Test plan

- `tests/previewProxyGrantPort.test.ts` — 7 cases on the shipped `verifyGrant` (Step 2).
- Regression: `tests/previewProxy*` and `tests/previewGrantRedirect.test.ts`.
- Manual post-deploy checklist (Step 4).

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] `pnpm --filter @eva/backend test -- tests/previewProxyGrantPort.test.ts tests/previewProxy tests/previewGrantRedirect.test.ts` passes
- [ ] `grep -n "payload.port !== AUTH_PORT" packages/backend/convex/_sandbox_runtime/previewProxy.ts` → 1 match
- [ ] `grep -n "bearer token for the whole sandbox" packages/backend/convex/previewGrant.ts` → no match
- [ ] `SCRIPT_VERSION` is one more than the value you found (planning time: `"stream-v31"`)
- [ ] `pnpm lint` exits 0; `git status --short` lists only in-scope files (plus `plans/README.md`)
- [ ] Final report contains the Step 4 checklist
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any excerpt above does not match the live code.
- A grant is minted anywhere with a port other than the receiving proxy's `AUTH_PORT`: re-check `execution.ts` around `signPreviewGrant(` and `authPort:`, `mintPreviewGrant` (`port` signed vs `previewUrl(port)`), and grep `signPreviewGrant(` for new callers. The port check would break that surface.
- `authPort` is passed as anything other than a number (e.g. a string) to `ensurePreviewNavigationProxy`, so `AUTH_PORT` would not be a number in the script.
- `verifyGrant` is no longer the single function used by both `authorize` and the `upgrade` handler.

## Maintenance notes

- Every new grant minter must sign `port` = the receiving proxy's `AUTH_PORT`.
- Reviewer: check the port check is inside `verifyGrant`, so both HTTP and WebSocket paths get it, and that it uses strict `!==` against a number.
- Deferred: grants are still bearer tokens for five minutes on the URL; the proxy's grant-strip 302 already removes them from the browser URL after first use.
