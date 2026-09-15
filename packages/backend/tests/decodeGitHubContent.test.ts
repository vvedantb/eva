import { expect, test } from "vitest";
import {
  decodeGitHubContent,
  decodeGitHubContentBytes,
  githubContentContainsNul,
} from "../convex/_repoSkills/decodeGitHubContent";

test("decodeGitHubContent decodes base64 without Node Buffer", () => {
  // GitHub Contents API returns base64; Convex isolate has no Buffer.
  const text = "hello skills\n";
  const encoded = btoa(text);
  expect(decodeGitHubContent(encoded)).toBe(text);
});

test("decodeGitHubContent strips newlines from wrapped base64", () => {
  const text = "line1\nline2";
  const encoded = btoa(text);
  const wrapped = `${encoded.slice(0, 8)}\n${encoded.slice(8)}`;
  expect(decodeGitHubContent(wrapped)).toBe(text);
});

test("githubContentContainsNul matches git's binary heuristic", () => {
  const encoded = btoa("hello\u0000world");
  expect(githubContentContainsNul(decodeGitHubContentBytes(encoded))).toBe(
    true,
  );
  expect(
    githubContentContainsNul(decodeGitHubContentBytes(btoa("hello"))),
  ).toBe(false);
});
