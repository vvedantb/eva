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

/** Callbacks that must come from a sandbox launch token, never a Clerk session. */
export async function requireSandboxCaller(ctx: {
  auth: { getUserIdentity: () => Promise<{ issuer?: string } | null> };
}): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!isSandboxIdentity(identity)) {
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
