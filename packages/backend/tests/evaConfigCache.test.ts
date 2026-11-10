import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../convex/_generated/api";
import schema from "../convex/schema";

/**
 * The `.eva/config.json` sync writes the file into the existing command fields
 * of every app row, so all current readers keep working. These hit the real
 * mutation: each app gets its own entry, a broken file keeps the last good
 * commands, and a deleted file hands the repo back to Convex.
 */

const modules = import.meta.glob("../convex/**/*.ts");
const TIMEOUT_MS = 30_000;

const CONFIG = JSON.stringify({
  version: 1,
  snapshot: { build: ["pnpm install"], seed: [] },
  apps: [
    {
      path: "apps/web",
      dev: { command: "pnpm dev", port: 5173 },
      startup: ["web-start"],
      background: ["web-bg"],
      stop: ["web-stop"],
    },
    { path: "apps/admin", startup: ["admin-start"] },
  ],
});

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const base = { owner: "acme", name: "mono", installationId: 1 };
    const root = await ctx.db.insert("githubRepos", {
      ...base,
      startupCommands: ["root-old"],
    });
    const web = await ctx.db.insert("githubRepos", {
      ...base,
      rootDirectory: "apps/web",
      parentRepoId: root,
      startupCommands: ["web-old"],
      devPort: 3000,
    });
    const admin = await ctx.db.insert("githubRepos", {
      ...base,
      rootDirectory: "apps/admin",
      parentRepoId: root,
      devCommand: "pnpm admin",
    });
    const snapshot = await ctx.db.insert("repoSnapshots", {
      repoId: web,
      snapshotName: "snapshot-web",
      schedule: "manual",
      buildCommands: ["old-build"],
      createdAt: 0,
      updatedAt: 0,
    });
    return { root, web, admin, snapshot };
  });
  const apply = (configText: string | null, mcpText: string | null = null) =>
    t.mutation(internal._evaConfig.cache.applyEvaConfig, {
      owner: "acme",
      name: "mono",
      ref: "main",
      configText,
      mcpText,
    });
  return { t, ids, apply };
}

describe("applyEvaConfig", () => {
  test(
    "writes each app's entry and the snapshot commands",
    async () => {
      const { t, ids, apply } = await fixture();
      await apply(CONFIG);
      await t.run(async (ctx) => {
        const web = await ctx.db.get(ids.web);
        expect(web).toMatchObject({
          startupCommands: ["web-start"],
          backgroundCommands: ["web-bg"],
          stopCommands: ["web-stop"],
          devCommand: "pnpm dev",
          devPort: 5173,
        });
        expect(web?.evaConfig?.error).toBeUndefined();

        const admin = await ctx.db.get(ids.admin);
        expect(admin?.startupCommands).toEqual(["admin-start"]);
        // The file names no dev command for admin, so detection takes over.
        expect(admin?.devCommand).toBeUndefined();

        // The monorepo root is not listed: it stays Convex-managed.
        const root = await ctx.db.get(ids.root);
        expect(root?.startupCommands).toEqual(["root-old"]);
        expect(root?.evaConfig).toBeUndefined();

        const snapshot = await ctx.db.get(ids.snapshot);
        expect(snapshot?.buildCommands).toEqual(["pnpm install"]);
        expect(snapshot?.seedCommands).toBeUndefined();
      });
    },
    TIMEOUT_MS,
  );

  test(
    "a broken file keeps the last good commands and records the error",
    async () => {
      const { t, ids, apply } = await fixture();
      await apply(CONFIG);
      await apply("{ broken");
      await t.run(async (ctx) => {
        const web = await ctx.db.get(ids.web);
        expect(web?.startupCommands).toEqual(["web-start"]);
        expect(web?.evaConfig?.error).toContain(".eva/config.json");
      });
    },
    TIMEOUT_MS,
  );

  test(
    "a deleted file hands the repo back to Convex without touching commands",
    async () => {
      const { t, ids, apply } = await fixture();
      await apply(CONFIG);
      await apply(null);
      await t.run(async (ctx) => {
        const web = await ctx.db.get(ids.web);
        expect(web?.evaConfig).toBeUndefined();
        expect(web?.startupCommands).toEqual(["web-start"]);
      });
    },
    TIMEOUT_MS,
  );

  test(
    "stores MCP server summaries for the settings page",
    async () => {
      const { t, ids, apply } = await fixture();
      await apply(
        CONFIG,
        JSON.stringify({
          mcpServers: { sentry: { url: "https://mcp.sentry.dev/mcp" } },
        }),
      );
      await t.run(async (ctx) => {
        const web = await ctx.db.get(ids.web);
        expect(web?.evaConfig?.mcpServers).toEqual([
          { name: "sentry", kind: "http", target: "https://mcp.sentry.dev/mcp" },
        ]);
      });
    },
    TIMEOUT_MS,
  );
});
