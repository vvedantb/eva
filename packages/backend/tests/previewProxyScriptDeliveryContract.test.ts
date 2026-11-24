import { describe, expect, test } from "bun:test";
import {
  extractFunctionSource,
  previewProxySource,
} from "./_helpers/previewProxySource";

/**
 * The generated proxy script embeds the vendored html2canvas bundle (~200 KB).
 * Piping that through a heredoc inside the exec command made Vercel reject the
 * whole launch with "failed to start process: fork/exec /usr/bin/bash:
 * argument list too long", so every sandbox start failed with "Vercel preview
 * proxy failed to start on port 3000". The script must be delivered with the
 * file-write API, whose payload limits are far higher (the callback runner is
 * ~330 KB and ships that way).
 */
const launchProxySource = extractFunctionSource("async function launchProxy(");

describe("preview proxy script delivery", () => {
  test("writes the script with the file API", () => {
    // Via the shared helper — see sandboxScriptDeliveryContract.test.ts, which
    // generalises this file's guarantee to every delivery path.
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
