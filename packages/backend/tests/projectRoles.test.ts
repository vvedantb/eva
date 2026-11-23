import { expect, test } from "vitest";
import { projectRoleFor } from "@eva/shared/projectRoles";

test("devs and people with no role set are contributors", () => {
  expect(projectRoleFor({ role: "dev" }, false)).toBe("contributor");
  expect(projectRoleFor({}, false)).toBe("contributor");
});

test("designers and business users are viewers", () => {
  expect(projectRoleFor({ role: "designer" }, false)).toBe("viewer");
  expect(projectRoleFor({ role: "business" }, false)).toBe("viewer");
});

test("admins and team owners are contributors whatever their role", () => {
  expect(projectRoleFor({ role: "business", isAdmin: true }, false)).toBe(
    "contributor",
  );
  expect(projectRoleFor({ role: "designer" }, true)).toBe("contributor");
});
