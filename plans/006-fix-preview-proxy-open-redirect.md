# Plan 006: Preview proxy never writes a protocol-relative `Location`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 478be7912..HEAD -- packages/backend/convex/_sandbox_runtime/previewProxy.ts packages/backend/tests/previewProxyGrantStrip.test.ts packages/backend/tests/previewProxyTabPrefix.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plans 007 and 008 also edit
> `previewProxy.ts`; if they landed first, expect their changes and only check
> that the excerpts below are still present.)

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `478be7912`, 2026-11-12
- Refreshed: 2026-11-12 (was planned at 2042a0ac7)

## Why this matters

The in-sandbox preview proxy builds `Location` headers from a parsed
pathname. The WHATWG URL parser can give a pathname that starts with `//`. A
browser reads a `Location` that starts with `//` as protocol-relative, so it
goes to another site. That is an open redirect on a trusted `*.vercel.run`
preview origin, usable for phishing from links that look like Eva previews.

There are two sites:

1. **Upstream `Location` rewrite (`rewriteLocationHeader`) — reachable from a
   normal browser link.** A browser normalises `https://<preview>/.//evil.example/x`
   (or `//evil.example/x`) to the request path `//evil.example/x`. The proxy
   forwards that raw path to the dev server. If the app echoes the path in an
   absolute redirect (for example a trailing-slash redirect to
   `http://127.0.0.1:<port>//evil.example/x/`), the rewrite strips the host and
   returns `//evil.example/x/`.
2. **Grant-strip 302 in `authorize` — defence in depth.** Here
   `new URL("/.//evil.example/x", base).pathname` is `//evil.example/x`. A
   browser never sends `/./` (it normalises first), and for the path
   `//evil.example/x` the proxy's parse gives pathname `/x` (safe). So this site
   is only reachable if some hop between the browser and the proxy sends an
   un-normalised path. The fix is one call, so fix it too.

After this plan, every `Location` that the proxy builds from a path starts
with exactly one `/`.

## Current state

Files:

- `packages/backend/convex/_sandbox_runtime/previewProxy.ts` — builds the proxy
  script. Everything between `function buildPreviewProxyScript` (line 153) and
  its closing backtick is a `String.raw` template. The template is written to
  the sandbox and run by `node` there. Nothing inside it can be imported; tests
  lift functions out by their exact signature line with `extractFunctionSource`
  from `packages/backend/tests/_helpers/previewProxySource.ts`.
- `packages/backend/tests/previewProxyGrantStrip.test.ts` — tests `authorize`
  by building it with `new Function(...)` (factory at lines 13–35) and stub
  dependencies.
- `packages/backend/tests/previewProxyTabPrefix.test.ts` — tests
  `rewriteLocationHeader` the same way (`locationFactory`, lines 54–62; the
  `describe("preview proxy tab redirects")` block starts at line 181; the
  dev-server route test is at line 206).

Verified behaviour (Node 24, 2026-11-12):

```
new URL("/.//h.example/x", "https://h").pathname  === "//h.example/x"
new URL("/./\\h.example/x", "https://h").pathname === "//h.example/x"
new URL("https://h/.//evil.example/x").pathname   === "//evil.example/x"   // what a browser sends
new URL("//evil.example/x?g=1", "https://h")      → host "evil.example", pathname "/x"
new URL("http://127.0.0.1:13000//evil.example/x/").pathname === "//evil.example/x/"
```

Write site 1 — `previewProxy.ts:465-472`, inside
`function authorize(clientReq, clientRes) {` (line 438):

```js
  const grant = parsed ? parsed.searchParams.get(GRANT_PARAM) : null;
  if (grant && parsed) {
    const claims = hasSession ? null : verifyGrant(grant);
    if (claims || (hasSession && isGet)) {
      parsed.searchParams.delete(GRANT_PARAM);
      const headers = {
        location: parsed.pathname + parsed.search + parsed.hash,
```

Write site 2 — `previewProxy.ts:1106-1128`,
`function rewriteLocationHeader(value, route) {`:

```js
function rewriteLocationHeader(value, route) {
  try {
    const parsed = new URL(value, "http://127.0.0.1:" + String(route.port));
    const isLocalUpstream =
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
      Number(parsed.port || "80") === route.port;
    const isVercelHost = parsed.hostname.endsWith(VERCEL_HOST_SUFFIX);
    if (isLocalUpstream || isVercelHost) {
      const path = parsed.pathname + parsed.search + parsed.hash;
      // A tab upstream redirects within its own app ("/login"), which must stay
      // under the tab prefix or it would land on the dev server.
      if (
        route.tabPrefix &&
        parsed.pathname !== route.tabPrefix &&
        !parsed.pathname.startsWith(route.tabPrefix + "/")
      ) {
        return route.tabPrefix + path;
      }
      return path;
    }
    return value;
  } catch {
    return value;
  }
}
```

It is called from `responseHeaders` (line 1149, `if (lower === "location")`).
When `route.tabPrefix` is set the result is prefixed and safe; the plain
`return path;` is not. An upstream `Location` that is already an absolute or
protocol-relative external URL falls to `return value;` — that is the app's
own explicit choice; leave it.

Other places that write `Location`: none. `grep -n "location" previewProxy.ts`
shows only these two server-side sites; the rest is browser-script code
(`window.location`, `location.href`) and `buildAuthBootstrapHtml` (line 371;
builds the Eva URL from constants plus the browser's own `location.href`). The
grant-strip code at lines 1245–1251 (HTTP forwarder) and 1420–1426 (WebSocket
`upgrade`) builds upstream request paths, not `Location`; leave them.

Other facts:

- `const SCRIPT_VERSION = "stream-v31";` at line 43, with the comment "Bump
  when the generated proxy script changes so already-running proxies from an
  older deploy are detected as stale (via the health response) and relaunched."
- Inside the `String.raw` template, write backslashes literally (`\\` in the
  source stays `\\` in the script, which a regex reads as one backslash).
  Do not write `${` inside the template unless you mean interpolation.

Conventions (`CLAUDE.md`): "Prefer simplicity, small diffs, co-location";
"Eliminate duplication, centralise your changes" — one helper used by both
sites; "No `any`, `unknown`, `as`, or non-null `!`" applies to the test files.
The lint rule `eva/no-source-text-in-tests` bans tests that read source files
as text and assert on it; tests must run the code. `extractFunctionSource` +
calling the function is the allowed pattern.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Proxy tests | `pnpm --filter @eva/backend test -- tests/previewProxyGrantStrip.test.ts tests/previewProxyTabPrefix.test.ts` | all pass |
| All proxy tests | `pnpm --filter @eva/backend test -- tests/previewProxy` | all pass |
| Lint | `pnpm lint` | exit 0 |

Never run `npx convex codegen`, `convex dev` or `convex deploy`. Run only
targeted test files. At planning time 2 backend tests in
`tests/sessionChatTabs.test.ts` already fail; they are not yours to fix.

## Scope

**In scope**:

- `packages/backend/convex/_sandbox_runtime/previewProxy.ts`
- `packages/backend/tests/previewProxyGrantStrip.test.ts`
- `packages/backend/tests/previewProxyTabPrefix.test.ts`
- `internal/changelog/2026-11.md`

**Out of scope**:

- `STATIC_ASSET_RE` and the static-asset bypass — plan 007.
- `verifyGrant` — plan 008.
- Absolute external `Location` values from the upstream (`return value;`) — the app chose them.
- The grant-strip 302 turning `//host/x` into `/x` (drops a segment; safe, not a redirect).

## Git workflow

- Stay on the current branch; no branch, push, or PR unless told.
- One commit, e.g. `fix(backend): stop preview proxy open redirect via leading slashes`.

## Steps

### Step 1: Add `safeLocalPath` and use it at both sites

In the template, directly above `function authorize(clientReq, clientRes) {`,
add:

```js
// A pathname from new URL() can start with "//" after dot-segment removal
// ("/.//evil.example" → "//evil.example"), and browsers read "//" or "/\" in a
// Location as protocol-relative: a redirect off this origin. Collapse every
// leading slash or backslash to one "/".
function safeLocalPath(pathname) {
  return "/" + String(pathname).replace(/^[\/\\]+/, "");
}
```

Then:

- `authorize`: `location: safeLocalPath(parsed.pathname) + parsed.search + parsed.hash,`
- `rewriteLocationHeader`: `const path = safeLocalPath(parsed.pathname) + parsed.search + parsed.hash;`
  (leave the `parsed.pathname` uses in the tab-prefix condition unchanged).

Bump `SCRIPT_VERSION` by one from its live value (at planning time
`"stream-v31"` → `"stream-v32"`; if plan 007 or 008 already bumped it, add one
to the current value).

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0. The two existing
test files now fail with `safeLocalPath is not defined` — expected until Step 2.

### Step 2: Update the test factories and add cases

`tests/previewProxyGrantStrip.test.ts`: in the `new Function(...)` body string,
add the real helper before `${authorizeSource}`:
`${extractFunctionSource("function safeLocalPath(pathname) {")}`.
Add tests inside the existing `describe`:

1. Session cookie + grant, url `/.//evil.example/x?__eva_grant=xyz` → status 302, `res.headers.location === "/evil.example/x"`.
2. Same with a backslash: url `"/./\\evil.example/x?__eva_grant=xyz"` (JS string; one backslash on the wire) → `location` does not start with `//` and does not start with `/\\`.
3. Existing cases still pass unchanged (`/slides/a?slide=5`, `/`).

`tests/previewProxyTabPrefix.test.ts`: add the helper to `locationFactory`'s
array before the `rewriteLocationHeader` source:
`extractFunctionSource("function safeLocalPath(pathname) {"),`.
Add tests in `describe("preview proxy tab redirects")`, using the same dev
route as the existing "the dev-server route behaves exactly as before" test
(`tabPrefix: null`, port `TARGET_PORT`):

4. `rewriteLocationHeader("http://127.0.0.1:13000//evil.example/x/", devRoute)` → `"/evil.example/x/"` (the browser-reachable case).
5. `rewriteLocationHeader("/.//evil.example/x", devRoute)` → `"/evil.example/x"`.
6. `rewriteLocationHeader("https://sb-abc.vercel.run//evil.example/x", devRoute)` → `"/evil.example/x"`.
7. External absolute `"https://example.com/x"` stays unchanged (existing test).

**Verify**: `pnpm --filter @eva/backend test -- tests/previewProxyGrantStrip.test.ts tests/previewProxyTabPrefix.test.ts` → all pass, including 5 new tests.

### Step 3: Full proxy suite, changelog, lint

Add at the top of `internal/changelog/2026-11.md`, directly under the
`# Changelog — November 2026` heading (format per
`internal/changelog/README.md`):

```
## Preview proxy open redirect closed - <today's date, YYYY-MM-DD>

- Cause: the upstream Location rewrite and the grant-strip 302 used `new URL().pathname`, which can start with `//` (a browser-normalised `//host/...` path echoed by the app, or dot-segment removal); browsers treat that as another host.
- `safeLocalPath` in the proxy script collapses leading slashes/backslashes. SCRIPT_VERSION bumped so running proxies relaunch.
```

**Verify**: `pnpm --filter @eva/backend test -- tests/previewProxy` → all pass. `pnpm lint` → exit 0.

## Test plan

- 5 new cases (2 in `previewProxyGrantStrip.test.ts`, 3 in `previewProxyTabPrefix.test.ts`) as listed; they run the shipped function source.
- Pattern: existing tests in the same files.

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] `pnpm --filter @eva/backend test -- tests/previewProxy` passes
- [ ] `grep -n "location: parsed.pathname" packages/backend/convex/_sandbox_runtime/previewProxy.ts` → no match
- [ ] `grep -n "const path = parsed.pathname" packages/backend/convex/_sandbox_runtime/previewProxy.ts` → no match
- [ ] `grep -c "safeLocalPath(" packages/backend/convex/_sandbox_runtime/previewProxy.ts` → 3 (definition + 2 uses)
- [ ] `SCRIPT_VERSION` is one more than the value you found (planning time: `"stream-v31"`)
- [ ] `pnpm lint` exits 0; `git status --short` lists only in-scope files (plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The two `Location` sites do not match the excerpts.
- `grep -n "location" previewProxy.ts` shows a third server-side `Location`/`writeHead(30x` built from request or upstream data that this plan does not name — report it rather than guessing.
- A test needs the factory to stub something other than `safeLocalPath` to pass.
- Typecheck fails because of the template literal (e.g. a stray `${`).

## Maintenance notes

- Any new redirect the proxy writes must go through `safeLocalPath`.
- Reviewer: confirm the regex is `^[\/\\]+` in the shipped script (String.raw keeps backslashes) and both call sites use it.
- Running proxies keep the old script until relaunch; the `SCRIPT_VERSION` bump triggers that on the next preview URL request.
