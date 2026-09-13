import { SANDBOX_JWT_ISSUER } from "../sandboxAuthConfig";

type SandboxIdentity = {
  issuer?: string;
  /** Set on MCP `runMutationAsUser` JWTs; launch CONVEX_TOKEN omits it. */
  evaMcp?: unknown;
} | null;

/** True when the Convex identity came from the sandbox JWT issuer, not Clerk. */
export function isSandboxIdentity(identity: SandboxIdentity): boolean {
  return identity?.issuer === SANDBOX_JWT_ISSUER;
}

/**
 * Launch VM token (CONVEX_TOKEN). MCP impersonation JWTs share the issuer but
 * carry `evaMcp: true` so Eva MCP tools can call the same public mutations.
 */
export function isSandboxVmIdentity(identity: SandboxIdentity): boolean {
  return isSandboxIdentity(identity) && identity?.evaMcp !== true;
}

/** UI-or-MCP mutations. Blocks the VM; Clerk and MCP-as-user still pass. */
export async function rejectSandboxCaller(ctx: {
  auth: { getUserIdentity: () => Promise<SandboxIdentity> };
}): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (isSandboxVmIdentity(identity)) {
    throw new Error("Not authorized");
  }
}

/** Callbacks that must come from a sandbox launch token, never Clerk or MCP. */
export async function requireSandboxCaller(ctx: {
  auth: { getUserIdentity: () => Promise<SandboxIdentity> };
}): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!isSandboxVmIdentity(identity)) {
    throw new Error("Not authorized");
  }
}

/** Interview / planning UIs only insert the signed-in user's own turns. */
export function assertPublicUserMessageRole(args: {
  role: string;
  activityLog?: string;
}): void {
  if (args.role !== "user" || args.activityLog) {
    throw new Error("Not authorized");
  }
}

/**
 * Composer inserts are user turns. Clerk may persist a send-failure bubble
 * (`role: "assistant"`, `Error: …`) so a failed execute still shows in chat.
 */
export function assertPublicChatMessageRole(args: {
  role: string;
  content: string;
  activityLog?: string;
}): void {
  if (args.role === "user") return;
  if (
    args.role === "assistant" &&
    args.content.startsWith("Error: ") &&
    !args.activityLog
  ) {
    return;
  }
  throw new Error("Not authorized");
}
