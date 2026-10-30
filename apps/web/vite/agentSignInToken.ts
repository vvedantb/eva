import { z } from "zod";

const SignInTokenResponse = z.object({ token: z.string() });

export type AgentSignInToken =
  | { ok: true; token: string }
  | { ok: false; status: number; error: string; details?: string };

/**
 * Mints a short-lived Clerk sign-in ticket for the agent user. Shared by the
 * dev `/api/auth/agent-login` route and Redline's compare login hook.
 */
export async function createAgentSignInToken(env: {
  CLERK_SECRET_KEY?: string;
  AGENT_CLERK_USER_ID?: string;
}): Promise<AgentSignInToken> {
  const secretKey = env.CLERK_SECRET_KEY;
  const agentUserId = env.AGENT_CLERK_USER_ID;
  if (!secretKey || !agentUserId) {
    return {
      ok: false,
      status: 500,
      error: "CLERK_SECRET_KEY and AGENT_CLERK_USER_ID must be set in .env.local",
    };
  }

  const resp = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: agentUserId, expires_in_seconds: 60 }),
  });
  if (!resp.ok) {
    return {
      ok: false,
      status: 502,
      error: "Failed to create sign-in token",
      details: await resp.text(),
    };
  }

  const parsed = SignInTokenResponse.safeParse(await resp.json());
  if (!parsed.success) {
    return { ok: false, status: 502, error: "No token in Clerk response" };
  }
  return { ok: true, token: parsed.data.token };
}
