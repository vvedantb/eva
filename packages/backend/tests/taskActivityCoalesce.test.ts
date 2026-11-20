import { expect, test } from "bun:test";
import {
  shouldCoalesceTaskActivity,
  TASK_ACTIVITY_COALESCE_MS,
} from "../convex/taskActivityCoalesce";

test("shouldCoalesceTaskActivity merges same actor+field inside the window", () => {
  const now = 1_000_000;
  expect(
    shouldCoalesceTaskActivity(
      { field: "description", userId: "user1", createdAt: now - 60_000 },
      { field: "description", userId: "user1", now },
    ),
  ).toBe(true);
});

test("shouldCoalesceTaskActivity rejects outside the window", () => {
  const now = 1_000_000;
  expect(
    shouldCoalesceTaskActivity(
      {
        field: "description",
        userId: "user1",
        createdAt: now - TASK_ACTIVITY_COALESCE_MS - 1,
      },
      { field: "description", userId: "user1", now },
    ),
  ).toBe(false);
});

test("shouldCoalesceTaskActivity rejects different field or actor", () => {
  const now = 1_000_000;
  expect(
    shouldCoalesceTaskActivity(
      { field: "description", userId: "user1", createdAt: now - 1_000 },
      { field: "title", userId: "user1", now },
    ),
  ).toBe(false);
  expect(
    shouldCoalesceTaskActivity(
      { field: "description", userId: "user1", createdAt: now - 1_000 },
      { field: "description", userId: "user2", now },
    ),
  ).toBe(false);
});
