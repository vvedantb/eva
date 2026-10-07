/** Statuses that must not be exec'd — Vercel resume would wake a stopped VM. */
export function isSandboxClosingStatus(
  status: string | undefined,
): boolean {
  return status === "closed" || status === "stopping";
}
