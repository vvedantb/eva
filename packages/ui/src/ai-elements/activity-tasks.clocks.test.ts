import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "activity-tasks.tsx"),
  "utf8",
);

/**
 * The 1s elapsed clock and 3s verb clock used to live on `ActivityTasks`,
 * so every tool row re-rendered once a second. They belong only on the
 * header that actually prints those strings.
 */
describe("activity clocks stay on the streaming header", () => {
  it("declares the clocks inside ActivityStreamingHeader", () => {
    const headerAt = source.indexOf("function ActivityStreamingHeader");
    const tasksAt = source.indexOf("export const ActivityTasks");
    expect(headerAt).toBeGreaterThan(-1);
    expect(tasksAt).toBeGreaterThan(headerAt);
    const header = source.slice(headerAt, tasksAt);
    expect(header).toContain("useSpinnerVerb");
    expect(header).toContain("useElapsedSeconds");
  });

  it("does not tick those clocks on ActivityTasks itself", () => {
    const tasksAt = source.indexOf("export const ActivityTasks");
    const body = source.slice(tasksAt);
    expect(body).not.toContain("useSpinnerVerb(");
    expect(body).not.toContain("useElapsedSeconds(");
  });
});
