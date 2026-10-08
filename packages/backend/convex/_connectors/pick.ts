export type ConnectorTokenSource = "oauth" | "env";

export interface PickedConnectorToken {
  token: string;
  source: ConnectorTokenSource;
}

/**
 * OAuth wins when present so the agent acts as the signed-in user. The team
 * env key is the shared fallback Carepulse already uses.
 */
export function pickConnectorToken(
  oauthToken: string | null | undefined,
  envToken: string | null | undefined,
): PickedConnectorToken | null {
  if (oauthToken) return { token: oauthToken, source: "oauth" };
  if (envToken) return { token: envToken, source: "env" };
  return null;
}
