import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type {
  SandboxExecOptions,
  SandboxExecResult,
  SandboxHandle,
} from "../convex/_sandbox/provider";
import {
  MAX_INLINE_EXEC_CONTENT_BYTES,
  writeSandboxFile,
} from "../convex/_sandbox_runtime/sandboxFiles";

/**
 * Generalises previewProxyScriptDeliveryContract.test.ts.
 *
 * That test guards one script. The failure it guards against is not specific to
 * that script: Linux caps a single `execve` argument at 128 KB (MAX_ARG_STRLEN),
 * every sandbox command ships as one `bash -lc '<payload>'` argument, and any
 * delivery path that interpolates content into a command is one growth spurt
 * from "fork/exec /usr/bin/bash: argument list too long" — an error that names
 * neither the payload nor the caller.
 *
 * So the contract here is about the mechanism, not the payload: content reaches
 * a sandbox through the file API, via one helper, and nowhere else.
 */

const convexDir = join(dirname(fileURLToPath(import.meta.url)), "../convex");
const SANDBOX_DIRS = ["_sandbox", "_sandbox_runtime"];

/** Every hand-written sandbox module, repo-relative and posix-separated. */
function sandboxModules(): Array<{ id: string; source: string }> {
  const found: Array<{ id: string; source: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!path.endsWith(".ts") || path.endsWith(".d.ts")) continue;
      // Vendored bundles: payloads, not delivery code.
      if (path.endsWith(".generated.ts")) continue;
      found.push({
        id: relative(convexDir, path).replaceAll("\\", "/"),
        source: readFileSync(path, "utf8"),
      });
    }
  };
  for (const dir of SANDBOX_DIRS) walk(join(convexDir, dir));
  return found;
}

const modules = sandboxModules();

/** Records everything handed to a sandbox so the test can size each argument. */
function recordingHandle(): {
  handle: SandboxHandle;
  execArgs: string[];
  writes: Array<{ path: string; bytes: number }>;
} {
  const execArgs: string[] = [];
  const writes: Array<{ path: string; bytes: number }> = [];
  // Everything outside the delivery surface throws: this contract is about how
  // content is transported, and a path that reached for anything else here
  // would be doing something the test cannot vouch for.
  const outOfScope = (member: string): never => {
    throw new Error(`fake sandbox: ${member} is out of scope for this test`);
  };
  const handle: SandboxHandle = {
    id: "fake-sandbox",
    state: "running",
    errorReason: null,
    classifyForReconcile: () => Promise.resolve("alive"),
    exec: async (
      cmd: string,
      _opts?: SandboxExecOptions,
    ): Promise<SandboxExecResult> => {
      execArgs.push(cmd);
      return { exitCode: 0, output: "" };
    },
    writeFile: async (path: string, content: string | Uint8Array) => {
      writes.push({
        path,
        bytes:
          typeof content === "string"
            ? Buffer.byteLength(content, "utf8")
            : content.byteLength,
      });
    },
    execDetached: () => outOfScope("execDetached"),
    start: () => outOfScope("start"),
    stop: () => outOfScope("stop"),
    archive: () => outOfScope("archive"),
    extendTimeout: () => outOfScope("extendTimeout"),
    delete: () => outOfScope("delete"),
    refresh: () => outOfScope("refresh"),
    previewUrl: () => outOfScope("previewUrl"),
    createSnapshot: () => outOfScope("createSnapshot"),
    git: {
      branches: () => outOfScope("git.branches"),
      clone: () => outOfScope("git.clone"),
      checkoutBranch: () => outOfScope("git.checkoutBranch"),
    },
  };
  return { handle, execArgs, writes };
}

describe("sandbox script delivery", () => {
  test("the inline ceiling stays well under Linux MAX_ARG_STRLEN", () => {
    expect(MAX_INLINE_EXEC_CONTENT_BYTES).toBeLessThan(128 * 1024);
  });

  test("a 200 KB payload never reaches an exec argument", async () => {
    // The size that actually broke the preview proxy: the vendored html2canvas
    // bundle. Delivered through the helper it lands in a file write, and the
    // only command issued is the chmod, which carries the path alone.
    const payload = "x".repeat(200 * 1024);
    const { handle, execArgs, writes } = recordingHandle();

    await writeSandboxFile(handle, "/tmp/eva-big.mjs", payload, {
      executable: true,
    });

    expect(writes).toEqual([{ path: "/tmp/eva-big.mjs", bytes: 200 * 1024 }]);
    for (const arg of execArgs) {
      expect(Buffer.byteLength(arg, "utf8")).toBeLessThan(
        MAX_INLINE_EXEC_CONTENT_BYTES,
      );
      expect(arg).not.toContain(payload.slice(0, 1024));
    }
  });

  test("binary content goes through the same door", async () => {
    const { handle, execArgs, writes } = recordingHandle();
    await writeSandboxFile(handle, "/tmp/a.png", new Uint8Array(150 * 1024));
    expect(writes[0].bytes).toBe(150 * 1024);
    expect(execArgs).toEqual([]);
  });
});

describe("one delivery door", () => {
  /**
   * `writeFile` is the provider capability; `writeSandboxFile` is the only
   * caller. Keeping it that way is what makes the contract above enforceable —
   * a new path that reaches for the raw API skips every guarantee here.
   */
  const RAW_WRITE_FILE_ALLOWED = new Set([
    // Declares the capability.
    "_sandbox/provider.ts",
    // Implements it (Vercel `writeFiles`).
    "_sandbox/vercelProvider.ts",
    // The one helper every caller goes through.
    "_sandbox_runtime/sandboxFiles.ts",
  ]);

  test("only the central helper calls the raw writeFile API", () => {
    const offenders = modules
      .filter(({ id }) => !RAW_WRITE_FILE_ALLOWED.has(id))
      .filter(({ source }) => /\.writeFiles?\(/.test(source))
      .map(({ id }) => id);
    expect(
      offenders,
      "call writeSandboxFile (sandboxFiles.ts) instead of the raw provider API",
    ).toEqual([]);
  });

  test("the helper is what the delivery paths actually use", () => {
    const users = modules
      .filter(({ source }) => source.includes("writeSandboxFile("))
      .map(({ id }) => id);
    // Guards against the helper quietly becoming dead code while paths drift
    // back to inline transports.
    expect(users.length).toBeGreaterThanOrEqual(9);
    expect(users).toContain("_sandbox_runtime/previewProxy.ts");
    expect(users).toContain("_sandbox_runtime/execution.ts");
    expect(users).toContain("_sandbox_runtime/launch.ts");
  });
});

describe("no inline payload transports", () => {
  test("nothing pipes base64 into a sandbox file", () => {
    // `echo <base64> | base64 -d > file` inflates the payload by 4/3 and puts
    // all of it in one argument. Background commands used to ship this way.
    const offenders = modules
      .filter(({ source }) =>
        /base64\s+(?:-d|--decode)[^\n]*>/.test(stripComments(source)),
      )
      .map(({ id }) => id);
    expect(offenders).toEqual([]);
  });

  /**
   * Heredocs are not banned outright — a fixed two-line config written by an
   * install script is fine. What is banned is a heredoc carrying content that
   * can grow, delivered as part of an exec argument. Each surviving one is
   * listed with why it is safe; a new entry has to justify itself.
   */
  const HEREDOC_ALLOWLIST = new Map([
    [
      "_sandbox_runtime/convexLocalBackend.ts",
      // Both heredocs live INSIDE the background-command script body, which
      // execution.ts delivers with writeSandboxFile. A heredoc in a file has no
      // argument-length limit; only a heredoc in a command does.
      2,
    ],
    [
      // Fixed 4-line yum repo stanza in eva_pkg_install_chrome's dnf branch. No
      // interpolation, ~200 bytes, cannot grow. (Moved here from
      // _sandbox/vercelProvider.ts when the Chrome install was centralised so
      // the seed run and desktop start could share one distro-aware copy.)
      "_sandbox_runtime/packageManager.ts",
      1,
    ],
  ]);

  test("every heredoc is accounted for", () => {
    const found = new Map<string, number>();
    for (const { id, source } of modules) {
      const count = (stripComments(source).match(/<<'/g) ?? []).length;
      if (count > 0) found.set(id, count);
    }
    expect(
      Object.fromEntries(found),
      "new heredoc in a sandbox module. If it ships content into a command " +
        "argument, deliver it with writeSandboxFile instead; if it is a fixed " +
        "snippet inside a script body, add it to HEREDOC_ALLOWLIST with why.",
    ).toEqual(Object.fromEntries(HEREDOC_ALLOWLIST));
  });

  test("the convex background script body is delivered as a file", () => {
    const execution = readFileSync(
      join(convexDir, "_sandbox_runtime/execution.ts"),
      "utf8",
    );
    // The interpolating heredoc allowlisted above is only safe because of this.
    expect(execution).toContain("buildConvexBackgroundScriptBody(command)");
    expect(execution).toMatch(
      /writeSandboxFile\(\s*sandbox,\s*scriptPath,\s*scriptBody/,
    );
  });
});

/** Drops line comments and block comments so prose cannot trip the scanners. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}
