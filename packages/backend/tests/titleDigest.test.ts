import { expect, test } from "vitest";
import { buildTitleDigest } from "../convex/_sessions/prompts";

function history(
  count: number,
  contentFor: (index: number) => string,
): Array<{ role: string; content: string }> {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: contentFor(index),
  }));
}

test("entries stay in chronological order with role prefixes", () => {
  const digest = buildTitleDigest([
    { role: "user", content: "first" },
    { role: "assistant", content: "second" },
    { role: "user", content: "third" },
  ]);

  expect(digest).toBe("USER: first\n\nASSISTANT: second\n\nUSER: third");
});

test("system alerts and empty rows are skipped", () => {
  const digest = buildTitleDigest([
    { role: "user", content: "   " },
    { role: "assistant", content: "sandbox restarted", isSystemAlert: true },
    { role: "user", content: "real ask" },
    { role: "assistant", content: "" },
  ]);

  expect(digest).toBe("USER: real ask");
  expect(buildTitleDigest([])).toBe("");
});

test("each entry is capped at the entry cap", () => {
  const digest = buildTitleDigest(
    [{ role: "assistant", content: "x".repeat(3_000) }],
    { totalBudget: 8_000, entryCap: 100 },
  );

  expect(digest).toBe(`ASSISTANT: ${"x".repeat(100)}`);
});

test("the first user message is pinned when the budget only fits the tail", () => {
  // 20 entries of ~1,000 chars against a 3,500 budget: room for the pinned
  // first user message plus the two newest entries.
  const digest = buildTitleDigest(
    history(20, (index) => `m${index}-${"y".repeat(1_000)}`),
    { totalBudget: 3_500, entryCap: 1_200 },
  );
  const lines = digest.split("\n\n");

  expect(lines.map((line) => line.slice(0, line.indexOf("-")))).toEqual([
    "USER: m0",
    "USER: m18",
    "ASSISTANT: m19",
  ]);
  expect(digest.length).toBeLessThanOrEqual(3_500);
});

test("newer entries win over older ones once the budget is spent", () => {
  const digest = buildTitleDigest(
    history(10, (index) => `m${index}-${"z".repeat(500)}`),
    { totalBudget: 2_200, entryCap: 1_200 },
  );

  expect(digest).toContain("USER: m0-");
  expect(digest).toContain("ASSISTANT: m9-");
  expect(digest).toContain("USER: m8-");
  expect(digest).not.toContain("USER: m4-");
  expect(digest.length).toBeLessThanOrEqual(2_200);
});

test("a conversation with no user message still digests the assistant tail", () => {
  const digest = buildTitleDigest([
    { role: "assistant", content: "hello" },
    { role: "assistant", content: "world" },
  ]);

  expect(digest).toBe("ASSISTANT: hello\n\nASSISTANT: world");
});

test("defaults keep the whole digest under 8,000 characters", () => {
  const digest = buildTitleDigest(
    history(40, (index) => `m${index}-${"q".repeat(1_500)}`),
  );

  expect(digest.length).toBeLessThanOrEqual(8_000);
  expect(digest).toContain("USER: m0-");
  expect(digest).toContain("ASSISTANT: m39-");
  // Entry cap trims each 1,500-char message to 1,200 + prefix.
  expect(digest).not.toContain("q".repeat(1_201));
});
