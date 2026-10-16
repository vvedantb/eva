import { describe, expect, test } from "vitest";
import {
  buildEvaConfigDraft,
  computeSeedFingerprint,
  computeStartupFingerprint,
  evaAppFingerprints,
  findEvaApp,
  normalizeAppPath,
  parseEvaConfig,
  parseEvaMcpSummary,
} from "../convex/_evaConfig/config";

const monorepo = JSON.stringify({
  version: 1,
  snapshot: { build: ["pnpm install"], seed: ["pnpm db:seed"] },
  apps: [
    {
      path: "apps/web",
      dev: { command: "pnpm dev", port: 5173 },
      startup: ["cp .env.example .env"],
      background: ["npx convex dev"],
      stop: ["pkill convex"],
    },
    { path: "./apps/docs/", startup: [] },
  ],
});

describe("parseEvaConfig", () => {
  test("parses a monorepo file and defaults missing lists", () => {
    const parsed = parseEvaConfig(monorepo);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const docs = findEvaApp(parsed.value, "apps/docs");
    expect(docs).toMatchObject({ background: [], stop: [] });
  });

  test("defaults the snapshot block", () => {
    const parsed = parseEvaConfig(
      JSON.stringify({ version: 1, apps: [{ path: "" }] }),
    );
    expect(parsed.ok && parsed.value.snapshot).toEqual({ build: [], seed: [] });
  });

  test("reports invalid JSON with the file name", () => {
    const parsed = parseEvaConfig("{ nope");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain(".eva/config.json");
  });

  test("reports schema issues with their path", () => {
    const parsed = parseEvaConfig(
      JSON.stringify({ version: 1, apps: [{ path: "", startup: [1] }] }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("apps.0.startup.0");
  });

  test("rejects unknown keys so typos do not silently do nothing", () => {
    const parsed = parseEvaConfig(
      JSON.stringify({ version: 1, apps: [{ path: "", startpu: ["x"] }] }),
    );
    expect(parsed.ok).toBe(false);
  });

  test("rejects two entries for the same app folder", () => {
    const parsed = parseEvaConfig(
      JSON.stringify({ version: 1, apps: [{ path: "web" }, { path: "./web/" }] }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain('duplicate path "web"');
  });
});

describe("findEvaApp", () => {
  test("matches rootDirectory after normalising both sides", () => {
    const parsed = parseEvaConfig(monorepo);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(findEvaApp(parsed.value, "apps/docs")?.path).toBe("./apps/docs/");
    expect(findEvaApp(parsed.value, "apps/web/")?.dev?.port).toBe(5173);
    expect(findEvaApp(parsed.value, undefined)).toBeNull();
  });

  test("normalises root spellings to the empty path", () => {
    expect(normalizeAppPath(".")).toBe("");
    expect(normalizeAppPath("./")).toBe("");
    expect(normalizeAppPath(undefined)).toBe("");
  });
});

describe("fingerprints", () => {
  test("the file and the Convex cache agree for the same commands", () => {
    const parsed = parseEvaConfig(monorepo);
    if (!parsed.ok) throw new Error(parsed.error);
    const app = findEvaApp(parsed.value, "apps/web");
    if (!app) throw new Error("app missing");
    expect(evaAppFingerprints(parsed.value, app)).toEqual({
      seed: computeSeedFingerprint({
        build: ["pnpm install"],
        seed: ["pnpm db:seed"],
        background: ["npx convex dev"],
        stop: ["pkill convex"],
      }),
      startup: computeStartupFingerprint(["cp .env.example .env"]),
    });
  });

  test("a startup-only edit keeps the seed fingerprint", () => {
    const base = {
      build: [],
      seed: [],
      background: ["a"],
      stop: ["b"],
    };
    expect(computeSeedFingerprint(base)).toBe(computeSeedFingerprint(base));
    expect(computeStartupFingerprint(["x"])).not.toBe(
      computeStartupFingerprint(["y"]),
    );
    expect(computeSeedFingerprint({ ...base, background: ["c"] })).not.toBe(
      computeSeedFingerprint(base),
    );
  });

  test("fingerprints are safe to write unquoted into a shell command", () => {
    expect(computeStartupFingerprint(["echo 'hi' && rm -rf $X"])).toMatch(
      /^fp-[a-z0-9]+-\d+$/,
    );
  });
});

describe("parseEvaMcpSummary", () => {
  test("summarises http and stdio servers without resolving secrets", () => {
    const parsed = parseEvaMcpSummary(
      JSON.stringify({
        mcpServers: {
          sentry: {
            type: "http",
            url: "https://mcp.sentry.dev/mcp",
            headers: { Authorization: "Bearer ${SENTRY_TOKEN}" },
          },
          figma: { command: "npx", args: ["-y", "figma-developer-mcp"] },
        },
      }),
    );
    expect(parsed).toEqual({
      ok: true,
      value: [
        { name: "sentry", kind: "http", target: "https://mcp.sentry.dev/mcp" },
        { name: "figma", kind: "stdio", target: "npx -y figma-developer-mcp" },
      ],
    });
  });
});

describe("buildEvaConfigDraft", () => {
  test("round-trips today's Convex commands into a valid file", () => {
    const draft = buildEvaConfigDraft({
      apps: [
        {
          rootDirectory: "apps/web",
          devCommand: "pnpm dev",
          devPort: 5173,
          startupCommands: ["a"],
          backgroundCommands: ["b"],
        },
      ],
      buildCommands: ["pnpm install"],
    });
    const parsed = parseEvaConfig(draft);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(findEvaApp(parsed.value, "apps/web")).toEqual({
      path: "apps/web",
      dev: { command: "pnpm dev", port: 5173 },
      startup: ["a"],
      background: ["b"],
      stop: [],
    });
    expect(parsed.value.snapshot).toEqual({ build: ["pnpm install"], seed: [] });
  });

  test("an unconfigured repo still yields a valid single-app file", () => {
    expect(parseEvaConfig(buildEvaConfigDraft({ apps: [] })).ok).toBe(true);
  });
});
