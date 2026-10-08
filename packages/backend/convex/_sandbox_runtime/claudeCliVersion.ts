/**
 * Floor for the Claude Code CLI installed into every sandbox.
 *
 * This is no longer the version a sandbox ends up running: `resolveClaudeCliVersion`
 * in launch.ts resolves the registry's latest at launch, so a new Claude model
 * reaches every sandbox on its next boot without a deploy. This constant is
 * still what the snapshot seed bakes — an image resolves `@latest` once and
 * then freezes it, which is how a snapshot ended up stuck on 2.1.246 serving a
 * model it could not run — and the floor a failed registry lookup falls back to.
 *
 * Must match the `claudeCodeVersion` of the CLAUDE_AGENT_SDK_VERSION pinned in
 * snapshotActions.ts (SDK 0.3.X ships CLI 2.1.X): the Agent SDK spawns the
 * `claude` binary, and models are gated on the CLI's own version, so a floor
 * older than the SDK's own build fails every turn with "does not support this
 * model" whenever the registry lookup is the thing that failed.
 */
export const CLAUDE_CODE_VERSION = "2.1.282";
