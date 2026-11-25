import { expect, test } from "bun:test";
import {
  ensurePkcs8PrivateKey,
  normalizePemKey,
} from "../convex/githubPrivateKeyFormat";

test("normalizePemKey expands escaped newlines from env paste", () => {
  // Convex/env UIs often store PEM with literal \\n instead of real newlines.
  const normalized = normalizePemKey(
    "-----BEGIN PRIVATE KEY-----\\nABCD\\n-----END PRIVATE KEY-----\\n",
  );
  expect(normalized).toBe(
    "-----BEGIN PRIVATE KEY-----\nABCD\n-----END PRIVATE KEY-----",
  );
});

test("normalizePemKey wraps single-line RSA PEM into 64-char base64 lines", () => {
  const body = "A".repeat(70);
  const normalized = normalizePemKey(
    `-----BEGIN RSA PRIVATE KEY-----${body}-----END RSA PRIVATE KEY-----`,
  );
  expect(normalized).toContain("-----BEGIN RSA PRIVATE KEY-----");
  expect(normalized).toContain("-----END RSA PRIVATE KEY-----");
  expect(normalized.split("\n")[1]).toHaveLength(64);
  expect(normalized.split("\n")[2]).toHaveLength(6);
});

test("ensurePkcs8PrivateKey leaves PKCS#8 PEM unchanged", () => {
  const pkcs8 = [
    "-----BEGIN PRIVATE KEY-----",
    "ABCD",
    "-----END PRIVATE KEY-----",
  ].join("\n");
  expect(ensurePkcs8PrivateKey(pkcs8)).toBe(pkcs8);
});
