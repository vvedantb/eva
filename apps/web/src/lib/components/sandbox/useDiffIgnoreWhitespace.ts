"use client";

import { useLocalStorage } from "usehooks-ts";

/**
 * The Code tab's "ignore whitespace" setting, shared by every view that renders
 * PR diffs where review comments can be drafted (the Code tab and the recap
 * walkthrough). A drafted comment is pinned by its position in the patch it
 * was drawn on, and this setting rewrites that patch — so every such view must
 * render the same patch, or a comment shows on the wrong lines in the other.
 * `useLocalStorage` syncs the value across the views in the same tab.
 */
export function useDiffIgnoreWhitespace() {
  return useLocalStorage("eva:pr-diff-ignore-ws", false);
}
