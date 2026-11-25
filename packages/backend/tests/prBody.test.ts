import { expect, test } from "bun:test";
import {
  buildPrBody,
  buildProjectPrSections,
  buildTaskPrSections,
} from "../convex/prBody";

test("buildTaskPrSections numbers change requests", () => {
  const sections = buildTaskPrSections("Ship the toggle", [
    "Bump contrast",
    "Fix focus ring",
  ]);

  expect(sections).toEqual([
    { heading: "Task", content: "Ship the toggle" },
    {
      heading: "Change Requests",
      content: "1. Bump contrast\n2. Fix focus ring",
    },
  ]);
});

test("buildProjectPrSections lists completed tasks with optional descriptions", () => {
  expect(
    buildProjectPrSections("Carepulse rollout", "Phase 1", [
      { title: "Login", description: "SSO flow" },
      { title: "Dashboard", description: undefined },
    ]),
  ).toEqual([
    {
      heading: "Project",
      content: "**Carepulse rollout**\n\nPhase 1",
    },
    {
      heading: "Completed Tasks",
      content: "1. **Login** — SSO flow\n2. **Dashboard**",
    },
  ]);
});

test("buildPrBody joins sections and appends Eva footer link", () => {
  const body = buildPrBody(
    [{ heading: "Task", content: "Hello" }],
    "https://eva.example.com/task/1",
  );
  expect(body).toContain("## Task\nHello\n");
  expect(body).toContain(
    "[View in Eva](https://eva.example.com/task/1) | *Created by Eva*",
  );
});
