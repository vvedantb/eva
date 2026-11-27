import { expect, test } from "bun:test";
import { OPENCODE_PERMISSION_ALLOW_ALL } from "../session/opencodeSession.js";

test("OPENCODE_PERMISSION is a JSON object that allows every tool", () => {
  const parsed: Record<string, string> = JSON.parse(
    OPENCODE_PERMISSION_ALLOW_ALL,
  );
  expect(parsed).toEqual({ "*": "allow" });
});
