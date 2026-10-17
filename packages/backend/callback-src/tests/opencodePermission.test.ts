import { expect, test } from "vitest";
import { OPENCODE_PERMISSION_ALLOW_ALL } from "../session/opencodeSession.js";

/**
 * Opencode deep-merges OPENCODE_PERMISSION into its permission record. A bare
 * JSON string ('"allow"') merged as {0:"a",1:"l",...}, `GET /config` answered
 * 400 and every cold `opencode serve` timed out after 60s (Oct 2026).
 */
test("OPENCODE_PERMISSION is a JSON object that allows every tool", () => {
  const parsed: Record<string, string> = JSON.parse(
    OPENCODE_PERMISSION_ALLOW_ALL,
  );
  expect(parsed).toEqual({ "*": "allow" });
});
