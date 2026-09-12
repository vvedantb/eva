import { SANDBOX_JWT_ISSUER } from "../sandboxAuthConfig";

/** True when the Convex identity came from a sandbox launch token, not Clerk. */
export function isSandboxIdentity(identity: {
  issuer?: string;
} | null): boolean {
  return identity?.issuer === SANDBOX_JWT_ISSUER;
}

/** Settings mutations that must stay in the Eva UI, never the VM. */
export async function rejectSandboxCaller(ctx: {
  auth: { getUserIdentity: () => Promise<{ issuer?: string } | null> };
}): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (isSandboxIdentity(identity)) {
    throw new Error("Not authorized");
  }
}
