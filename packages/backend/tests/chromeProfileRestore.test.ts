import { runInNewContext } from "node:vm";
import { describe, expect, test } from "bun:test";
import { CHROME_PREFS_SCRIPT } from "../convex/_sandbox_runtime/desktop";

const PREFS_DIR = "/home/eva/.config/chrome-debug/Default";
const PREFS_PATH = `${PREFS_DIR}/Preferences`;

interface FakeFs {
  files: Map<string, string>;
  dirs: Set<string>;
}

function runPrefsScript(existing?: string): FakeFs {
  const fake: FakeFs = { files: new Map(), dirs: new Set() };
  if (existing !== undefined) {
    fake.files.set(PREFS_PATH, existing);
  }
  const fs = {
    readFileSync(path: string): string {
      const found = fake.files.get(path);
      if (found === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return found;
    },
    mkdirSync(path: string, options: { recursive: boolean }): void {
      if (!options.recursive) {
        throw new Error("script must create the profile dir recursively");
      }
      fake.dirs.add(path);
    },
    writeFileSync(path: string, data: string): void {
      fake.files.set(path, data);
    },
  };
  runInNewContext(CHROME_PREFS_SCRIPT, {
    require: (id: string) => {
      if (id !== "fs") throw new Error(`unexpected require(${id})`);
      return fs;
    },
  });
  return fake;
}

function writtenPrefs(fake: FakeFs): Record<string, unknown> {
  const raw = fake.files.get(PREFS_PATH);
  if (raw === undefined) throw new Error("script wrote no Preferences file");
  return JSON.parse(raw);
}

describe("CHROME_PREFS_SCRIPT", () => {
  test("survives single-quote shell wrapping", () => {
    expect(CHROME_PREFS_SCRIPT).not.toContain("'");
  });

  test("writes session restore into a fresh profile", () => {
    const fake = runPrefsScript();

    expect(fake.dirs.has(PREFS_DIR)).toBe(true);
    expect(writtenPrefs(fake)).toEqual({
      session: { restore_on_startup: 1 },
      profile: { exit_type: "Normal", exited_cleanly: true },
    });
  });

  test("clears the crash markers pkill leaves behind", () => {
    const fake = runPrefsScript(
      JSON.stringify({
        profile: { exit_type: "Crashed", exited_cleanly: false },
      }),
    );

    expect(writtenPrefs(fake).profile).toEqual({
      exit_type: "Normal",
      exited_cleanly: true,
    });
  });

  test("keeps the rest of an existing profile intact", () => {
    const fake = runPrefsScript(
      JSON.stringify({
        profile: { name: "Person 1", exit_type: "Crashed" },
        session: { startup_urls: ["http://localhost:3000"] },
        extensions: { settings: { abc: 1 } },
      }),
    );
    const prefs = writtenPrefs(fake);

    expect(prefs.profile).toEqual({
      name: "Person 1",
      exit_type: "Normal",
      exited_cleanly: true,
    });
    expect(prefs.session).toEqual({
      startup_urls: ["http://localhost:3000"],
      restore_on_startup: 1,
    });
    expect(prefs.extensions).toEqual({ settings: { abc: 1 } });
  });

  test("recovers from a corrupt Preferences file", () => {
    const fake = runPrefsScript("{not json");

    expect(writtenPrefs(fake)).toEqual({
      session: { restore_on_startup: 1 },
      profile: { exit_type: "Normal", exited_cleanly: true },
    });
  });
});
