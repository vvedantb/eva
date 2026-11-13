import { expect, test } from "vitest";
import { bindSupabaseProject, supabaseProjects } from "../convex/mcp/supabase";

test("projects come from SUPABASE_PROJECT_ID (refs or label:ref), then the Supabase URL", () => {
  expect(
    supabaseProjects([
      { key: "SUPABASE_URL", value: "https://otherref.supabase.co" },
      { key: "SUPABASE_PROJECT_ID", value: " explicitref " },
    ]),
  ).toEqual([{ ref: "explicitref", label: null }]);
  expect(
    supabaseProjects([
      {
        key: "SUPABASE_PROJECT_ID",
        value: "staging: stagingref, prod:prodref,,stagingref",
      },
    ]),
  ).toEqual([
    { ref: "stagingref", label: "staging" },
    { ref: "prodref", label: "prod" },
  ]);
  expect(
    supabaseProjects([
      {
        key: "NEXT_PUBLIC_SUPABASE_URL",
        value: "https://abcdef123.supabase.co",
      },
    ]),
  ).toEqual([{ ref: "abcdef123", label: null }]);
  expect(
    supabaseProjects([
      { key: "SUPABASE_URL", value: "https://abc.supabase.co.evil.example" },
      { key: "NEXT_PUBLIC_SUPABASE_URL", value: "http://127.0.0.1:54321" },
    ]),
  ).toEqual([]);
});

test("one project: project_id is filled in; others are rejected", () => {
  const only = [{ ref: "repo-ref", label: null }];
  expect(bindSupabaseProject({ query: "select 1" }, only)).toEqual({
    ok: true,
    args: { query: "select 1", project_id: "repo-ref" },
  });
  expect(bindSupabaseProject({ project_id: "other-ref" }, only).ok).toBe(false);
});

test("several projects: the caller picks one by ref or label", () => {
  const projects = [
    { ref: "stagingref", label: "staging" },
    { ref: "prodref", label: "prod" },
  ];
  expect(bindSupabaseProject({ query: "select 1" }, projects).ok).toBe(false);
  expect(bindSupabaseProject({ project_id: "prodref" }, projects)).toEqual({
    ok: true,
    args: { project_id: "prodref" },
  });
  expect(bindSupabaseProject({ project_id: "Staging" }, projects)).toEqual({
    ok: true,
    args: { project_id: "stagingref" },
  });
  expect(bindSupabaseProject({ project_id: "other-ref" }, projects).ok).toBe(
    false,
  );
});
