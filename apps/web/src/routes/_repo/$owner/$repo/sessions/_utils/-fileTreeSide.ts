/** Which side of the file viewer the tree sits on. */
export type FileTreeSide = "left" | "right";

/**
 * Reads the stored file-tree side preference.
 *
 * localStorage hands back whatever a previous build (or another tab, or a user
 * poking at devtools) wrote, so the string is parsed at the boundary rather than
 * cast: only the explicit opt-in `"right"` moves the tree, everything else falls
 * back to the default left-hand layout.
 */
export function fileTreeSideFromStorage(value: string): FileTreeSide {
  return value === "right" ? "right" : "left";
}
