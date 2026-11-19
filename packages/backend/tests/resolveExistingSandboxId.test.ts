import { expect, test } from "vitest";
import { preferPersistedSandboxId } from "../convex/_sandbox/resolveExistingSandboxId";

test("preferPersistedSandboxId returns sandboxId when set", () => {
  expect(
    preferPersistedSandboxId({
      sandboxId: "sb_name",
    }),
  ).toBe("sb_name");
  expect(
    preferPersistedSandboxId({
      sandboxId: undefined,
    }),
  ).toBeUndefined();
});
