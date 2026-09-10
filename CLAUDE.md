FOLLOW ALL OF THESE RULES

## Git / ship

- NEVER create a new branch, push, or open a PR unless the user asks.
- If already on main and the user asks to ship: commit and push directly to main.
- Prefer `/preflight` occasionally over husky commit/push gates (hooks under `.husky/` are commented out).
- Plans: final step is `/ship` unless the user says not to.

## Always

- Greenfield OK — breaking changes fine.
- Implementing from an agreed plan: just implement.
- Think first; simplest solution wins. Ask when unsure / ambiguous — as many questions as needed.
- Prefer a detailed plan over a quick one. Plan mode: concise plans; list unresolved questions; use `grill-me` / AskUserQuestion to interview until shared understanding.
- Explain changes when done. Check web/docs when needed.
- Only edit this file when the user explicitly asks. Entries: 1 sentence (~20 words max), not changelog paragraphs.
- No `any`, `unknown`, `as`, or non-null `!`. No `isRecord(object: unknown)` — parse at the boundary (Zod). Hard types → rethink design.
- Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions. No new deps unless necessary.
- Do not default to `useState`/`useRef` — pick the right state ownership first.
- useCallback and useMemo are banned as React Compiler is enabled
- useEffect is banned as it introduces performance regressions
- Do not run dev / lint / build unless the user asks.
- After medium+ changes: no banned types; `tsc` where relevant; `/changelog` (or `internal/changelog.md`).
- Eliminate duplication, centralise your changes so its easier to update them
- For debugging, use Eva MCP and Convex CLI for prod logs


## Domain docs (read when relevant)

- Frontend / UI work → `docs/eva-ui.md` (tone-based surfaces, no decorative hairlines; components, router, vite, nuqs)
- Convex / schema / migrations → `docs/eva-convex.md`
- agent-browser on eva app → navigate to `/?agent` to auto sign in as the agent user

## Product facts

- This repo is a platform for managing other codebases and running them remotely (sandbox app ≠ this codebase).
- Sandbox provider is Vercel; Daytona is legacy. Sandboxes: IPv4 only (no IPv6).
- Chat is one surface: sessions, quick tasks and projects share `ChatBody`/`SandboxChatPreInput`; ship chat changes to all three panels and workflow modules.

Fight entropy. Leave the codebase better than you found it.
