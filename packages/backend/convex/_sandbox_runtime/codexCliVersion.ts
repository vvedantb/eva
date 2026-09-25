/**
 * Floor for the Codex CLI installed into every sandbox.
 *
 * Mirrors `claudeCliVersion.ts`: `resolveCodexCliVersion` in launch.ts floats
 * the CLI to the registry's latest at launch, so this is the version the
 * snapshot seed bakes and the floor a failed registry lookup falls back to,
 * not the version a sandbox ends up running.
 *
 * Keep it at or above the `@openai/codex-sdk` pin in package.json. OpenAI
 * publishes the CLI and its SDK under the same version number, and the SDK
 * spawns the binary (`codexExecutablePath` in callback-src), so a floor behind
 * the SDK means a registry outage leaves the pair mismatched.
 */
export const CODEX_CLI_VERSION = "0.146.0";
