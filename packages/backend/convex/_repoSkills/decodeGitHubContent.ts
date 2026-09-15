/**
 * Decode GitHub Contents API base64 payloads without Node `Buffer`
 * (Convex isolate / browser-safe).
 */
export function decodeGitHubContentBytes(content: string): Uint8Array {
  const binary = atob(content.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** True when the decoded blob contains a NUL — git's binary-file heuristic. */
export function githubContentContainsNul(bytes: Uint8Array): boolean {
  return bytes.includes(0);
}

export function decodeGitHubContent(content: string): string {
  return new TextDecoder("utf-8").decode(decodeGitHubContentBytes(content));
}
