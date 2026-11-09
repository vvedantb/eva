# Plan 007: Limit the preview proxy's no-session static-asset exception to noVNC files

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 2042a0ac7..HEAD -- packages/backend/convex/_sandbox_runtime/previewProxy.ts packages/backend/tests/previewProxyGrantStrip.test.ts packages/backend/tests/previewProxyStaticAssetGate.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. (Plans 006 and 008 also edit
> `previewProxy.ts`; if they landed first, expect their changes and only check
> that the excerpts below are still present.)

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED — the exception exists so the Desktop (noVNC) tab loads; a too-tight rule shows "Loading" forever. Code-server (Editor tab) may also depend on it without saying so. Both need a live check after deploy.
- **Depends on**: none (independent of 006/008, but all three bump `SCRIPT_VERSION`)
- **Category**: security
- **Planned at**: commit `2042a0ac7`, 2026-11-09

## Why this matters

The preview proxy is the only auth gate in front of a sandbox's dev server,
Convex backend, agentation server, editor, desktop, and any port reachable via
`/__tab/<port>/`. Today any `GET` whose path ends in a static-asset extension
(`.js`, `.css`, `.map`, `.svg`, `.png`, `.wasm`, …) skips the session check on
every proxy, and is then forwarded to whatever the route resolves to. So anyone
who knows a preview hostname can fetch the app's JS bundles and source maps
(often containing source code, env-derived config, and API keys baked in by
bundlers), any `.js` route an app exposes, and the same files on any in-sandbox
port through `/__tab/<port>/x.js` — including through a forged `Referer`. The
exception was added only for noVNC (see comment below). After this plan it
applies only on the desktop proxy, only to noVNC's own asset folders, and only
when the request routes to the noVNC upstream itself.

## Current state

Files:

- `packages/backend/convex/_sandbox_runtime/previewProxy.ts` — builds the proxy
  script. Everything between `function buildPreviewProxyScript` (line 152) and
  its closing backtick is a `String.raw` template that is written into the
  sandbox (`/tmp/eva-preview-proxy-<targetPort>.mjs`, see
  `ensurePreviewNavigationProxy`, line 1534) and run with `node`. It cannot
  import anything. Tests lift functions out by their exact signature line via
  `packages/backend/tests/_helpers/previewProxySource.ts` (`extractFunctionSource`).
- `packages/backend/tests/previewProxyGrantStrip.test.ts` — builds `authorize`
  with stubs; its factory string defines `STATIC_ASSET_RE = /\.js$/` and will need
  a stub for the new helper.
- `packages/backend/tests/previewProxyTabPrefix.test.ts` — shows how to build the
  real routing functions (`routingFactory`, lines 30–52). Copy that.

The exception — `previewProxy.ts:391-396`:

```js
// noVNC's vnc_lite.html loads RFB via <script type="module" crossorigin="anonymous">,
// which intentionally omits cookies on ./core/rfb.js. Without an exception those
// module fetches 401 and the page never leaves the default "Loading" status.
// Static assets are public open-source files; HTML documents and WebSockets stay gated.
const STATIC_ASSET_RE =
  /\.(?:js|mjs|cjs|css|map|svg|png|jpe?g|gif|ico|webp|woff2?|ttf|otf|wasm)(?:\?|$)/i;
```

Used in `authorize` — `previewProxy.ts:437-454`:

```js
function authorize(clientReq, clientRes) {
  if (!GATE_ENABLED) return true;
  // In-sandbox clients (Inngest, BASE_APP_URL, agent-browser) hit the proxy on
  // exposed 3000 via localhost — must not require a preview grant.
  if (isLoopbackRequest(clientReq)) return true;

  let parsed = null;
  try {
    parsed = new URL(
      clientReq.url || "/",
      "https://" + (clientReq.headers["host"] || "127.0.0.1"),
    );
  } catch {}

  const isGet = (clientReq.method || "GET").toUpperCase() === "GET";
  if (isGet && parsed && STATIC_ASSET_RE.test(parsed.pathname)) {
    return true;
  }
```

Also used at `previewProxy.ts:1278` (`const addCors = STATIC_ASSET_RE.test(pathname);`)
to add `access-control-allow-origin: *` to asset responses. **Leave that use
alone** — it does not grant access, and noVNC module loads need it.

The exception was introduced by commit `44fe08e6d feat(sandbox/vercel): complete
Computer/Editor/auth parity and fast session start` (found with
`git log -S STATIC_ASSET_RE`). Since then the proxy also:

- strips `crossorigin` from module scripts (`stripModuleCrossorigin`, ~line 1016), so module loads are "ordinary same-origin module fetches (cookies included)";
- rewrites `import RFB from './core/rfb.js'` to jsDelivr (`NOVNC_CDN_RFB`, ~line 1027), so RFB and its imports no longer load from the sandbox.

So noVNC may no longer need the exception at all. This plan keeps a narrow one
anyway because it cannot be checked without a live sandbox.

How routing works (the exception must respect it):

- `resolveRoute(url)` (line 565) sends `/__convex-site…` → 3211, `/__convex…` → 3210, `/__agentation…` → 4747, `/__tab/<port>/…` → `<port>`, else → `targetPort`.
- `resolveRouteWithReferer(url, headers)` (line 611) re-routes a default-route request to a tab port when the `Referer` path is under `/__tab/<port>`. The `Referer` is client-controlled.
- The forwarder (line 1203 onward) routes the **raw** `clientReq.url` (only normalised when it contains the grant param), while `authorize` tests the **normalised** `parsed.pathname`. So `/__tab/5432/x/../../app/a.js` has pathname `/app/a.js` but routes to port 5432. The new check must route the raw URL itself.

Desktop facts:

- The desktop proxy runs with `targetPort === 16080` (`VERCEL_DESKTOP_INTERNAL_PORT`, line 29), fronting websockify `--web=/opt/novnc` (`packages/backend/convex/_sandbox/vercelProvider.ts:357`). The template already compares `targetPort === ${VERCEL_DESKTOP_INTERNAL_PORT}` for `BUFFER_WHOLE_HTML` (lines 264–266). Copy that.
- noVNC's static files live under `app/`, `core/`, `vendor/` in `/opt/novnc` (upstream noVNC layout). The Desktop tab loads `vnc_lite.html` (`apps/web/src/routes/_repo/$owner/$repo/sessions/DesktopPanel.tsx:69`); HTML stays gated.
- The editor proxy runs with `targetPort === 18080` (code-server). It loses the exception under this plan.

Other facts:

- `const SCRIPT_VERSION = "stream-v30";` (line 42) — bump when the script changes so running proxies relaunch.
- Inside the `String.raw` template, write backslashes as you want them in the script; never write `${` unless you mean interpolation.

Conventions (`CLAUDE.md`): "Think first; simplest solution wins. Ask when unsure"; "Prefer simplicity, small diffs, co-location, explicit behavior"; "No `any`, `unknown`, `as`, or non-null `!`" (test file).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| New test | `pnpm --filter @eva/backend test -- tests/previewProxyStaticAssetGate.test.ts` | all pass |
| Proxy tests | `pnpm --filter @eva/backend test -- tests/previewProxy` | all pass |
| Lint | `pnpm lint` | exit 0 |

Never run `npx convex codegen`, `convex dev` or `convex deploy`. Run only
targeted tests (5 unrelated backend tests already fail).

## Scope

**In scope**:

- `packages/backend/convex/_sandbox_runtime/previewProxy.ts`
- `packages/backend/tests/previewProxyGrantStrip.test.ts` (factory stub only)
- `packages/backend/tests/previewProxyStaticAssetGate.test.ts` (create)
- `internal/changelog/2026-11.md`

**Out of scope**:

- `addCors` at line 1278 and `responseHeaders` — response headers, not access.
- The WebSocket `upgrade` handler — already gated.
- `html2canvasPath` / `activityScriptPath` handling — they call `authorize` and will now need a session like any other path; they are only loaded by already-authenticated pages.
- Any web-app change.

## Git workflow

- Stay on the current branch; no branch, push, or PR unless told.
- One commit, e.g. `fix(backend): gate preview static assets except noVNC files`.

## Steps

### Step 1: Replace the blanket exception

In the template, directly after the `STATIC_ASSET_RE` declaration, add:

```js
// noVNC ships its own static files under these folders in /opt/novnc. Only
// the desktop proxy serves them; every other proxy (dev server, editor, tabs)
// keeps assets behind the session cookie, because app bundles and source maps
// are not public.
const NOVNC_ASSET_DIR_RE = /^\/(?:app|core|vendor)\//;
const IS_DESKTOP_PROXY = targetPort === ${VERCEL_DESKTOP_INTERNAL_PORT};

// The no-session exception for noVNC. Routes the raw URL with its Referer the
// way the forwarder does, so "/__tab/<port>/…", "/__convex/…" or a forged tab
// Referer cannot ride it to another port.
function isPublicNovncAsset(clientReq, pathname) {
  if (!IS_DESKTOP_PROXY) return false;
  if (!STATIC_ASSET_RE.test(pathname)) return false;
  if (!NOVNC_ASSET_DIR_RE.test(pathname)) return false;
  const route = resolveRouteWithReferer(clientReq.url || "/", clientReq.headers);
  return route.port === targetPort && route.tabPrefix === null;
}
```

(`${VERCEL_DESKTOP_INTERNAL_PORT}` is a real interpolation, same as on line 265.)

Update the comment above `STATIC_ASSET_RE` so it no longer says every static
asset is public: say the regex marks asset responses for CORS, and that the
no-session exception is `isPublicNovncAsset`.

In `authorize`, replace

```js
  if (isGet && parsed && STATIC_ASSET_RE.test(parsed.pathname)) {
    return true;
  }
```

with

```js
  if (isGet && parsed && isPublicNovncAsset(clientReq, parsed.pathname)) {
    return true;
  }
```

Bump `SCRIPT_VERSION` by one from its current value.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.
`grep -n "STATIC_ASSET_RE.test" packages/backend/convex/_sandbox_runtime/previewProxy.ts` → exactly 2 matches (inside `isPublicNovncAsset` and the `addCors` line).

### Step 2: Keep the grant-strip test building

In `tests/previewProxyGrantStrip.test.ts`, inside the factory body string, add
the stub `function isPublicNovncAsset() { return false; }` next to the other
stubs (e.g. after `function isLoopbackRequest() { return false; }`).

**Verify**: `pnpm --filter @eva/backend test -- tests/previewProxyGrantStrip.test.ts` → all pass.

### Step 3: New test for the gate

Create `packages/backend/tests/previewProxyStaticAssetGate.test.ts`. Build
`authorize` from the shipped source, like `previewProxyGrantStrip.test.ts`, but
with the **real** routing and asset functions, like `previewProxyTabPrefix.test.ts`:

- `new Function("targetPort", "proxyPort", body)` where `body` joins:
  - constants: `GATE_ENABLED = true`, `GRANT_PARAM`, `SESSION_COOKIE`, `SESSION_TTL_SECONDS`, `SANDBOX_ID`, and the routing constants from `previewProxyTabPrefix.test.ts` lines 33–40;
  - the real `const STATIC_ASSET_RE = …;` sliced from `previewProxySource` (from `"const STATIC_ASSET_RE"` to the next `";"`, the way that file slices `TAB_SKIP_PREFIX_RE`);
  - the real `const NOVNC_ASSET_DIR_RE = …;` sliced the same way;
  - `const IS_DESKTOP_PROXY = targetPort === 16080;` (the shipped line is a template interpolation, so write it literally in the test);
  - stubs: `isLoopbackRequest` → false, `parseCookies`, `verifySession` → null, `verifyGrant` → null, `signSession`, `buildAuthBootstrapHtml`, and `safeLocalPath` if plan 006 has landed (extract the real one if present);
  - real sources via `extractFunctionSource`: `matchPrefix`, `matchTabPrefix`, `resolveRoute`, `resolveRouteWithReferer`, `isPublicNovncAsset`, `authorize`;
  - `return authorize;`.
- A `run({ targetPort, url, method?, referer?, accept? })` helper that returns `{ allowed, status }` using a fake `clientRes` (`writeHead` records status, `end` no-op). Default `accept` to `"*/*"` so a denial is a 401.

Cases (no session cookie in any):

1. Desktop (16080), `GET /core/rfb.js` → allowed.
2. Desktop, `GET /app/ui.js?v=1` → allowed.
3. Desktop, `GET /vendor/pako/lib/zlib/inflate.js` → allowed.
4. Desktop, `GET /secret.js` → 401.
5. Desktop, `GET /__tab/5432/app/x.js` → 401.
6. Desktop, `GET /__tab/5432/x/../../app/x.js` → 401 (raw URL routes to the tab).
7. Desktop, `GET /app/x.js` with `referer: "https://h.vercel.run/__tab/5432/"` → 401.
8. Desktop, `GET /__convex/app/x.js` → 401.
9. Desktop, `POST /app/x.js` → 401.
10. Desktop, `GET /vnc_lite.html` → 401 (HTML stays gated; with `accept: "text/html"` it is status 200 bootstrap and `allowed === false`).
11. Dev proxy (targetPort 13000), `GET /app/x.js` → 401.
12. Dev proxy, `GET /_next/static/chunks/main.js` → 401.
13. Dev proxy, `GET /main.js.map` → 401.
14. Editor proxy (18080), `GET /static/out/vs/loader.js` → 401.

**Verify**: `pnpm --filter @eva/backend test -- tests/previewProxyStaticAssetGate.test.ts` → 14 pass.

### Step 4: Full proxy suite, changelog, lint

Add at the top of `internal/changelog/2026-11.md`:

```
## Preview assets need a preview session (noVNC files excepted) - 2026-11-09

- Cause: any GET ending in a static-asset extension skipped the preview session on every proxy and was forwarded to the dev server, Convex and `/__tab/<port>` routes, so bundles and source maps were public.
- Now only the desktop proxy serves `/app/`, `/core/`, `/vendor/` assets without a session, and only when the request routes to noVNC itself. SCRIPT_VERSION bumped.
- Needs a live check of the Desktop and Editor tabs after deploy.
```

**Verify**: `pnpm --filter @eva/backend test -- tests/previewProxy` → all pass. `pnpm lint` → exit 0.

### Step 5: Hand the live check to the operator

You cannot deploy (never run `convex deploy`), so you cannot run this. Put
this checklist in your final report for the operator, to run after deploy on a
Vercel sandbox:

1. Open a session's **Desktop** tab. It must leave "Loading" and show the desktop. In DevTools → Network, no request to the sandbox origin may return 401.
2. Open the **Editor** tab (code-server). It must load the workbench and open a file. No 401s on the sandbox origin.
3. Open **Preview** in the Eva iframe and in a new tab (open-in-new-tab). The app must load with all assets.
4. From a signed-out browser: `GET https://<preview-host>/<any app .js path>` → 401.

If 1 fails: the noVNC page loads a local asset outside `/app/ /core/ /vendor/`;
add only that prefix. If 2 fails: code-server depends on cookieless asset loads;
this needs an operator decision (extend the exception to the editor port with
code-server's static prefix, or fix the cookie path) — do not decide alone.

## Test plan

- New `tests/previewProxyStaticAssetGate.test.ts`, 14 cases above, run against the shipped function source.
- `tests/previewProxyGrantStrip.test.ts` keeps passing with one stub added.
- Manual post-deploy checklist (Step 5).

## Done criteria

- [ ] `pnpm --filter @eva/backend typecheck` exits 0
- [ ] `pnpm --filter @eva/backend test -- tests/previewProxy` passes, including 14 new tests
- [ ] `grep -n "STATIC_ASSET_RE.test(parsed.pathname)" packages/backend/convex/_sandbox_runtime/previewProxy.ts` → no match
- [ ] `grep -n "function isPublicNovncAsset" packages/backend/convex/_sandbox_runtime/previewProxy.ts` → 1 match
- [ ] `SCRIPT_VERSION` value bumped
- [ ] `pnpm lint` exits 0; `git status --short` lists only in-scope files
- [ ] Final report contains the Step 5 checklist
- [ ] `plans/README.md` status row updated

## STOP conditions

- The `authorize` excerpt or the `STATIC_ASSET_RE` comment does not match.
- You find evidence in the repo (comments, tests, `DesktopPanel.tsx`, `vercelProvider.ts`) that noVNC loads local assets outside `app/`, `core/`, `vendor/`, or that a non-desktop surface (editor, dev preview, `/__tab`, Convex) relies on cookieless asset loads — report it; do not widen the rule on your own.
- `resolveRouteWithReferer` is not defined in the same template scope as `authorize` (the call would throw at runtime).
- A test case above cannot be made to pass without changing the rule's intent.

## Maintenance notes

- Upgrading noVNC: check its asset folders still match `NOVNC_ASSET_DIR_RE`. If `NOVNC_CDN_RFB` covers every module, the exception may be removable — test by deleting it on a live sandbox.
- If a new proxied surface needs cookieless assets, add a surface-specific rule like `isPublicNovncAsset`; never return to an extension-only check.
- Reviewer: confirm the check routes the **raw** URL (not `parsed.pathname`) and uses the Referer-aware router.
- Deferred: `addCors` still sets `access-control-allow-origin: *` on asset responses; harmless once access is gated (CORS `*` never allows credentialed reads), so left alone.
