/** Domain-separated message for a sandbox streaming heartbeat signature. */
export function streamingHeartbeatHmacMessage(entityId: string): string {
  return "streaming-heartbeat:" + entityId;
}
