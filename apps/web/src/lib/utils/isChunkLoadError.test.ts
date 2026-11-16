import { expect, test } from "vitest";
import { isChunkLoadError } from "@vvedantb/ui/client";

test("isChunkLoadError detects ChunkLoadError name and common messages", () => {
  const named = new Error("boom");
  named.name = "ChunkLoadError";
  expect(isChunkLoadError(named)).toBe(true);

  expect(
    isChunkLoadError(
      new TypeError(
        "Failed to fetch dynamically imported module: https://eva.carepulse.co.uk/assets/AppShellChrome-D7P1ksRo.js",
      ),
    ),
  ).toBe(true);
  expect(isChunkLoadError(new Error("Loading chunk 12 failed"))).toBe(true);
  expect(isChunkLoadError(new Error("Loading CSS chunk 3 failed"))).toBe(true);
  expect(isChunkLoadError(new Error("Importing a module script failed"))).toBe(
    true,
  );
  expect(
    isChunkLoadError(
      new Error(
        'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
      ),
    ),
  ).toBe(true);
  expect(
    isChunkLoadError(
      new Error(
        'Loading module from “https://example/assets/x.js” was blocked because of a disallowed MIME type (“text/html”).',
      ),
    ),
  ).toBe(true);
});

test("isChunkLoadError rejects unrelated errors and non-errors", () => {
  expect(isChunkLoadError(new Error("Network timeout"))).toBe(false);
  expect(isChunkLoadError("string")).toBe(false);
  expect(isChunkLoadError(null)).toBe(false);
});
