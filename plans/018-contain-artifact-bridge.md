# Plan 018: Hosted artifacts read only their own team's repos, under a strict frame CSP

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` (add a row if none exists) — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 478be7912..HEAD -- packages/backend/convex/artifacts.ts packages/backend/convex/mcp/queries.ts apps/web/src/lib/components/artifacts/useArtifactBridge.ts apps/web/src/lib/components/artifacts/_shim.ts apps/web/src/lib/components/artifacts/ArtifactFrame.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (artifacts that query repos outside their team, or load from unlisted hosts, stop working)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `478be7912`, 2026-11-12

This plan has two phases. **Phase A** (Steps 1–4, bridge scoping) needs no
decision; do it. **Phase B** (Steps 5–6, CSP) runs only if the operator's
dispatch message approves a CSP host list (see "Operator decision B").
Otherwise stop after Step 4 and set the README row to
`IN PROGRESS — Phase A done; Phase B awaits CSP host list`.

## Why this matters

A hosted artifact is untrusted HTML that runs in an iframe inside Eva. Its
script calls `window.cowork.callMcpTool`, and Eva runs the call as the
**viewer**, with no repo scope: Postgres replicas, Convex deployments
(including `environment: "prod"`) and Supabase projects of every repo the
viewer can reach, in any team. Anyone in the bound team — and any agent,
because `create_artifact` is an MCP tool — can publish an artifact. When a
teammate opens it, the script can read that teammate's data in other teams
and send it off-site, because the frame has no Content Security Policy.
After this plan, a bridge call can only target repos that belong to the
artifact's bound team (Phase A), and the frame cannot open network
connections or load from unlisted hosts (Phase B).

## Current state

Files:

- `packages/backend/convex/artifacts.ts` — artifact CRUD and the bridge.
  Allowlist at lines 106–118; bridge comment 312–323; `callViaMcpServer`
  336–357; `callTool` 396–447.
- `packages/backend/convex/mcp/queries.ts` — `listUserRepos` (line 61), the
  repo shape MCP tools use.
- `packages/backend/convex/mcp/toolShared.ts` — `RepoInfo` (line 54),
  `matchRepoByName` (line 184).
- `packages/backend/convex/mcp/entityRef.ts` — `repoRefArgs` (line 29:
  `repoId`, `repoName`, `app`) and `assertRepoAccess` (line 226), which
  rejects a repo other than `scopedRepoId` when one is set.
- `apps/web/src/lib/components/artifacts/useArtifactBridge.ts` — parent half
  of the bridge; calls `callTool` at line 111.
- `apps/web/src/lib/components/artifacts/_shim.ts` — `COWORK_SHIM` (line 14)
  and `buildArtifactSrcDoc` (line 121).
- `apps/web/src/lib/components/artifacts/ArtifactFrame.tsx` — the only
  renderer of artifact HTML.

Allowlist, `artifacts.ts:106-118`:

```ts
const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "postgres_query",
  "query_table",
  "run_query",
  "get_document",
  "count_table",
  "list_repos",
  "list_tables",
]);

function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOLS.has(name) || name.startsWith("supabase_");
}
```

Bridge scope today, `artifacts.ts:318-323`:

```ts
// Every allowed tool except list_repos is forwarded to eva's MCP server as the
// caller (no scopedRepoId), so access, args and error text match mcp/tools.ts.
// Team binding only scopes where the artifact is listed; a call may target any
// repo the caller can reach.
```

`callTool` takes no artifact id, `artifacts.ts:396-398`:

```ts
export const callTool = authAction({
  args: { toolName: v.string(), args: v.string() },
```

`callViaMcpServer` forwards without a scope (`artifacts.ts:353-356`):

```ts
  const res = await ctx.runAction(internal.mcp.nodeActions.handleMcpRequest, {
    clerkUserId,
    body,
  });
```

`handleMcpRequest` (`mcp/nodeActions.ts:1846-1849`) already accepts
`scopedRepoId: v.optional(v.string())`. Every forwarded data tool
(`list_tables`, `query_table`, `get_document`, `run_query`, `count_table`,
`postgres_query` in `mcp/tools.ts:206-500`, and every `supabase_*` tool in
`mcp/supabase.ts`) takes `...repoRefArgs` and runs `assertRepoAccess`, so a
`scopedRepoId` makes the MCP server itself refuse any other repo.

Artifact → team binding: `artifactFields.boundTeamId: v.id("teams")`
(`_validators/tableFields.ts:1930`), checked with `hasTeamAccess` at create and
read. Repos belong to a team through the optional `githubRepos.teamId`, indexed
`by_team` (`schema.ts:178`). `userCanAccessRepo` (`functions.ts:38-45`):
`repo.connectedBy === userId` or member of `repo.teamId`. So every repo of the
bound team is reachable by every team member who can open the artifact.

The original design accepted cross-team reach on purpose
(`internal/plans/implemented/host-artifacts-on-eva.md:25`): "Tool calls may
target **any repo the signed-in user can access**". This plan narrows that to
the bound team; the same doc's acceptance check ("an artifact querying a
_different_ repo in the same team also loads") still holds.

Frame, `ArtifactFrame.tsx:21-28`:

```tsx
    <iframe
      ref={iframeRef}
      title={title}
      srcDoc={buildArtifactSrcDoc(html)}
      // allow-scripts WITHOUT allow-same-origin: the artifact runs in an opaque
      // origin and cannot reach eva's cookies, storage, or DOM. CDN scripts and
      // postMessage still work.
      sandbox="allow-scripts"
```

No CSP anywhere: `buildArtifactSrcDoc` (`_shim.ts:121-126`) only inserts the
shim after the first `<head>` (or prepends it), and the web app sends no
app-wide CSP (`apps/web/vercel.json` sets `Content-Security-Policy:
upgrade-insecure-requests` on session routes only; `index.html` has none).
A srcdoc frame inherits its parent's policy, so today it has none.

CDN use is a documented feature. `create_artifact` (`mcp/tools.ts:1335`):
"Provide a self-contained HTML document (inline CSS/JS, or CDN links)." No
list of allowed CDNs exists in the repo.

Conventions (from `CLAUDE.md`): "No `any`, `unknown`, `as`, or non-null `!` ...
parse at the boundary (Zod)"; "Eliminate duplication, centralise your
changes". From `docs/mcp-security.md`: "Every MCP tool resolves the Clerk user
ID to a Convex user, then checks that the user can access the repo before it
returns data. A sandbox token narrows access further to its `scopedRepoId`."
This plan uses that same `scopedRepoId` narrowing for the bridge. From
`docs/eva-convex.md`: "Never duplicate field definitions between schema and
return validators" — reuse one validator for the repo shape.
`jsonValue` (`_jev/jsonValue.ts`) is the existing Zod schema for JSON values.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Backend typecheck | `pnpm --filter @eva/backend typecheck` | exit 0 |
| Web typecheck | `pnpm --filter @eva/web typecheck` | exit 0 |
| Bridge tests | `pnpm --filter @eva/backend test -- tests/artifactBridgeScope.test.ts` | all pass |
| Existing artifact tests | `pnpm --filter @eva/backend test -- tests/artifactState.test.ts tests/artifactSource.test.ts` | all pass |
| Shim test (Phase B) | `pnpm --filter @eva/web test -- src/lib/components/artifacts/_shim.test.ts` | all pass |
| Lint | `pnpm lint` | exit 0 |

Never run `npx convex codegen`, `convex dev` or `convex deploy`. Run only
targeted test files: 2 unrelated tests in `tests/sessionChatTabs.test.ts`
already fail. Lint rule `eva/no-source-text-in-tests` bans tests that read
source files; tests must call functions.

## Scope

**In scope**:

- `packages/backend/convex/artifacts.ts`
- `packages/backend/convex/mcp/queries.ts` (extract the repo-info validator only)
- `packages/backend/tests/artifactBridgeScope.test.ts` (create)
- `apps/web/src/lib/components/artifacts/useArtifactBridge.ts`
- Phase B only: `apps/web/src/lib/components/artifacts/_shim.ts`,
  `apps/web/src/lib/components/artifacts/_shim.test.ts` (create),
  `apps/web/src/lib/components/artifacts/ArtifactFrame.tsx` (comment only)
- `internal/changelog/2026-11.md`

**Out of scope**:

- `READ_ONLY_TOOLS` contents — the tool set is unchanged.
- `mcp/tools.ts`, `mcp/supabase.ts`, `mcp/entityRef.ts` — the MCP server
  already enforces `scopedRepoId`; do not change it.
- `create_artifact` and artifact upload — who may publish is unchanged.
- `artifactState.ts` — state is already per artifact and team-gated.
- Generative HTML frames (`ChatHtmlFrame.tsx`, `HtmlPreviewFrame.tsx`) — they
  have no tool bridge.
- Viewer consent and source-repo pinning — follow-up (see Maintenance notes).

## Git workflow

- Stay on the current branch. No branch, push or PR unless the operator says so.
- One commit per phase, e.g. `fix(security): scope artifact bridge calls to the artifact's team`
  and `fix(security): strict CSP for hosted artifact frames`.

## Steps

### Step 1: One repo-info validator; a query for the artifact's team repos

In `mcp/queries.ts`, move the inline `v.object({ id, owner, name, rootDirectory, mcpRootPrompt })`
from `listUserRepos.returns` (lines 63–71) into an exported constant
`mcpRepoInfoValidator`, and use `v.array(mcpRepoInfoValidator)` there.

In `artifacts.ts`, add an internal query (import `internalQuery` from
`./_generated/server` and `mcpRepoInfoValidator` from `./mcp/queries`):

```ts
/**
 * The repos a hosted artifact's bridge may target: every repo of its bound
 * team (hidden ones too, like `listUserRepos`). Null when the artifact is
 * missing or the viewer is not in that team.
 */
export const bridgeRepos = internalQuery({
  args: { artifactId: v.id("artifacts"), userId: v.id("users") },
  returns: v.union(v.array(mcpRepoInfoValidator), v.null()),
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) return null;
    if (!(await hasTeamAccess(ctx.db, artifact.boundTeamId, args.userId))) {
      return null;
    }
    const repos = await ctx.db
      .query("githubRepos")
      .withIndex("by_team", (q) => q.eq("teamId", artifact.boundTeamId))
      .collect();
    return repos.map((repo) => ({
      id: repo._id,
      owner: repo.owner,
      name: repo.name,
      rootDirectory: repo.rootDirectory ?? null,
      mcpRootPrompt: repo.mcpRootPrompt ?? null,
    }));
  },
});
```

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.

### Step 2: Resolve every bridge call to one team repo

In `artifacts.ts`, add an exported pure helper (exported so the test can call
it directly). Import `jsonValue`/`JsonValue` from `./_jev/jsonValue` and
`matchRepoByName`/`RepoInfo` from `./mcp/toolShared`:

```ts
const bridgeArgs = z.record(z.string(), jsonValue);
const bridgeRepoRef = z.object({
  repoId: z.string().optional(),
  repoName: z.string().optional(),
  app: z.string().optional(),
});

/**
 * Picks the one repo a bridge call may run against, from the artifact's team
 * repos only, and rewrites the args to name it by id. The id is also sent as
 * `scopedRepoId`, so the MCP server refuses any other repo as well.
 */
export function resolveBridgeTarget(
  teamRepos: RepoInfo[],
  argsJson: string,
): { repoId: string; argsJson: string } | { error: string } {
  let raw: JsonValue;
  try {
    raw = JSON.parse(argsJson);
  } catch {
    return { error: "Tool arguments are not valid JSON." };
  }
  const args = bridgeArgs.safeParse(raw);
  if (!args.success) return { error: "Tool arguments must be a JSON object." };
  const ref = bridgeRepoRef.safeParse(args.data);
  if (!ref.success) return { error: "repoId, repoName and app must be strings." };
  const { repoId, repoName, app } = ref.data;
  let target: RepoInfo | undefined;
  if (repoId !== undefined) {
    target = teamRepos.find((repo) => repo.id === repoId);
  } else if (repoName !== undefined) {
    const matched = matchRepoByName(teamRepos, repoName, app);
    target = "repo" in matched ? matched.repo : undefined;
  } else {
    return { error: "Provide repoId (from list_repos) or repoName." };
  }
  if (!target) {
    return {
      error:
        "That repo is not in this artifact's team. Use list_repos to see the repos it can read.",
    };
  }
  const { repoName: _name, app: _app, ...rest } = args.data;
  return { repoId: target.id, argsJson: JSON.stringify({ ...rest, repoId: target.id }) };
}
```

If `JSON.parse` returning `any` into a `JsonValue` annotation trips lint, parse
as `bridgeArgs.safeParse(JSON.parse(argsJson))` inside the `try` instead. Do not
use `as`. If `"repo" in matched` does not narrow, use `"content" in matched`
(the error branch) the way `entityRef.ts:250` does.

**Verify**: `pnpm --filter @eva/backend typecheck` → exit 0.

### Step 3: `callTool` takes the artifact id and scopes every call

In `artifacts.ts`:

- `callViaMcpServer(ctx, userId, name, argsJson, scopedRepoId: string)`:
  pass `scopedRepoId` to `handleMcpRequest`.
- `callTool.args`: `{ artifactId: v.id("artifacts"), toolName: v.string(), args: v.string() }`.
- Handler order: (1) `isReadOnlyTool` check (unchanged); (2)
  `const teamRepos = await ctx.runQuery(internal.artifacts.bridgeRepos, { artifactId, userId: ctx.userId });`
  → if `null`, `return errorResult("Artifact not found.");`;
  (3) `list_repos`: build the response from `teamRepos` instead of
  `internal.mcp.queries.listUserRepos` (keep the replica lookup and the
  output shape unchanged); (4) every other tool:
  `const target = resolveBridgeTarget(teamRepos, args); if ("error" in target) return errorResult(target.error);`
  then `return await callViaMcpServer(ctx, ctx.userId, name, target.argsJson, target.repoId);`.
- Replace the bridge comment at lines 318–323 with: "Every call is limited to
  the repos of the artifact's bound team: `resolveBridgeTarget` picks one, and
  it is forwarded as `scopedRepoId`, so the MCP server enforces the same pin a
  sandbox token gets."

In `useArtifactBridge.ts` line 111:
`return callTool({ artifactId, toolName: message.name, args: message.args });`.

**Verify**:
- `pnpm --filter @eva/backend typecheck` → exit 0.
- `pnpm --filter @eva/web typecheck` → exit 0.
- `grep -n "listUserRepos" packages/backend/convex/artifacts.ts` → no matches.

### Step 4: Phase A tests, changelog, lint

Write the tests in "Test plan" (backend part). Add to the top of
`internal/changelog/2026-11.md` under `# Changelog — November 2026`:

```
## Hosted artifacts read only their own team's repos - 2026-11-12

- Cause: the artifact bridge ran database tools as the viewer with no repo scope, so an artifact bound to one team could read the viewer's repos in every other team.
- `artifacts.callTool` now takes `artifactId`; `resolveBridgeTarget` picks a repo of the bound team and forwards it as `scopedRepoId`. `list_repos` lists only the team's repos.
```

**Verify**: bridge tests and existing artifact tests pass; `pnpm lint` → exit 0.

**If the dispatch message does not approve a CSP host list, stop here** and
set the README row as described under Status.

### Step 5 (Phase B): Put a strict CSP first in the frame document

In `_shim.ts`, add the policy as one exported constant. Use exactly the host
list the operator approved. The recommended list (Operator decision B) is:

```ts
// The frame runs untrusted HTML. No fetch/XHR/WebSocket/beacon, no forms, no
// nested frames; scripts, styles and fonts only from these CDNs.
const ARTIFACT_CDNS = [
  "https://cdn.jsdelivr.net",
  "https://unpkg.com",
  "https://cdnjs.cloudflare.com",
];
export const ARTIFACT_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${ARTIFACT_CDNS.join(" ")}`,
  `style-src 'unsafe-inline' ${ARTIFACT_CDNS.join(" ")} https://fonts.googleapis.com`,
  `font-src data: ${ARTIFACT_CDNS.join(" ")} https://fonts.gstatic.com`,
  "img-src data: blob:",
  "media-src data: blob:",
  "worker-src blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
```

(`'unsafe-inline'` and `'unsafe-eval'` add no network reach: the artifact is
inline script already. `postMessage` to the parent is not governed by CSP, so
the bridge keeps working.)

Replace `buildArtifactSrcDoc` so the policy precedes **every** byte of the
artifact. Today the shim goes after the first `<head>` match, which an artifact
can precede with its own `<script>` (or hide in a comment):

```ts
/**
 * Our own document head comes first: the CSP meta, then the bridge shim, then
 * the artifact's HTML. The parser ignores the artifact's later doctype, <html>
 * and <head> tags (their attributes merge), so the artifact renders as before
 * in standards mode, but nothing it contains can run before the policy.
 */
export function buildArtifactSrcDoc(html: string): string {
  return `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="${ARTIFACT_CSP}">${COWORK_SHIM}${html}`;
}
```

`ARTIFACT_CSP` contains no `"` characters; keep it that way.

In `ArtifactFrame.tsx`, update the comment at lines 25–27 to say CDN scripts
load only from the hosts in `ARTIFACT_CSP` and the frame cannot open network
connections. Do not change `sandbox="allow-scripts"`.

**Verify**: `pnpm --filter @eva/web typecheck` → exit 0.

### Step 6 (Phase B): Shim tests, changelog, lint

Write the web tests in "Test plan". Add one bullet to the Step 4 changelog
entry: "Artifact frames start with a CSP meta (`ARTIFACT_CSP`): no network
connections; scripts, styles and fonts only from <approved hosts>."

**Verify**: shim test passes; `pnpm lint` → exit 0.

## Test plan

Backend — create `packages/backend/tests/artifactBridgeScope.test.ts`,
modelled on `tests/artifactState.test.ts` (same fixture style: users, a team,
`teamMembers`, an artifact with `ctx.storage.store`). Fixture: viewer Alice in
team T and team U; Mallory in team T only; repo `t-app` (`teamId: T`,
`installationId: 1`, `connectedBy: alice`), repo `u-app` (`teamId: U`), repo
`personal` (no `teamId`, `connectedBy: alice`); an artifact bound to T.

1. `alice.action(api.artifacts.callTool, { artifactId, toolName: "list_repos", args: "{}" })` → not `isError`; parsed `content[0].text` lists only `t-app`.
2. `toolName: "postgres_query"`, args `{ "sql": "select 1", "repoId": <u-app id> }` → `isError: true`, text contains "not in this artifact's team".
3. Same with `"repoName": "u-app"` → `isError: true`.
4. Same with the `personal` repo id → `isError: true`.
5. `toolName: "mcp__eva__postgres_query"` (prefixed name) with the `u-app` id → `isError: true` (prefix stripping still applies before scoping).
6. Mallory, `list_repos` on an artifact bound to U (create a second artifact) → `isError: true`, text "Artifact not found."
7. `toolName: "create_task"` → `isError: true` (allowlist unchanged).

Pure tests of `resolveBridgeTarget` in the same file (import from
`../convex/artifacts`):

8. `repoId` in team → `{ repoId, argsJson }` where the parsed `argsJson` has that `repoId` and keeps `sql`.
9. `repoName` + `app` → resolved id; `repoName` and `app` absent from `argsJson`.
10. No `repoId`/`repoName` → `{ error }`. Invalid JSON (`"{"`) → `{ error }`. A JSON array (`"[]"`) → `{ error }`.

Do not add a test that forwards an in-team call through `handleMcpRequest`; it
needs repo credentials and network.

Web (Phase B only) — create `apps/web/src/lib/components/artifacts/_shim.test.ts`:

11. `buildArtifactSrcDoc("<p>x</p>")` starts with `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy"`.
12. For input `"<script>window.a=1</script><!DOCTYPE html><html><head></head><body></body></html>"`, the index of `Content-Security-Policy` is lower than the index of `window.a=1`, and the index of `window.cowork` is lower than `window.a=1`.
13. `ARTIFACT_CSP` contains `connect-src 'none'` and `default-src 'none'`, and does not contain `"`.

## Done criteria

Phase A:

- [ ] `pnpm --filter @eva/backend typecheck` and `pnpm --filter @eva/web typecheck` exit 0
- [ ] `pnpm --filter @eva/backend test -- tests/artifactBridgeScope.test.ts tests/artifactState.test.ts tests/artifactSource.test.ts` passes (10 new tests)
- [ ] `grep -n "scopedRepoId" packages/backend/convex/artifacts.ts` shows it passed to `handleMcpRequest`
- [ ] `grep -n "callTool({ artifactId" apps/web/src/lib/components/artifacts/useArtifactBridge.ts` → 1 match
- [ ] `pnpm lint` exits 0; `git status --short` lists only in-scope files (plus `plans/README.md`)

Phase B (only if approved):

- [ ] `pnpm --filter @eva/web test -- src/lib/components/artifacts/_shim.test.ts` passes (3 new tests)
- [ ] `grep -n "replace(/(<head" apps/web/src/lib/components/artifacts/_shim.ts` → no matches
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- **Operator decision B is missing** when you reach Step 5 — stop after Step 4
  as described under Status. Do not pick CDN hosts yourself: `create_artifact`
  invites "CDN links" and the repo has no list of what live artifacts load.
- `grep -rn "artifacts.callTool" apps packages --include=*.ts --include=*.tsx | grep -v _generated`
  shows a caller other than `useArtifactBridge.ts`.
- A forwarded data tool in `mcp/tools.ts` or `mcp/supabase.ts` does not take
  `repoRefArgs` or does not call `assertRepoAccess` (the `scopedRepoId` pin
  would not apply to it).
- `matchRepoByName` or `RepoInfo` cannot be imported into `artifacts.ts`
  without pulling a `"use node"` module into the isolate bundle.
- The excerpts in "Current state" do not match the live code.
- A step's verification fails twice after a reasonable fix attempt.

## Operator decisions

- **B — CSP host list (blocks Phase B).** Recommended: script/style/font from
  `cdn.jsdelivr.net`, `unpkg.com`, `cdnjs.cloudflare.com`; Google Fonts
  (`fonts.googleapis.com`, `fonts.gstatic.com`); images only `data:`/`blob:`;
  `connect-src 'none'`. Before approving, list the external hosts that live
  artifacts load (a read-only scan of stored artifact HTML for `src=`/`href=`
  hosts; do not copy artifact content anywhere). Consider adding
  `https://cdn.tailwindcss.com` if artifacts use the Tailwind Play CDN. Expect
  breakage in artifacts that fetch remote data (GeoJSON, public APIs) or show
  remote images; that is the intended trade.
- **C — viewer consent (not in this plan).** Recommended: needed as a
  follow-up, but in a structural form first. Reasons: (1) CSP cannot stop the
  frame navigating itself (`location.href = "https://…?data"`; the CSP
  `navigate-to` directive never shipped), and WebRTC is not covered, so a
  determined script can still send data off-site; (2) after Phase A, the
  remaining risk is an **agent-made** artifact: a sandbox token is pinned to one
  repo (`entityRef.ts:201-203`: "code running in one repo's sandbox must not be
  able to pull another repo's production database out of Eva"), but its
  artifact reads every team repo, including `environment: "prod"`, once a human
  opens it. Recommended follow-up plan: pin artifacts that have a chat source
  (`sourceKind` set by `create_artifact` from a sandbox) to that chat's repo,
  and show a one-time per-viewer "This artifact reads data from <repo>" consent
  before the first database call on artifacts without a source. Human-uploaded
  artifacts gain little from consent: the uploader is a team member who can
  already read the same team repos.

## Maintenance notes

- Manual check after deploy: open an existing team artifact that queries a
  team repo — it still loads; open one that queries a repo of another team — it
  shows the tool error. After Phase B: an artifact using a listed CDN renders;
  check the browser console for CSP violations on the artifacts you rely on.
- Any new bridge tool must take `repoRefArgs` and enforce `assertRepoAccess`,
  or `scopedRepoId` will not pin it.
- `docs/mcp-security.md` and `internal/plans/implemented/host-artifacts-on-eva.md`
  still describe team-wide reach as "any repo the user can access"; update them
  in a docs follow-up.
- The artifact HTML is also reachable at its signed Convex storage URL
  (`artifacts.get` → `url`). Opened directly, it renders on the Convex storage
  origin with no bridge and no Eva credentials; not a data path, but it has no
  CSP either.
- Reviewer: confirm `resolveBridgeTarget` never forwards `repoName`/`app`, and
  that `list_repos` reads `bridgeRepos`, not `listUserRepos`.
