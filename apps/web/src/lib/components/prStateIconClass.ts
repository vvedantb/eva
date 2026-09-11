/** Maps a session's PR state to an icon color class.
 *   draft  → grey   (matches GitHub's draft pill)
 *   open   → green  (active, ready for review)
 *   merged → purple (reuses status-code-review token)
 *   closed → red    (closed without merge) */
export function prStateIconClass(
  state: "draft" | "open" | "merged" | "closed" | undefined,
): string {
  switch (state) {
    case "open":
      return "text-success";
    case "merged":
      return "text-status-code-review";
    case "closed":
      return "text-destructive";
    case "draft":
    default:
      return "text-muted-foreground";
  }
}
