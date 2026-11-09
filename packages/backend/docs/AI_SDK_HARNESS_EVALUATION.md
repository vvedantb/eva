# AI SDK Harness Layer: Migration Evaluation

Last reviewed: 07 October 2026. Figures are from npm and ai-sdk.dev on 06–07 October 2026.

## Verdict

Migration is possible, now and later. It is not worth it yet. The cost is high and the net code saving is small.

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
4. **Maturity.** Docs still mark harness packages experimental. `@ai-sdk/harness` had 170 releases from 04 June to 05 October 2026 (38 in September).

## Code size: what would actually change

Sandbox runtime (`packages/backend/callback-src`) is about 20,000 lines in total, but most of it stays.

| Area | Lines (approx.) | With the harness |
|---|---|---|
| Per-agent code (Claude, Codex, Cursor, OpenCode) | 8,500 | Mostly replaced |
| Event parsing into chat UI | 1,900 | Partly replaced |
| Runtime core (heartbeats, lease, usage, questions, media, git) | 3,200 | Stays |
| Entry, config, Convex client, Eva MCP | 2,150 | Mostly stays |
| Tests | 4,500 | Mostly rewritten |

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
