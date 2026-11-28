import { describe, expect, test } from "bun:test";
import {
  extractFunctionSource,
  previewProxySource,
} from "./_helpers/previewProxySource";

const launchProxySource = extractFunctionSource("async function launchProxy(");

describe("preview proxy script delivery", () => {
  test("writes the script with the file API", () => {
    expect(launchProxySource).toContain(
      "writeSandboxFile(sandbox, scriptPath, script)",
    );
  });

  test("never embeds the script in an exec command", () => {
    expect(launchProxySource).not.toContain("<<");
    expect(launchProxySource).not.toMatch(/command\s*=\s*\[[^\]]*\bscript\b/s);
  });

  test("html2canvas is only inlined into the script, never a shell command", () => {
    expect(previewProxySource).toContain("PREVIEW_HTML2CANVAS_SCRIPT");
    expect(launchProxySource).not.toContain("PREVIEW_HTML2CANVAS_SCRIPT");
  });
});
