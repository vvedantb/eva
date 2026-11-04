import { z } from "zod";

/**
 * On prod Clerk live keys, the cross-domain session handshake on a fresh
 * popup load can redirect `/mcp/oauth/authorize` to the globally-configured
 * `signInFallbackRedirectUrl` (`/home`) before our route's `AuthorizedFlow`
 * can mint the auth code. To recover, we persist the OAuth search params
 * here as soon as the page loads (in `main.tsx`, before any Clerk code
 * runs) and again on entry to the route via `beforeLoad`. The `/home`
 * route reads + consumes them on entry to redirect back into the flow.
 *
 * sessionStorage is per-tab, so the popup Claude opens has its own state
 * and won't pollute the user's main tab.
 */
const STORAGE_KEY = "mcp_oauth_pending";
const MAX_ATTEMPTS = 2;

export const mcpOauthParamsSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z
    .string()
    .refine((value) => URL.canParse(value), "Invalid redirect URI"),
  state: z.string().min(1),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.literal("S256"),
});

export type McpOauthParams = z.infer<typeof mcpOauthParamsSchema>;

const stateSchema = z.object({
  params: mcpOauthParamsSchema,
  attempts: z.number(),
});

type StoredState = z.infer<typeof stateSchema>;

function readState(): StoredState | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Save the OAuth params on route entry. The attempt counter is preserved
 * across saves for the same flow (matched by OAuth `state` nonce) so a
 * `/home` → `/mcp/oauth/authorize` recovery doesn't reset the loop guard,
 * but a fresh OAuth flow starts the counter from zero.
 */
export function saveMcpOauthParams(params: McpOauthParams): void {
  const existing = readState();
  const attempts =
    existing !== null && existing.params.state === params.state
      ? existing.attempts
      : 0;
  const next: StoredState = { params, attempts };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/**
 * Parse the OAuth params from `window.location` and persist them. Called
 * from `main.tsx` before the Clerk provider mounts, so that even if
 * Clerk's session handshake redirects us off this URL during the React
 * loading phase, the params survive for `/home` to recover.
 */
export function saveMcpOauthParamsFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.pathname !== "/mcp/oauth/authorize") return;

  const candidate = {
    client_id: url.searchParams.get("client_id"),
    redirect_uri: url.searchParams.get("redirect_uri"),
    state: url.searchParams.get("state"),
    code_challenge: url.searchParams.get("code_challenge"),
    code_challenge_method: url.searchParams.get("code_challenge_method"),
  };

  const parsed = mcpOauthParamsSchema.safeParse(candidate);
  if (!parsed.success) return;

  saveMcpOauthParams(parsed.data);
}

/**
 * If a pending OAuth flow exists, return its params and increment the
 * attempt counter. Returns null after `MAX_ATTEMPTS` to prevent an
 * infinite redirect loop if Clerk keeps bouncing us off the OAuth route.
 */
export function consumeMcpOauthParams(): McpOauthParams | null {
  const state = readState();
  if (!state) return null;
  if (state.attempts >= MAX_ATTEMPTS) {
    clearMcpOauthParams();
    return null;
  }
  const next: StoredState = {
    params: state.params,
    attempts: state.attempts + 1,
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return state.params;
}

export function clearMcpOauthParams(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
