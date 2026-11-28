import { expect, test } from "bun:test";
import {
  buildPrBody,
  buildProjectPrSections,
  buildTaskPrSections,
  RELATED_PRS_END,
  RELATED_PRS_START,
  upsertRelatedPrsBlock,
} from "../convex/prBody";
import { insertPrDescription } from "../convex/_github/prDescriptionPrompt";

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

test("upsertRelatedPrsBlock lists a task's sibling PRs once, above the footer", () => {
  const evaUrl = "https://eva.example.com/task/1";
  const body = buildPrBody(
    buildTaskPrSections("Merge api #12 first", []),
    evaUrl,
  );
  const api = { label: "acme/api", url: "https://github.com/acme/api/pull/12" };
  const web = { label: "acme/web", url: "https://github.com/acme/web/pull/7" };

  expect(upsertRelatedPrsBlock(body, [])).toBe(body);

  const once = upsertRelatedPrsBlock(body, [api]);
  const twice = upsertRelatedPrsBlock(
    insertPrDescription(once, "Generated description"),
    [api, web],
  );
  expect(twice).toBe(
    [
      "## Task",
      "Merge api #12 first",
      "",
      "<!-- eva-pr-description -->",
      "Generated description",
      "<!-- /eva-pr-description -->",
      "",
      RELATED_PRS_START,
      "## Related pull requests",
      `- [acme/api](${api.url})`,
      `- [acme/web](${web.url})`,
      RELATED_PRS_END,
      "---",
      `[View in Eva](${evaUrl}) | *Created by Eva*`,
    ].join("\n"),
  );
  expect(insertPrDescription(twice, "New description")).toContain(
    `- [acme/web](${web.url})\n${RELATED_PRS_END}`,
  );
});
