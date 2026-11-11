import { expect, test } from "vitest";
import {
  bindSupabaseProject,
  supabaseProjectRefs,
} from "../convex/mcp/supabase";

test("project refs come from SUPABASE_PROJECT_ID (one or a list), then the Supabase URL", () => {
  expect(
    supabaseProjectRefs([
      { key: "SUPABASE_URL", value: "https://otherref.supabase.co" },
      { key: "SUPABASE_PROJECT_ID", value: " explicitref " },
    ]),
  ).toEqual(["explicitref"]);
  expect(
    supabaseProjectRefs([
      { key: "SUPABASE_PROJECT_ID", value: "stagingref, prodref,,stagingref" },
    ]),
  ).toEqual(["stagingref", "prodref"]);
  expect(
    supabaseProjectRefs([
      { key: "NEXT_PUBLIC_SUPABASE_URL", value: "https://abcdef123.supabase.co" },
    ]),
  ).toEqual(["abcdef123"]);
  expect(
    supabaseProjectRefs([
      { key: "SUPABASE_URL", value: "https://abc.supabase.co.evil.example" },
      { key: "NEXT_PUBLIC_SUPABASE_URL", value: "http://127.0.0.1:54321" },
    ]),
  ).toEqual([]);
  expect(supabaseProjectRefs([])).toEqual([]);
});

test("one project: project_id is filled in; others are rejected", () => {
  expect(bindSupabaseProject({ query: "select 1" }, ["repo-ref"])).toEqual({
    ok: true,
    args: { query: "select 1", project_id: "repo-ref" },
  });
  expect(bindSupabaseProject({ project_id: "other-ref" }, ["repo-ref"]).ok).toBe(
    false,
  );
});

test("several projects: the caller must pick one of them", () => {
  const refs = ["stagingref", "prodref"];
  expect(bindSupabaseProject({ query: "select 1" }, refs).ok).toBe(false);
  expect(bindSupabaseProject({ project_id: "prodref" }, refs)).toEqual({
    ok: true,
    args: { project_id: "prodref" },
  });
  expect(bindSupabaseProject({ project_id: "other-ref" }, refs).ok).toBe(false);
});
