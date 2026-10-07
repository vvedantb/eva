/**
 * Presence room joined by anyone with a sandbox tab (preview, terminal, editor,
 * desktop, files, custom tab) in the foreground. The idle-pause sweep treats a
 * populated room as "someone is using the sandbox now". Chat-only presence is a
 * different room and never keeps a sandbox awake.
 */
export function sandboxPresenceRoomId(entityId: string): string {
  return `sandbox:${entityId}`;
}
