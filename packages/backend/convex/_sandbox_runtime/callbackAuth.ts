/** Domain-separated message for a sandbox streaming heartbeat signature. */
export function streamingHeartbeatHmacMessage(entityId: string): string {
  return "streaming-heartbeat:" + entityId;
}

/**
 * Domain-separated message for the in-sandbox preview proxy's traffic
 * heartbeat (`POST /api/preview/activity`). Scoped per sandbox so a value read
 * from one sandbox cannot keep another awake.
 */
export function previewActivityHmacMessage(sandboxId: string): string {
  return "preview-activity:" + sandboxId;
}
