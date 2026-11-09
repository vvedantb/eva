import { expect, test } from "vitest";
import { redactSecrets } from "@eva/shared/redactSecrets";

test("redacts GitHub tokens, API keys, JWTs and URL userinfo", () => {
  expect(redactSecrets("auth ghp_abcdefghijklmnop")).toBe("auth ***");
  expect(redactSecrets("pat github_pat_11ABCDEFG_xyz")).toBe("pat ***");
  expect(redactSecrets("key sk-abcdefghijklmnopqrst")).toBe("key ***");
  expect(redactSecrets("id AKIAIOSFODNN7EXAMPLE")).toBe("id ***");
  expect(redactSecrets("Authorization: Bearer abc.def-ghi_0123456789xyz")).toBe(
    "Authorization: Bearer ***",
  );
  expect(
    redactSecrets("https://x-access-token:ghs_secretvalue@github.com/org/repo"),
  ).toBe("https://x-access-token:***@github.com/org/repo");
  expect(redactSecrets("https://git:supersecret@github.com/org/repo.git")).toBe(
    "https://git:***@github.com/org/repo.git",
  );
  expect(
    redactSecrets("token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.ok"),
  ).toBe("token ***");
});

test("catches URL-escaped GitHub tokens", () => {
  expect(redactSecrets("x-access-token%3Aghs_abc123%40github.com")).toBe(
    "x-access-token%3A***%40github.com",
  );
});

test("leaves ordinary text alone", () => {
  const text =
    "git push origin eva/branch failed: https://github.com/a/b (the bearer of bad news)";
  expect(redactSecrets(text)).toBe(text);
});
