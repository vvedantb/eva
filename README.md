# Eva

> Plan, build, verify, and ship changes to your repositories with AI agents running in cloud sandboxes

**Fully open source** under the [MIT License](LICENSE).

Agents get a real dev environment: cloud VM with your repository cloned, dependencies installed, and a running dev server. They can run shell commands, execute tests, build the app, drive a real browser, and open pull requests with proof.

Work runs remotely and in parallel. Start several changes at once, review when they finish.

## Quick start

1. Connect a GitHub repository
2. Build a sandbox snapshot for fast startup
3. Start a session or run a quick task
4. Review the diff and preview, open a PR

## Features

### Plan

- **Documents** — collaborative PRDs and specs, real-time editing. Agents read them during tasks.
- **Projects** — kanban, timeline, list, and table views. Multi-task work with build pipelines.

### Build

- **Sessions** — live sandbox with preview, terminal, file tree, editor, PR diffs, and agent-controlled browser.
- **Quick Tasks** — self-contained changes in parallel. Kanban, table, split-list views with filters and bulk actions.
- **Designs** — chat-driven UI generation with reusable personas (development-only).

### Verify

- **Reviews** — PR hub with live GitHub metadata, diffs, and AI recap (posted as sticky comment).
- **Testing Arena** — evaluate codebase against document requirements, get severity-ranked gaps.
- **Audits** — configurable review categories appended to PRs. Fix findings automatically.
- **Proof** — screenshots and video of running app shipped with PRs.

### Operate

- **Automations** — scheduled agent runs per cron. Report-only or auto-fix modes.
- **Snapshots** — prebuilt sandbox images with OS, tooling, agent CLIs, dependencies, seeded database.
- **Skills** — agent skills synced from `.agents/skills` on push and every 6 hours.
- **Stats** — PRs shipped, session funnel, activity heatmap, contributor leaderboard.
- **Inbox** — in-app notifications plus optional daily digest and weekly changelog email.
- **Teams** — workspaces with members, roles, environment variables, branding.
- **Monorepos** — each app is a workspace; shared automations, snapshots, variables, recaps.

## Architecture

```
GitHub repository
        │
        ▼
      Eva  ──────────────────────────────┐
        │                                │
        ▼                                ▼
Cloud sandbox                      Eva MCP server
(Vercel Sandbox)                   (agents call back in)
        │
        ▼
Agent CLI (Claude Code, Codex, Cursor)
        │
        ▼
Diff → draft PR → PR recap → preview URL
```

## Tech stack

- **Frontend**: Vite, TanStack Router, React 19, Tailwind CSS
- **Backend**: Convex (workflows, crons, presence, prosemirror-sync, action-cache)
- **Sandboxes**: Vercel Sandbox
- **Auth**: Clerk
- **Email**: SendGrid

## Self-hosting

Eva is self-hosted. No managed cloud version. You control your data and infrastructure.

### Prerequisites

- Node.js 20+
- pnpm 10
- Convex account
- Clerk account
- Vercel account with Sandbox API access
- GitHub account (for GitHub App)

### Setup

**1. Clone and install**

```bash
git clone https://github.com/your-org/eva.git && cd eva && pnpm install
```

**2. Set up Convex**

```bash
pnpm convex
```

Follow prompts to create or link a project. Note your deployment URL.

**3. Set up Clerk**

1. Create app at [clerk.com](https://clerk.com)
2. Note **Publishable Key** (starts with `pk_`)
3. Note **JWT Issuer Domain** from JWT Templates

**4. Create GitHub App**

1. Go to **GitHub Settings → Developer settings → GitHub Apps → New GitHub App**
2. **Name**: `Eva (your-org)`
3. **Homepage URL**: your Eva instance URL
4. **Webhook URL**: `https://your-deployment.convex.site/api/github/webhook`
5. **Webhook secret**: generate random string for `GITHUB_WEBHOOK_SECRET`
6. **Repository permissions**: Contents (read+write), Pull requests (read+write), Issues (read+write), Metadata (read-only)
7. **Events**: Push, Pull request, Installation
8. After creation, note: **App ID**, **Client ID**, **App slug** (`github.com/apps/<slug>`)
9. Generate: **Client secret**, **Private key** (.pem file)
10. Install the app on your account/org
11. Get bot user ID:
    ```bash
    curl -s https://api.github.com/users/<slug>\[bot\] | jq .id
    ```

**5. Generate encryption keys**

```bash
openssl rand -hex 32  # Run twice for ENCRYPTION_KEY and EVA_DEPLOY_KEY
openssl ecparam -genkey -name prime256v1 -noout -out private.pem
openssl ec -in private.pem -pubout -out public.pem
```

Convert to JWK format using `jose` CLI. Use full JWK (with `d` parameter) for `SANDBOX_JWT_PRIVATE_KEY`, and public-only JWKS for `SANDBOX_JWT_JWKS`.

**6. Web app environment** (`apps/web/.env.local`)

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Optional. Set to "true" for the full marketing page on `/`.
# Anything else, including unset, gets the compact one-screen version.
VITE_NEW_LANDING=false
```

**7. Convex environment** (run from `packages/backend`)

```bash
npx convex env set VAR value
```

**Required:**

- `CLERK_JWT_ISSUER_DOMAIN` — Clerk JWT issuer
- `ENCRYPTION_KEY` — 64-char hex from Step 5
- `EVA_DEPLOY_KEY` — 64-char hex from Step 5
- `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_BOT_USER_ID`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
- `WEB_APP_URL` — public URL of your Eva instance

**Optional:**

- `SANDBOX_JWT_PRIVATE_KEY`, `SANDBOX_JWT_JWKS` — sandbox authentication
- `PREVIEW_GRANT_PRIVATE_KEY` — short-lived preview URLs
- `MCP_JWT_SECRET`, `MCP_INTERNAL_SECRET` — MCP
- `CLERK_SECRET_KEY` — MCP server
- `SENDGRID_API_KEY` — email
- `EMAIL_ENV` — email routing
- `EXTENSION_ADMIN_KEY`, `EXTENSION_ID` — Chrome extension updates
- `SANDBOX_VERCEL_VCPUS` — vCPU count for sandboxes
- `TASK_PROOF_CAPTURE_ENABLED` — screenshot/video capture

**8. Add sandbox credentials** (Team Settings → Environment Variables)

```
VERCEL_TOKEN
VERCEL_TEAM_ID
VERCEL_PROJECT_ID  # Set per repository, not borrowed from siblings
```

**9. Run**

```bash
pnpm convex   # Backend
pnpm dev      # Frontend
```

Open `http://localhost:5173`.

Deploy with `pnpm convex:deploy` (runs `build:callback` first, bundles in-sandbox runtime).

## MCP

Eva is both an MCP server and client.

**Outward** — external MCP clients (Claude Desktop) connect over OAuth 2.1. ~25 tools exposed: read-only queries against Convex/Postgres, task creation, document access, PR recaps, artifact hosting, media upload, shared browser control.

**Inward** — every sandbox launches Eva as an MCP server, so agents can call back mid-task (read documents, create tasks, ask questions).

**Artifacts** — self-contained HTML dashboards hosted by Eva, rendered in sandboxed iframe, query live data via MCP tools.

**Config** — set root prompt under **Settings → MCP Config**.

**Database access** — connect repository's Convex URL or Postgres read-replica in environment variables. Postgres: read-only, one statement per call, 30-second timeout, size capped.

## Sandbox snapshots

Agents boot from prebuilt snapshots bundling OS, tooling, agent CLIs, dependencies, cloned repo, and optional database seed.

**How it works** (from `packages/backend/convex/snapshotActions.ts`):

1. Boot seed-prep sandbox, install tooling
2. Clone repo at configured branch, run `pnpm install`
3. Run configured build and seed commands
4. Capture filesystem into snapshot (`snap_*`)

Build is split into phases (Convex 10-min action ceiling). Normally finishes in ~6 minutes; can take 40+ minutes if builder fleet is degraded.

**Rebuild** — **Settings → Snapshots → Rebuild Now**, or set **Schedule** cron. Configure branch, **Build Commands**, and **Config Files** (upload database seeds, etc).

**Fallback** — missing/error snapshot falls back to bare sandbox + fresh clone + tooling install (slower first run).

**What's included:**

- Base: `node24`, pnpm, Node tooling
- System: git, git-lfs, curl, jq, ripgrep, fd, gh CLI, sudo, ffmpeg
- Desktop: TigerVNC, noVNC, websockify, Google Chrome
- Docker Engine (nested containers like `supabase start`)
- Agent CLIs: Claude Code, Codex, opencode, Cursor
- Other: agent-browser, Convex CLI, Supabase CLI 2.90.0, agentation-mcp, Claude Agent SDK, code-server

Edit `launchSeedRun` in `packages/backend/convex/snapshotActions.ts` to change base tooling. Prefer **Build Commands** for project-specific needs.

**Rebuild when:**

- Dependencies change significantly (major package update)
- Base tooling changes (Node.js, system package)
- Want fresher code or seed data

## Agent browser

Screenshots and video require `agent-browser` skill installed in target codebase.

## Authentication in previews

Preview URLs may fail if auth provider blocks frame ancestors (e.g., AuthKit).

**Options:**

1. **Open preview in new tab**
2. **Allowlist sandbox domain** in auth provider's allowed origins/callback URLs
3. **Implement backend login path** that works in iframes, document in `CLAUDE.md`

Standard iframe security. Not Eva-specific.

## Repository layout

| Package                 | Name                   | Description                                            |
| ----------------------- | ---------------------- | ------------------------------------------------------ |
| `apps/web`              | `@eva/web`             | Dashboard: repos, sessions, tasks, settings            |
| `apps/chrome-extension` | `eva-assist-extension` | On-page toolbar to annotate apps and file tasks        |
| `packages/backend`      | `@eva/backend`         | Convex backend, workflows, in-sandbox callback runtime |
| `packages/shared`       | `@eva/shared`          | Shared constants and types                             |
| `packages/ui`           | `@eva/ui`              | Shared component library                               |

## Sandbox code

| Path                                    | Role                                                              |
| --------------------------------------- | ----------------------------------------------------------------- |
| `convex/_sandbox/`                      | Sandbox contract and implementation                               |
| `convex/_sandbox_runtime/`              | Orchestration: launch, git, sessions, exec, proof, desktop, proxy |
| `convex/sandbox.ts`, `sandboxDaemon.ts` | Public action entrypoints (`internal.sandbox.*`)                  |
| `convex/_pty/vercel.ts`                 | Terminals (tmux over Vercel's `openInteractive` WebSocket)        |

Terminals, desktop, computer use all work. Vercel exposes client-connect WebSocket (not push-callback), so terminals dispatched from `convex/pty.ts` outside sandbox contract. Desktop: TigerVNC + noVNC.

No named volumes: Vercel Drives still beta. Session state persists via snapshots.

## Development

- **Typecheck Convex** (no dev server): `cd packages/backend && npx convex codegen --typecheck enable`
- **Lint**: `pnpm lint` (oxlint)
- **Dead code**: `pnpm deadcode` (knip)
- **Chrome extension**: `pnpm ext:dev`, `pnpm ext:build`, `pnpm ext:release`
- **Note**: `schemaValidation` disabled in `packages/backend/convex/schema.ts` for development convenience

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CLAUDE.md](CLAUDE.md) for conventions.

## Roadmap

- Named volumes for session persistence (Vercel Drives beta → stable)
- Release Designs to production
- Improved project interview experience

## Credits

Parts of Eva's session chat, diffs, model picker, and agent UX are adapted from [T3 Code](https://github.com/pingdotgg/t3code) by [Ping Labs](https://t3.codes) / Theo Browne. Thank you for open-sourcing it.
