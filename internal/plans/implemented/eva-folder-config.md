# Repo-owned `.eva/` config (setup commands + MCP servers)

Goal: move app run commands and MCP server definitions out of Convex and into an `.eva/` folder in each repo. Secrets, env vars, uploaded config files and Eva's runtime wrappers stay in Convex/code. Add an `eva-setup` system skill that writes the folder for new repos and migrates old ones.

Supersedes the table design in [custom-mcp-servers.md](../todo/custom-mcp-servers.md) (servers now come from `.eva/mcp.json`, not a `repoMcpServers` table).

## Confirmed current behaviour (anchors)

- **Startup commands on a seeded boot depend on the surface.** The seed build bakes `/tmp/.startup-commands-done` into every seeded snapshot (`snapshotActions.ts:619`). `runStartupCommandsDirect` skips when the marker exists unless `force` (`_sandbox_runtime/execution.ts:286-298`).
  - New session sandbox: forced to rerun (`_sandbox_runtime/sessions.ts:1470-1473`).
  - New task/project preview sandbox and agent workflows (`prepareSandboxSteps.ts:274-283`): skipped.
  - Background commands and the dev server run on every boot (no marker).
- **Snapshot branch is `repoSnapshots.workflowRef ?? "main"`** (`snapshotWorkflow.ts:104`), not `defaultBaseBranch`. New repos get `defaultBaseBranch: "staging"` (`_githubRepos/mutations.ts:178`), so the two can differ.
- **Seed/image fingerprints are dead code.** `getSeedFingerprint` (`_repoSnapshots/config.ts:351-388`) and `getImageFingerprint` (`snapshotActions.ts:221-283`) have no callers. Builds never skip.
- **Commands run from the repo root** (`/tmp/repo`), not from `rootDirectory` (`_sandbox_runtime/helpers.ts:139-147`, `snapshotActions.ts:477`). Only the auto-detected dev command `cd`s into the app folder (`devServer.ts:189-191`).
- **Eva plumbing already lives in code.** `convexLocalBackend.ts` wraps any `convex` background command (binary pin, health supervisor, restarts). The Convex wait loop and `.env.local` write in this repo's startup commands are user-typed, not Eva-injected; the wait loop is redundant (`convexLocalBackend.ts:33-37`).
- **MCP:** the agent gets `eva`, `linear`, `figma` from memory (`callback-src/evaMcp.ts:21-106`) → SDK `mcpServers` (`providers/claudeSdk.ts:500-502`, `providers/cursorSdk.ts:831-833`), Codex `config.toml` (`session/codexSession.ts:72-126`), OpenCode `client.mcp.add` (`providers/opencodeSdk.ts:250-290`). Claude SDK leaves `settingSources`/`strictMcpConfig` unset (`claudeSdk.ts:469-505`), so it can also load the repo's `.mcp.json`. That is the clash: carepulse-ts lists `eva` in both `.mcp.json` and `.cursor/mcp.json`.
- **No repo-connect hook.** `insertRepo` (`_githubRepos/mutations.ts:108-180`) schedules nothing. Nearest precedent: push webhook schedules repo-skill sync when the base branch touches skill paths (`githubWebhook.ts:375-393`).
- **Monorepo precedent:** carepulse-ts `.claude/launch.json` is one root file with one named entry per app (command + port).

## File format

One root file, one entry per app (mirrors `launch.json`). Paths match `githubRepos.rootDirectory`.

`.eva/config.json`:

```jsonc
{
  "$schema": "https://<eva>/schemas/eva-setup.v1.json",
  "version": 1,
  "snapshot": {
    "build": ["pnpm build:packages"],   // was repoSnapshots.buildCommands (image)
    "seed": ["pnpm db:seed"]            // was repoSnapshots.seedCommands
  },
  "apps": [
    {
      "path": "apps/web",               // "" for single-app repos
      "dev": { "command": "pnpm dev", "port": 5173 },
      "startup": ["..."],
      "background": ["cd packages/backend && npx convex dev"],
      "stop": ["..."]                   // non-empty => app gets a seeded snapshot
    }
  ]
}
```

`.eva/mcp.json` (same shape as `.mcp.json`; `${VAR}` resolves from repo/team env vars at launch):

```json
{ "mcpServers": { "sentry": { "type": "http", "url": "https://mcp.sentry.dev/mcp", "headers": { "Authorization": "Bearer ${SENTRY_TOKEN}" } } } }
```

Stays in Convex: `workflowRef`, schedule, env vars, `sandboxConfigFiles`, per-session dev-port overrides, `defaultBaseBranch`, model defaults.

## Design

### 1. One parser, one fingerprint

- New `convex/_evaConfig/schema.ts`: Zod schemas for `config.json` and `mcp.json` (parse at the boundary; no casts). Export `parseEvaSetup(text)` → typed result or a list of readable errors.
- New `convex/_evaConfig/fingerprint.ts`: two djb2 hashes (reuse the existing djb2 body; delete the dead `getSeedFingerprint` / `getImageFingerprint`):
  - `seedFingerprint(app)` = `snapshot.build`, `snapshot.seed`, `app.stop`, `app.background`, config-file keys. Mismatch ⇒ seeded data is wrong.
  - `startupFingerprint(app)` = `app.startup`. Mismatch ⇒ rerun startup only.

### 2. Base-branch cache in Convex (keeps all current readers working)

- Keep the existing `githubRepos` command fields and `repoSnapshots.buildCommands/seedCommands` as a **read cache** of the file on the repo's default branch (`defaultBaseBranch`). Add `githubRepos.configSource: "repo" | "convex"` and `evaConfigSha`.
- Sync on push: extend the `githubWebhook.ts` push handler. When a push to `defaultBaseBranch` touches `.eva/`, schedule `syncEvaConfig(repoId)`. It reads the file through the GitHub contents API, parses it, and patches every sibling app row (matched by `path` ↔ `rootDirectory`). Also run it on connect and in the daily `syncAllRepos` cron.
- Extract the unexported `readFileAtRef` (`_github/prDiff.ts:428-469`) into `_github/contents.ts` and reuse it.
- Parse errors: keep the last good cache, store `evaConfigError`, show it in settings.

### 3. Snapshot build records what it used

- `launchSeedRun` must read `.eva/config.json` from the branch it builds (`git show origin/<branch>:.eva/config.json` in the prep sandbox), not from the cache, because `workflowRef` can differ from `defaultBaseBranch`. Fall back to the cache only while a repo has no file. At capture, `setSeededSnapshotName` also stores `seededFingerprint = seedFingerprint(app)` and new `seededStartupFingerprint`.
- Optional (not v1): skip a rebuild when the fingerprint and lockfile SHAs are unchanged.

### 4. Branch override at sandbox boot

After checkout, in `sessions.ts` / `prepareSandboxSteps.ts`, run `cat .eva/config.json` in the sandbox (reads the real branch, including unpushed commits) and parse it. Then:

| Branch file vs snapshot | Action |
|---|---|
| No file | Use the Convex cache (fallback) |
| Same seed + startup fingerprint | Normal seeded boot |
| Startup fingerprint differs | Seeded boot, `force: true` startup with the branch's commands |
| Seed fingerprint differs | Skip the seeded snapshot; boot the base Image and run full startup with the branch's commands |

- Background and dev commands always come from the branch file, because they run on every boot.
- This needs the file before choosing the snapshot. Read it through the GitHub API at the branch head for the snapshot choice. Use the in-sandbox read for the commands. A tiny race (unpushed edit) only affects the next boot.
- Changes take effect on the next sandbox start. The agent can still use `rerun_startup_commands` / `restart_background_commands` live.

### 5. MCP from `.eva/mcp.json`

- `signAndLaunchScript` (`_sandbox_runtime/helpers.ts`): read the cached `mcp.json` (synced like `config.json`), substitute `${VAR}` from `resolveAllEnvVars`, skip a server with a missing var (warn, do not fail), and pass the servers in launch opts.
- `callback-src/evaMcp.ts`: merge them into the in-memory record. Reserved names `eva`, `linear`, `figma` always win; drop repo entries with those names.
- Claude: set `strictMcpConfig: true` so the repo's `.mcp.json` does not load inside Eva. This ends the clash. Verify Cursor ignores `.cursor/mcp.json` when servers are passed; Codex/OpenCode already take only what Eva gives.
- Rebuild `callbackScript.generated.ts`.
- Branch-local `mcp.json` changes apply on that branch's next agent launch: read `.eva/mcp.json` from the sandbox checkout at launch, fall back to the default-branch cache when absent.

### 6. Settings UI

- `AppClient.tsx` (startup, background, stop, dev command/port) and the build/seed fields in `SnapshotsClient.tsx`: when `configSource === "repo"`, show the values read-only with an "Edit in repo" link to the file on GitHub at `defaultBaseBranch`, plus any `evaConfigError`.
- When `configSource === "convex"`, keep today's editors and add a "Move to repo" action (step 7).
- `McpConfigClient.tsx`: list servers from `mcp.json` read-only.

### 7. Migration

- Internal action `exportEvaConfig(repoId)`: build `config.json` from today's Convex fields (all siblings + snapshot config). Open a PR `eva/move-config-to-repo` through the installation Octokit. Strip the redundant Convex wait loops (`convexLocalBackend` already handles readiness).
- Run it for every connected repo. The "Move to repo" button calls the same action.
- On merge, the webhook sync flips `configSource` to `"repo"`.
- After all repos migrate, remove the Convex fallback: delete the edit paths (`updateConfig` command fields, `setRepoCommandsInternal`, `saveRepoSnapshot` command fields), the "Move to repo" action and the `configSource === "convex"` branches. Keep the fields only as cache. A repo with no `.eva/config.json` then shows the "Set up with Eva" button.

### 8. `eva-setup` system skill

- Add `eva-setup` to `_systemSkills/registry.ts`. Make it always available (no opt-in), because every repo needs it.
- The skill tells the agent to:
  1. Detect the package manager, apps (`detectAppsForRepo`), services and DB.
  2. Write `.eva/config.json` and `.eva/mcp.json`. Convert any `.mcp.json` / `.cursor/mcp.json` servers to `${VAR}` form and leave out `eva`.
  3. Call `request_env_var` for each missing secret.
  4. Run the commands and prove the dev server answers on its port.
  5. Commit. Eva opens the PR.
- Trigger: a "Set up with Eva" button, shown when the repo has no `.eva/config.json` (or `evaConfigError` is set). It starts a session on the default branch with the skill invoked. Placement: (1) a card above the New Session composer on the repo home (`routes/_repo/$owner/$repo/index.tsx` → `NewSessionComposer`), shown only while the file is missing or invalid; (2) the App settings page, in place of the read-only commands when the file is missing.

### Deferred (note only)

- Untrusted PRs could change `.eva/` commands that run with secrets. Later: only trust the file from trusted branches, or ask before running changed commands.

## Steps

1. `_evaConfig` schema + parser + fingerprints; delete the dead fingerprint code. Unit tests (parse errors, path matching, fingerprint stability).
2. `_github/contents.ts` (`readFileAtRef`), `syncEvaConfig`, webhook + connect + cron triggers, `configSource`/`evaConfigSha`/`evaConfigError` fields.
3. Snapshot build stores both fingerprints.
4. Boot-time branch override (sessions, tasks, projects, `prepareSandboxSteps`).
5. `.eva/mcp.json` launch merge + `strictMcpConfig`; rebuild callback script.
6. Settings UI read-only mode + "Move to repo".
7. `exportEvaConfig` migration action; run it for Eva's own repo first, then carepulse-ts.
8. `eva-setup` system skill + trigger.
9. `npx convex codegen --typecheck enable`, vitest, web `tsc`; `/changelog`.
10. `/ship`.

## Decided (2026-10-16)

- Setup trigger: a "Set up with Eva" button, not an auto-start.
- Cache source: the repo's default branch (`defaultBaseBranch`).
- Convex fallback: remove it after all repos migrate.
- File name: `.eva/config.json`.
- Branch `mcp.json` edits apply on that branch's next agent launch.
- Setup button: card above the New Session composer + App settings page.
- Snapshots build from `defaultBaseBranch`; delete `repoSnapshots.workflowRef` and its Snapshots-page field.

## Unresolved questions

None.

## Implementation notes (2026-10-16)

Built in PR #977. Differences from the plan above:

- **MCP:** the sandbox callback reads `.eva/mcp.json` straight from the checkout (`callback-src/evaMcp.ts`), so branch edits apply on the next agent launch with no backend read. Convex only caches server summaries for the settings page. http and stdio servers both work.
- **Startup rerun:** the marker file `/tmp/.startup-commands-done` now holds the startup fingerprint (`_sandbox_runtime/startupMarker.ts`). A mismatch reruns startup on any surface; an empty legacy marker still counts as done.
- **Review fixes:** apps can carry their own `snapshot` block (carepulse-ts has different seed commands per app); app rows the file does not list stay Convex-managed; the sync is best-effort; the seed fingerprint is read at seed launch; `strictMcpConfig` applies only when `.eva/mcp.json` exists; SSE servers keep their transport.
- **Seed mismatch:** `resolveSandboxContext` reads the branch file through the GitHub API and boots the base Image when the seed fingerprint differs. Seed commands do not run on that boot (they are build-only); the agent must seed by hand. Follow-up if this matters.
- **Dev command/port** still come from the default-branch cache, not the session branch. Follow-up.
- **Migration:** no PR-opening action. The `eva-setup` skill receives a draft built from today's Convex commands and writes the file itself; the same button serves new and existing repos.
- **Inline secrets:** prod seed commands hold deploy keys, a service-role key and a DB password inline. The skill tells the agent to replace them with `$VAR` and request the env vars. These keys should also be rotated, because they have sat in Convex in plain text.
- **Snapshot branch:** carepulse-ts snapshots move from `staging` to `main` (its default branch).
- **Eva's own `.eva/config.json`** is not in this PR: its seed command needs a deploy key moved into a repo env var first. Run "Set up with Eva" on this repo after merge.
- **Convex fallback removal** (unresolved decision: remove after all repos migrate) is not done yet.
