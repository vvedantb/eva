import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuickTaskTab, splitTaskPrompt, taskStatusTone } from "./quickTasks.ts";

test("parseQuickTaskTab defaults to active", () => {
  assert.equal(parseQuickTaskTab("done"), "done");
  assert.equal(parseQuickTaskTab("active"), "active");
  assert.equal(parseQuickTaskTab("other"), "active");
});

test("taskStatusTone maps the web statuses", () => {
  assert.equal(taskStatusTone("todo"), "neutral");
  assert.equal(taskStatusTone("in_progress"), "progress");
  assert.equal(taskStatusTone("code_review"), "code-review");
  assert.equal(taskStatusTone("business_review"), "business-review");
  assert.equal(taskStatusTone("done"), "done");
  assert.equal(taskStatusTone("cancelled"), "cancelled");
});

test("splitTaskPrompt keeps a short one-line prompt as the title only", () => {
  assert.deepEqual(splitTaskPrompt("  Bump deps "), { title: "Bump deps", description: undefined });
});

test("splitTaskPrompt uses the first line as title and keeps the whole prompt", () => {
  assert.deepEqual(splitTaskPrompt("Fix login\nIt fails on Safari"), {
    title: "Fix login",
    description: "Fix login\nIt fails on Safari",
  });
});

test("splitTaskPrompt caps a long title", () => {
  const { title, description } = splitTaskPrompt("a".repeat(150));
  assert.equal(title.length, 100);
  assert.equal(description, "a".repeat(150));
});
