import { expect, test } from "vitest";
import { redactSecrets } from "../convex/_shared/redactSecrets";

test("redacts GitHub tokens, API keys, and URL userinfo", () => {
  expect(redactSecrets("auth ghp_abcdefghijklmnop")).toBe("auth ***");
  expect(redactSecrets("key sk-abcdefghijklmnopqrst")).toBe("key ***");
  expect(redactSecrets("id AKIAIOSFODNN7EXAMPLE")).toBe("id ***");
  expect(redactSecrets("Authorization: Bearer abc.def-ghi")).toBe(
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
