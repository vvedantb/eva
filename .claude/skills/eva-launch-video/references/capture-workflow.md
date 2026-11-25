# Capturing footage with agent-browser

Drive the real eva app and screenshot it. Goal: crisp, readable, **zoomed-in** screens at a
1280×720 layout, saved to `video/public/captures/`.

## 1. Start the app

From the repo root:

```bash
pnpm dev          # Vite web app → http://localhost:5173
```

You do **not** need `npx convex dev` — the web app talks to the already-deployed Convex
deployment, and the agent auto-login is a Vite middleware. It needs `CLERK_SECRET_KEY` and
`AGENT_CLERK_USER_ID` set in `apps/web/.env.local` (they normally are).

Check it's up: `netstat -ano -p tcp | grep ':5173'`.

## 2. Sign in as the agent user (at the right viewport)

```bash
agent-browser close                       # clear any stale session first
agent-browser open "http://localhost:5173/?agent=true"
agent-browser set viewport 1280 720       # CRITICAL: capture at the frame's native layout
agent-browser set media dark
agent-browser open "http://localhost:5173/?agent=true"
agent-browser wait --load networkidle
agent-browser wait 5000
agent-browser get url                     # expect .../home
```

**Gotchas:**

- The URL must be `?agent=true` (boolean). `/?agent` (no value) throws a `SearchParamError`
  ("Expected boolean, received string") and you land on an error boundary.
- If it sticks on `/agent-callback?ticket=…` showing "Signing in…", check
  `agent-browser console` — `You're already signed in` means the session is fine; just
  navigate straight to your target page (e.g. `…/home` or a repo page).
- For retina-crisp captures you _can_ launch with `--args "--force-device-scale-factor=2"`
  (gives 2560×1440 of a 1280 layout), but it only applies on a fresh browser launch. Plain
  1280×720 shown 1:1 is already crisp enough.

## 3. Navigate by URL and screenshot

Use the user's own repo `vvedantb/eva` (web app). Navigate by URL — it's deterministic:

```bash
agent-browser open "http://localhost:5173/vvedantb/eva/web/quick-tasks"
agent-browser wait --load networkidle && agent-browser wait 2500
agent-browser screenshot /abs/path/eva/video/public/captures/board.png
```

Re-`snapshot -i` after every navigation/DOM change — refs (`@e1`) are invalidated. Debug with
`agent-browser console` and `agent-browser errors`.

### The default hero screens and where they live

| capture file     | what / how to get it                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `board.png`      | `…/quick-tasks` — the kanban board (To Do → Merged).                                                                           |
| `task-input.png` | `…/quick-tasks` → click **New Task** → fill title + description. Keep the cursor near **Create Task** for the click beat.      |
| `agent-work.png` | open a **merged** task `…/quick-tasks/<id>/activity`, expand a `success` run to reveal "Cooked N times" + the agent's summary. |
| `ship.png`       | same merged task, top of `/activity` — shows the status rail (Merged ✓ / Deployed ✓ / View PR).                                |
| `projects.png`   | `…/projects` — the projects board.                                                                                             |

Finding a merged task: on `/quick-tasks`, dump `agent-browser snapshot -c` and look under the
"Merged" column; pick one with a clear, visual title. Open it, then expand its run.

Filling the New Task modal:

```bash
agent-browser click @<NewTaskRef>
agent-browser fill @<titleRef> "Add a dark mode toggle to the settings page"
agent-browser click @<descRef>
agent-browser keyboard type "Let users switch themes from the settings page — instantly, no reload."
agent-browser screenshot .../captures/task-input.png
```

## 4. Footage strategy: finished states, staged inputs

- **Outputs** (agent work, diff, merged/deployed, PR) → record _existing completed_ tasks. Live
  agent runs need a running sandbox (slow, flaky) — don't wait on them.
- **Inputs** (describe a task) → stage a clean, relatable prompt yourself (e.g. "Add a dark mode
  toggle"). It reads better than real, messy task titles.
- **Stage inputs, never submit them.** Type the prompt, open the mention/model picker, then
  screenshot. Do not press Enter in a composer or click send / Create / Save / Run / Start — that
  starts a real session in the user's workspace. Enter is fine only for accepting an `@`-mention
  from an open picker; when in doubt, click the picker row.
- Live previews/terminals need a _running_ sandbox; the persisted diff/PR/status is enough to
  tell the story. Captions narrate the flow; the screens prove it's real.

## 5. Confidentiality (before anything goes public)

- Use `vvedantb/eva` (the team's own repo). **Never** feature client repos
  (`evalucom/carepulse`, `eprocurement`) or the home "Codebases" screen that lists them.
- **Names and emails on screen are a settled non-issue.** Settings → Experimental has a blur-PID
  toggle that blurs every `[data-pii]` element, so the product handles it. Do not flag names or
  emails, do not offer to mask or crop them, and do not caveat the handover with them.
- Still worth flagging: error panels that leak env var names or project ids.
