import { describe, expect, test } from "vitest";
import {
  presentEnv,
  selectVercelCredentials,
} from "../convex/_envVars/vercelCredentials";

const webVars = {
  VERCEL_TOKEN: "tok_web",
  VERCEL_TEAM_ID: "team_web",
  VERCEL_PROJECT_ID: "prj_web",
};

const eprocVars = {
  VERCEL_PROJECT_ID: "prj_eproc",
};

const teamTokenVars = {
  VERCEL_TOKEN: "tok_team",
  VERCEL_TEAM_ID: "team_shared",
};

describe("selectVercelCredentials", () => {
  test("uses the target app's VERCEL_PROJECT_ID and sibling token/team", () => {
    const selected = selectVercelCredentials(eprocVars, [webVars]);
    expect(selected).toEqual({
      ok: true,
      token: "tok_web",
      teamId: "team_web",
      projectId: "prj_eproc",
    });
  });

  test("does not borrow a sibling app's VERCEL_PROJECT_ID", () => {
    const selected = selectVercelCredentials(
      { VERCEL_TOKEN: "tok", VERCEL_TEAM_ID: "team" },
      [webVars],
    );
    expect(selected.ok).toBe(false);
    if (selected.ok) return;
    expect(selected.missing).toEqual(["VERCEL_PROJECT_ID"]);
    expect(selected.message).toContain("not borrowed from a sibling");
    expect(selected.message).not.toContain("prj_web");
  });

  test("returns a handled missing-env result instead of throwing", () => {
    expect(() => selectVercelCredentials({}, [])).not.toThrow();
    const selected = selectVercelCredentials({}, [teamTokenVars]);
    expect(selected.ok).toBe(false);
    if (selected.ok) return;
    expect(selected.missing).toEqual(["VERCEL_PROJECT_ID"]);
  });

  test("treats whitespace-only VERCEL_PROJECT_ID as missing", () => {
    const selected = selectVercelCredentials(
      {
        VERCEL_TOKEN: "tok",
        VERCEL_TEAM_ID: "team",
        VERCEL_PROJECT_ID: "   ",
      },
      [webVars],
    );
    expect(selected.ok).toBe(false);
    if (selected.ok) return;
    expect(selected.missing).toEqual(["VERCEL_PROJECT_ID"]);
  });
});

test("presentEnv treats empty and whitespace as unset", () => {
  expect(presentEnv(undefined)).toBeUndefined();
  expect(presentEnv("")).toBeUndefined();
  expect(presentEnv("  ")).toBeUndefined();
  expect(presentEnv("prj_x")).toBe("prj_x");
});
