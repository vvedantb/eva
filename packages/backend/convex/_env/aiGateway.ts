export const AI_GATEWAY_KEY_MISSING =
  "AI_GATEWAY_API_KEY is not set on this Convex deployment.";

/** Returns the trimmed AI Gateway key, or null when it is unset or blank. */
export function readAiGatewayKey(): string | null {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  return key ? key : null;
}
