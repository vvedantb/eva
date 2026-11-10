import { expect, test } from "vitest";
import {
  bindSupabaseProject,
  supabaseProjectRef,
} from "../convex/mcp/supabase";

test("project ref comes from SUPABASE_PROJECT_ID, then the Supabase URL", () => {
  expect(
    supabaseProjectRef([
      { key: "SUPABASE_URL", value: "https://otherref.supabase.co" },
      { key: "SUPABASE_PROJECT_ID", value: " explicitref " },
    ]),
  ).toBe("explicitref");
  expect(
    supabaseProjectRef([
      { key: "NEXT_PUBLIC_SUPABASE_URL", value: "https://abcdef123.supabase.co" },
    ]),
  ).toBe("abcdef123");
  expect(
    supabaseProjectRef([
      { key: "SUPABASE_URL", value: "https://abc.supabase.co.evil.example" },
      { key: "NEXT_PUBLIC_SUPABASE_URL", value: "not a url" },
    ]),
  ).toBeNull();
  expect(supabaseProjectRef([])).toBeNull();
});

test("tool calls are forced onto the repo's project", () => {
  expect(bindSupabaseProject({ query: "select 1" }, "repo-ref")).toEqual({
    ok: true,
    args: { query: "select 1", project_id: "repo-ref" },
  });
  expect(bindSupabaseProject({ project_id: "repo-ref" }, "repo-ref")).toEqual({
    ok: true,
    args: { project_id: "repo-ref" },
  });
  const rejected = bindSupabaseProject({ project_id: "other-ref" }, "repo-ref");
  expect(rejected.ok).toBe(false);
});
