import type { Auth, UserIdentity } from "convex/server";
import { SANDBOX_JWT_ISSUER } from "../sandboxAuthConfig";

/**
 * Custom claim on the MCP `runAsUser` JWT (mcp/nodeActions.ts). The launch VM
 * token (CONVEX_TOKEN, sandboxJwt.ts) has the same issuer but no claim. We mark
 * MCP and not the VM, so in-flight 24h VM tokens still classify as the VM.
 */
export const EVA_MCP_CLAIM = "evaMcp";

/** True when the identity came from Eva's sandbox issuer (VM or MCP), not Clerk. */
export function isSandboxIdentity(
  identity: Pick<UserIdentity, "issuer"> | null,
): boolean {
  return identity?.issuer === SANDBOX_JWT_ISSUER;
}

/**
 * True for the in-VM daemon token only. Agent code in the VM can read that
 * token, so it must not reach secrets or account control.
 */
export function isSandboxVmIdentity(identity: UserIdentity | null): boolean {
  return (
    identity !== null &&
    isSandboxIdentity(identity) &&
    identity[EVA_MCP_CLAIM] !== true
  );
}

/**
 * Blocks the VM token. Clerk (web, mobile) and MCP-as-user still pass.
 *
 * Fail-safe rule: use this only on functions that MCP `runAsUser` and the
 * daemon never call. If Convex ever dropped the `evaMcp` claim, MCP tokens
 * would look like VM tokens, and that rule keeps MCP working.
 * tests/sandboxIdentityContract.test.ts enforces it.
 */
export async function rejectSandboxCaller(ctx: { auth: Auth }): Promise<void> {
  if (isSandboxVmIdentity(await ctx.auth.getUserIdentity())) {
    throw new Error("Not available from a sandbox");
  }
}
