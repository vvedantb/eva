import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, test } from "bun:test";
import { CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV } from "../callback-src/providers/cursorSdk.js";

const cursorSdkBundle = readFileSync(
  join(
    dirname(createRequire(import.meta.url).resolve("@cursor/sdk")),
    "../esm/index.js",
  ),
  "utf8",
);

test("the Cursor SDK still reads the model catalog Eva hands it", () => {
  expect(CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV).toBe(
    "CURSOR_SDK_LOCAL_MODEL_CATALOG_JSON",
  );
  expect(cursorSdkBundle).toContain(CURSOR_SDK_LOCAL_MODEL_CATALOG_ENV);
});
