import { base64ToBytes } from "@vvedantb/server";

/**
 * Decode GitHub Contents API base64 payloads without Node `Buffer`
 * (Convex isolate / browser-safe).
 */
export function decodeGitHubContentBytes(content: string): Uint8Array {
  // atob ignores the newlines GitHub wraps the payload with.
  return base64ToBytes(content);
}

/** True when the decoded blob contains a NUL — git's binary-file heuristic. */
export function githubContentContainsNul(bytes: Uint8Array): boolean {
  return bytes.includes(0);
}

export function decodeGitHubContent(content: string): string {
  return new TextDecoder("utf-8").decode(decodeGitHubContentBytes(content));
}
