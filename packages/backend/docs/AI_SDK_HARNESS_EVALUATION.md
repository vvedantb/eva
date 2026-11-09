# AI SDK Harness Layer: Migration Evaluation

Last reviewed: 09 November 2026. Figures are from npm, ai-sdk.dev and `origin/main` on 09 November 2026 unless a section says otherwise.

## Verdict

Migration is possible, now and later. It is not worth it yet. The cost is high and the net code saving is small.

## Review history

| Date | Verdict | What changed |
|---|---|---|
| 07 October 2026 | Not yet | First full review. |
| 09 November 2026 | Not yet | `@ai-sdk/harness` 1.0.177, 208 releases (33 in October), still experimental. Adapters gained image input (all ✓). OpenCode filtering is now native. fx moved to host process. Tool approval for Codex, Cursor, Grok Build and Copilot is still ✗. History access is still ✗ for every adapter. No new Vercel changelog entries about the harness. Our runtime grew to about 24,900 lines; most growth is Eva-specific core and tests, so the share the harness can replace went down. Credential brokering is still not adopted. |

## What the harness layer is

- `HarnessAgent` (`@ai-sdk/harness`) runs coding agents through one API: Claude Code, Codex, Cursor (via ACP), OpenCode, Cline, Pi, Grok Build, GitHub Copilot, fx, Deep Agents.
- Adapters run a bridge in a Vercel Sandbox and stream events to a **host process** over a WebSocket for the whole turn.
- Auth modes: `auto`, `direct`, `ai-gateway`. Native subscriptions are read from the host machine when no explicit credential is set.
- `@ai-sdk/workflow-harness` runs turns in Workflow DevKit steps: 750-second time slices or one step per agent step, with `suspendTurn` / `continueFrom`.

## Why not now

1. **Architecture.** Eva runs the agent loop inside the sandbox and talks to Convex by short HTTP calls, because Convex actions stop after about 10 minutes. The harness needs a long-lived host process. We would need a new host service.
2. **Feature gaps the adapters cannot close for us:**
   - No adapter has history access.
   - Codex, Cursor, Grok Build and GitHub Copilot have no built-in tool approval.
   - Cursor (ACP v1) has no per-step usage and no structured output.
3. **Features we would rebuild on top:** blocking AskUserQuestion, subagent-nested tool steps and todo lists, raw usage and cost capture, usage-limit capture, Eva MCP injection, warm daemon with turn claiming, turn lease and heartbeats, media capture.
4. **Maturity.** Docs still mark harness packages experimental. `@ai-sdk/harness` had 208 releases from 04 June to 09 November 2026 (38 in September, 33 in October).

## Code size: what would actually change

Sandbox runtime (`packages/backend/callback-src`) is about 24,900 lines in total, but most of it stays.

| Area | Lines, 07 Oct 2026 | Lines, 09 Nov 2026 | With the harness |
|---|---|---|---|
| Per-agent code (`providers/`, `session/`) | 8,500 | 8,600 | Mostly replaced |
| Event parsing into chat UI (`parse/`) | 1,900 | 2,150 | Partly replaced |
| Runtime core (`runtime/`: heartbeats, lease, usage, questions, media, git, queue, steer) | 3,200 | 4,350 | Stays |
| Entry, config, Convex client, Eva MCP | 2,150 | about 1,900 | Mostly stays |
| Tests | 4,500 | 7,950 | Mostly rewritten |

The November figures are line counts of `.ts` files per folder on `origin/main`. The "entry" row is the remainder, so it is an estimate.

- Removed: about 8,000–10,000 lines.
- Added: host service, plus rebuilt questions, usage capture and Cursor cost tracking.
- Net: a few thousand lines at most. The main gain is less code per agent, not a large overall cut.

## Revisit when

1. Harness packages drop the experimental label and releases slow down.
2. Adapters support tool approval, history access and per-turn usage for every agent we run.
3. We want several new agents (GitHub Copilot, Grok Build, Cline). This is the strongest reason, because each new agent is almost free.
4. We add a long-lived host tier for another reason. That removes the main architecture blocker.

Middle path: keep our runtime for the current four agents and use the harness only for new agents. This still needs the host service, so it makes sense only with trigger 3.

## Do this independently: credential brokering

- Today the raw `CLAUDE_CODE_OAUTH_TOKEN` is in the sandbox env and Codex `auth.json` is on sandbox disk. Anything in the sandbox can read them.
- Vercel Sandbox firewall rules (`networkPolicy` with `transform.headers`) inject the real token on egress. The sandbox holds only a placeholder. This is how the harness does it, and it needs only `@vercel/sandbox`, which we already use.
- Spike: placeholder env var, transform rule for the Anthropic API host, confirm Claude Code OAuth and plan-usage reads work. Codex is harder because the host must own token refresh.

## How to re-check

1. `npm view @ai-sdk/harness version` and the release history (`npm view @ai-sdk/harness time --json`).
2. Read the capability table at https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters.
3. Check whether https://ai-sdk.dev/docs/ai-sdk-harnesses/overview still says "experimental".
4. Check the Vercel changelog for harness and Sandbox entries.

## Sources

- https://ai-sdk.dev/docs/ai-sdk-harnesses/overview
- https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-agent
- https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters
- https://ai-sdk.dev/docs/ai-sdk-harnesses/workflow-utilities
- https://ai-sdk.dev/providers/ai-sdk-harnesses/cursor
- https://vercel.com/changelog/cursor-ai-sdk-harness-adapter
- https://vercel.com/docs/sandbox/concepts/firewall
- https://vercel.com/changelog/safely-inject-credentials-in-http-headers-with-vercel-sandbox
