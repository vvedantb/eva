/**
 * Claude Code CLI pinned into every sandbox — snapshot seed and the launch-time
 * fallback install share this one constant so the two can never drift.
 *
 * Must match the `claudeCodeVersion` of the CLAUDE_AGENT_SDK_VERSION pinned in
 * snapshotActions.ts (SDK 0.3.X ships CLI 2.1.X): the Agent SDK spawns the
 * global `claude` binary, and models are gated on the CLI's own version, so an
 * older CLI fails every turn with "does not support this model".
 */
export const CLAUDE_CODE_VERSION = "2.1.282";
