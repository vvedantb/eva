import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const TEXT_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".html",
  ".yml",
  ".yaml",
  ".sh",
  ".toml",
];

// oxlint-disable-next-line no-control-regex -- this test hunts control bytes.
const CONTROL_BYTES = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

describe("tracked source files are plain text", () => {
  test("no source file contains a control byte", () => {
    const offenders: string[] = [];
    for (const path of trackedTextFiles()) {
      const text = readFileSync(join(repoRoot, path)).toString("latin1");
      const found = new Set(text.match(CONTROL_BYTES));
      if (found.size > 0) {
        const codes = [...found]
          .map(
            (char) => `0x${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
          )
          .join(", ");
        offenders.push(`${path}: ${codes}`);
      }
    }
    expect(
      offenders,
      "delete the control bytes — they are never intentional",
    ).toEqual([]);
  });

  test("the scan actually sees the repo", () => {
    expect(trackedTextFiles().length).toBeGreaterThan(500);
  });
});

function trackedTextFiles(): string[] {
  const listed = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    maxBuffer: 1 << 28,
    encoding: "utf8",
  });
  return listed
    .split("\0")
    .filter(Boolean)
    .filter((path) => TEXT_EXTENSIONS.some((ext) => path.endsWith(ext)));
}
