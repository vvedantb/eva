import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV } from "../callback-src/providers/cursorSdk.js";

// The published bundle Eva actually imports (`dist/esm` next to the resolved
// CommonJS entry), read so a contract can be asserted against the pinned code.
const cursorSdkBundle = readFileSync(
  join(
    dirname(createRequire(import.meta.url).resolve("@cursor/sdk")),
    "../esm/index.js",
  ),
  "utf8",
);

test("the Cursor SDK still reads the model catalog Eva hands it", () => {
  // Undocumented env var: the SDK reads it in Agent.create/Agent.resume in
  // place of its own listModels() network call, which is the round trip that
  // timed out on CURSOR_AGENT_SETUP_TIMEOUT_MS in prod. An SDK bump that
  // renames or drops it silently restores that remote dependency, so pin the
  // literal against the bundle — and against the constant, so a rename on our
  // side is caught too.
  expect(CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV).toBe(
    "CURSOR_SDK_LOCAL_MODEL_CATALOG_JSON",
  );
  expect(cursorSdkBundle).toContain(CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV);
});
