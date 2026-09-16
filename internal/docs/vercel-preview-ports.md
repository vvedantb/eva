# Vercel Preview ports (proxy, Supabase, forced listen)

Last updated: 2026-07-22

How Eva serves the Preview iframe on Vercel sandboxes, why the UI port field is not the public URL, and how CarePulse web + eprocurement both work with local Supabase.

## TL;DR

| Role                                | Port                                       |
| ----------------------------------- | ------------------------------------------ |
| **Public Preview URL** (auth proxy) | always **3000**                            |
| **Local Supabase Kong**             | **54321** (must stay free for Eva’s proxy) |
| **Editor / Desktop proxies**        | 8080 / 6080                                |
| **App listen (UI port ≠ 3000)**     | UI port as-is (e.g. **3001**, **5173**)    |
| **App listen (UI port = 3000)**     | **13000** (proxy owns 3000)                |

Eva launches the app with `pnpm|yarn|npm exec next|vite … -p <listen>` inside the sandbox. Customer `package.json` is **not** edited; hardcoded `next dev -p 3001` is bypassed because Eva does not run `pnpm run dev` for Console launch on Vercel.

## Constraints

Vercel sandboxes expose at most **4** ports. Eva’s fixed set:

```
[3000, 8080, 6080, 54321]
```

- App processes can listen on **any** internal port; only the public proxy needs an exposed slot.
- `sandbox.domain(5173)` / `domain(3001)` fails if that port is not in the expose list — so Preview must go through a fixed exposed proxy port.
- Local Supabase (CarePulse `pnpm start-db`) binds Kong on **54321**.

## What the Preview port input means

In the UI (`?port=` / repo `devPort` / session `devPort`, default 3000):

- **Means:** where the app should listen / what we probe for readiness / grant “logical” port for UX.
- **Does not mean:** the hostname port on `*.vercel.run` for the iframe.

On Vercel app Preview, `getPreviewUrl` always mints the public URL on **3000** (`VERCEL_PREVIEW_PROXY_PORT`) and starts the in-sandbox auth proxy there, forwarding to the listen port.

## Why CarePulse web failed and eprocurement worked

Same monorepo, different app repos:

| Surface                 | App                 | UI port | Background            | Who owned 54321 (old design)          |
| ----------------------- | ------------------- | ------- | --------------------- | ------------------------------------- |
| Session Preview         | `apps/web`          | 3000    | Supabase + Convex + … | **Kong** → iframe: `no Route matched` |
| Project sandbox Preview | `apps/eprocurement` | 3001    | Convex only           | Eva proxy → worked                    |

Symptom on web: Preview looked like Supabase/Kong (`no Route matched with those values`), not a Next crash. Next was often fine on 3000/3001; the **public** URL was wrong.

## Failed / reverted approaches (do not revive blindly)

### 1. Proxy on 54321, app on UI port (pre-2026-07-21 default)

Works until any sandbox starts Supabase. Then Kong wins 54321 and Preview breaks.

### 2. Proxy on UI port, app on port+10000 (2026-07-21 remap)

- Public proxy on 3000/3001/5173; listen on +10000; 54321 for Supabase.
- Broke CarePulse: `package.json` had `next dev -p 3001`, which **ignores** `PORT=13001`.
- Preview remount heal + Console dual-launched Next → `EADDRINUSE`.
- Attempted `pnpm run dev -- -p 13001` → Next saw `next dev -p 3001 -- -p 13001` → invalid project directory.
- **Reverted** 2026-07-22 so hardcoded `-p` repos worked again (Supabase conflict returned).

### 3. Current design (2026-07-22)

- Public proxy **always 3000** (always in the 4-slot set).
- **54321 left for Supabase**.
- Listen: `3000 → 13000`, else UI port.
- Launch: **Eva-owned** `exec next|vite -p <listen>` (not `pnpm run dev`).
- Preview polls on Vercel stay **probe-only** (no background remount dual-launch); Console / lifecycle owns the single launcher.

## Current behaviour (detail)

### Listen port

`vercelAppListenPort(logical)` in `packages/backend/convex/_daytona/vercelAppPorts.ts`:

- `3000` → `13000`
- `3001`, `5173`, … → same as logical
- Reserved public slots (`6080`, `8080`, `54321`) → `13000` (should not be used as app UI ports)

### Console launch

`resolveVercelConsoleDevCommand` → `launchDevServerInVercelConsole`:

1. Detect Next vs Vite from `package.json` deps under `rootDirectory`.
2. Detect package manager (pnpm/yarn/npm).
3. Run e.g.  
   `cd <root> && HOSTNAME=0.0.0.0 PORT=<listen> pnpm exec next dev -H 0.0.0.0 -p <listen>`  
   (npm uses `npx --yes next …`; Vite uses `--host` / `--port`).
4. Unknown framework: fall back to rewriting `PORT=` on the existing session `devCommand`.

No customer repo changes. Custom Eva `devCommand` overrides still fall back to PORT rewrite if framework detection fails.

### getPreviewUrl

`packages/backend/convex/_daytona/execution.ts`:

- Probe / proxy upstream = listen port (not 3000).
- Fixed Vercel app proxy port = `3000`.
- Desktop/editor unchanged: public 6080/8080 → internal 16080/18080.
- Grant + `authPort` use the **public** proxy port on Vercel so `/preview-auth` aligns with the iframe host.
- Vercel: do **not** `launchDevServerInBackground` from Preview poll (Console is sole launcher).

### Custom tabs: `/__tab/<port>`

User-defined tabs (Supabase Studio on 54323, a mail catcher, …) listen on ports Vercel never exposes, and the one public slot is already the app's auth proxy. Each tab therefore rides that same proxy: `getPreviewUrl({ port, customTabPort })` ensures the proxy on the **app's** target (so Preview and tabs cannot clobber each other) and returns a URL whose path is `/__tab/<customTabPort>/`. The proxy forwards that prefix to `127.0.0.1:<customTabPort>`.

For tab routes the proxy also rewrites `Location` headers and root-relative `href`/`src`/`action`/`srcset` back under the prefix, and falls back to the `Referer` for root-absolute asset requests (Next.js `/_next/…`). Tab routes never get the nav-sync/annotation injection. Readiness for a tab probes the tab's own port and never heals or restarts the dev server.

### Expose list

`VERCEL_DEFAULT_EXPOSED_PORTS = [3000, 8080, 6080, 54321]` in `vercelProvider.ts`. Unchanged by UI port.

## Examples

### CarePulse web (UI port 3000 + Supabase)

```
Browser → *.vercel.run:3000 (Eva auth proxy)
                ↓
         Next on 127.0.0.1:13000
Kong on 54321 (backgroundCommands) — unaffected
```

### CarePulse eprocurement (UI port 3001, no Supabase)

```
Browser → *.vercel.run:3000 (Eva auth proxy)
                ↓
         Next on 127.0.0.1:3001
```

UI still shows 3001; iframe public port is 3000. That is expected.

## Operational notes

- After port-map deploys, **Stop → Start** (or Retry) existing sandboxes so Console relaunches with the forced listen command and proxy rebinds on 3000.
- If Preview shows Kong again, something else took 3000 or the proxy failed to start while 54321 is still being used as the public URL (old code). Check deploy version and sandbox restart.
- If Console shows `EADDRINUSE`, look for dual launch (Preview heal + Console). Heal must stay probe-only on Vercel.
- Do **not** “fix” customer apps by editing their `package.json` ports; fix Eva’s launcher.

## Key code

| File                                                             | Role                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/backend/convex/_daytona/vercelAppPorts.ts`             | Listen/public constants, framework detect, forced `exec` command |
| `packages/backend/convex/_daytona/previewProxy.ts`               | Auth proxy script; re-exports `VERCEL_PREVIEW_PROXY_PORT`        |
| `packages/backend/convex/_daytona/execution.ts`                  | `getPreviewUrl` probe + proxy + grant                            |
| `packages/backend/convex/_daytona/sessions.ts`                   | `launchPreviewDevServer` → Console with resolved listen command  |
| `packages/backend/convex/_pty/launchDevServerInVercelConsole.ts` | tmux Console runner                                              |
| `packages/backend/convex/_sandbox/vercelProvider.ts`             | Fixed expose list                                                |
| `packages/backend/tests/vercelAppPreviewPorts.test.ts`           | Unit tests for listen + forced command                           |
| `packages/backend/docs/ARCHITECTURE.md`                          | One-line constraint summary                                      |

## Related history (changelog)

- 2026-07-21 — Remap proxy onto UI port / listen +10000 (later caused CarePulse `-p` / dual-launch pain).
- 2026-07-21 — Stop Vercel Preview dual-launching Next on resume (probe-only).
- 2026-07-22 — Revert remap (proxy back on 54321).
- 2026-07-22 — Proxy on 3000; leave 54321 for Supabase; forced `exec next|vite -p`.
