import { z } from "zod";
import { normalizePath } from "../repoUtils";

/**
 * Repo-owned run config: `.eva/config.json` and `.eva/mcp.json`.
 *
 * The file on the repo's default branch is the source of truth. Eva caches it
 * onto the existing `githubRepos` / `repoSnapshots` command fields (see
 * `sync.ts`), so every runtime reader keeps working. A session branch that
 * edits the file is detected at boot through the fingerprints below.
 *
 * Pure module: runs in the Convex isolate and in Node actions.
 */

export const EVA_CONFIG_PATH = ".eva/config.json";
export const EVA_MCP_PATH = ".eva/mcp.json";

const commandListSchema = z.array(z.string().trim().min(1)).default([]);

const snapshotCommandsSchema = z
  .object({ build: commandListSchema, seed: commandListSchema })
  .strict();

const evaAppSchema = z
  .object({
    /** Repo-relative app folder; "" for a single-app repo or the repo root. */
    path: z.string().default(""),
    dev: z
      .object({
        command: z.string().trim().min(1).optional(),
        port: z.number().int().min(1).max(65535).optional(),
      })
      .strict()
      .optional(),
    startup: commandListSchema,
    background: commandListSchema,
    /** Clean-shutdown commands; non-empty gives the app a seeded snapshot. */
    stop: commandListSchema,
    /** This app's own snapshot commands; replaces the top-level block. */
    snapshot: snapshotCommandsSchema.optional(),
  })
  .strict();

const evaConfigSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    /** Snapshot commands shared by every app without its own block. */
    snapshot: snapshotCommandsSchema.default({}),
    apps: z.array(evaAppSchema).min(1),
  })
  .strict();

export type EvaConfig = z.infer<typeof evaConfigSchema>;
export type EvaApp = z.infer<typeof evaAppSchema>;
export type EvaSnapshotCommands = z.infer<typeof snapshotCommandsSchema>;

/** The snapshot build/seed commands that apply to one app. */
export function appSnapshotCommands(
  config: EvaConfig,
  app: EvaApp | null,
): EvaSnapshotCommands {
  return app?.snapshot ?? config.snapshot;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const at = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${at}: ${issue.message}`;
    })
    .join("; ");
}

/** JSON text → schema, as one Zod pipeline (no untyped intermediate value). */
function jsonText<T extends z.ZodTypeAny>(schema: T) {
  return z
    .string()
    .transform((text, ctx) => {
      try {
        return JSON.parse(text);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : "invalid JSON",
        });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

const evaConfigTextSchema = jsonText(evaConfigSchema);

/** Parses `.eva/config.json` text. Errors are readable, one line per issue. */
export function parseEvaConfig(text: string): ParseResult<EvaConfig> {
  const parsed = evaConfigTextSchema.safeParse(text);
  if (!parsed.success) {
    return {
      ok: false,
      error: `${EVA_CONFIG_PATH}: ${formatZodError(parsed.error)}`,
    };
  }
  const paths = parsed.data.apps.map((app) => normalizeAppPath(app.path));
  const duplicate = paths.find((path, i) => paths.indexOf(path) !== i);
  if (duplicate !== undefined) {
    return {
      ok: false,
      error: `${EVA_CONFIG_PATH}: apps: duplicate path "${duplicate}"`,
    };
  }
  return { ok: true, value: parsed.data };
}

/**
 * Same normalisation as `githubRepos.rootDirectory` (normalizePath), plus the
 * "./" spellings: "./apps/web/" → "apps/web"; ".", "/" and undefined → "".
 */
export function normalizeAppPath(path: string | undefined): string {
  if (!path) return "";
  const withoutDot = path.trim().replace(/^\.(?:\/+|$)/, "");
  return normalizePath(withoutDot) ?? "";
}

/** The app entry for a `githubRepos.rootDirectory`, or null. */
export function findEvaApp(
  config: EvaConfig,
  rootDirectory: string | undefined,
): EvaApp | null {
  const target = normalizeAppPath(rootDirectory);
  return (
    config.apps.find((app) => normalizeAppPath(app.path) === target) ?? null
  );
}

// ---------------------------------------------------------------------------
// MCP servers (display only — the sandbox callback reads the file itself)
// ---------------------------------------------------------------------------

const mcpServerSchema = z.union([
  z.object({
    type: z.enum(["http", "sse"]).optional(),
    url: z.string().min(1),
  }),
  z.object({
    type: z.literal("stdio").optional(),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
  }),
]);

const mcpFileTextSchema = jsonText(
  z.object({ mcpServers: z.record(mcpServerSchema) }),
);

export type EvaMcpServerSummary = {
  name: string;
  kind: "http" | "stdio";
  /** URL for http servers, the command line for stdio servers. */
  target: string;
};

/**
 * Eva injects these itself; the sandbox callback drops repo entries with the
 * same name (`callback-src/evaMcp.ts` keeps its own copy — no shared import).
 */
const RESERVED_MCP_SERVER_NAMES = new Set(["eva", "linear", "figma"]);

/** Parses `.eva/mcp.json` into display summaries (no secrets resolved). */
export function parseEvaMcpSummary(
  text: string,
): ParseResult<EvaMcpServerSummary[]> {
  const parsed = mcpFileTextSchema.safeParse(text);
  if (!parsed.success) {
    return {
      ok: false,
      error: `${EVA_MCP_PATH}: ${formatZodError(parsed.error)}`,
    };
  }
  const servers = Object.entries(parsed.data.mcpServers)
    .filter(([name]) => !RESERVED_MCP_SERVER_NAMES.has(name))
    .map(
    ([name, server]): EvaMcpServerSummary =>
      "url" in server
        ? { name, kind: "http", target: server.url }
        : {
            name,
            kind: "stdio",
            target: [server.command, ...(server.args ?? [])].join(" "),
          },
  );
  return { ok: true, value: servers };
}

// ---------------------------------------------------------------------------
// Fingerprints
// ---------------------------------------------------------------------------

/** djb2 — deterministic and dependency-free (isolates cannot use node:crypto). */
function hashPayload(payload: string): string {
  let hash = 5381;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 33) ^ payload.charCodeAt(i);
  }
  return `fp-${(hash >>> 0).toString(36)}-${payload.length}`;
}

/**
 * Inputs that shape a seeded snapshot's data. A branch whose value differs
 * from the snapshot's cannot boot from it: the seeded DB was built by other
 * commands.
 */
export function computeSeedFingerprint(input: {
  build: ReadonlyArray<string>;
  seed: ReadonlyArray<string>;
  background: ReadonlyArray<string>;
  stop: ReadonlyArray<string>;
}): string {
  return hashPayload(
    JSON.stringify({
      build: input.build,
      seed: input.seed,
      background: input.background,
      stop: input.stop,
    }),
  );
}

/**
 * Startup commands. Written into the startup marker so a sandbox reruns them
 * when the branch's startup commands differ from the ones that last ran.
 */
export function computeStartupFingerprint(
  startup: ReadonlyArray<string>,
): string {
  return hashPayload(JSON.stringify({ startup }));
}

export function evaAppFingerprints(
  config: EvaConfig,
  app: EvaApp,
): { seed: string; startup: string } {
  const snapshot = appSnapshotCommands(config, app);
  return {
    seed: computeSeedFingerprint({
      build: snapshot.build,
      seed: snapshot.seed,
      background: app.background,
      stop: app.stop,
    }),
    startup: computeStartupFingerprint(app.startup),
  };
}

// ---------------------------------------------------------------------------
// Draft from today's Convex fields (migration)
// ---------------------------------------------------------------------------

export type ConvexAppCommands = {
  rootDirectory?: string;
  devCommand?: string;
  devPort?: number;
  startupCommands?: string[];
  backgroundCommands?: string[];
  stopCommands?: string[];
  /** This app's own snapshot config commands, when it has one. */
  buildCommands?: string[];
  seedCommands?: string[];
};

/**
 * Builds `.eva/config.json` text from the commands stored in Convex, so the
 * setup agent starts from the exact values a repo runs today. Snapshot
 * commands are per app in Convex, so each app keeps its own block.
 */
export function buildEvaConfigDraft(
  apps: ReadonlyArray<ConvexAppCommands>,
): string {
  const entries = apps
    .map((app) => ({
      path: normalizeAppPath(app.rootDirectory),
      ...(app.devCommand || app.devPort
        ? {
            dev: {
              ...(app.devCommand ? { command: app.devCommand } : {}),
              ...(app.devPort ? { port: app.devPort } : {}),
            },
          }
        : {}),
      startup: app.startupCommands ?? [],
      background: app.backgroundCommands ?? [],
      stop: app.stopCommands ?? [],
      ...(app.buildCommands?.length || app.seedCommands?.length
        ? {
            snapshot: {
              build: app.buildCommands ?? [],
              seed: app.seedCommands ?? [],
            },
          }
        : {}),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return `${JSON.stringify(
    {
      version: 1,
      apps:
        entries.length > 0
          ? entries
          : [{ path: "", startup: [], background: [], stop: [] }],
    },
    null,
    2,
  )}\n`;
}
