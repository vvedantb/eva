import { z } from "zod";

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
  })
  .strict();

const evaConfigSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    snapshot: z
      .object({ build: commandListSchema, seed: commandListSchema })
      .strict()
      .default({}),
    apps: z.array(evaAppSchema).min(1),
  })
  .strict();

export type EvaConfig = z.infer<typeof evaConfigSchema>;
export type EvaApp = z.infer<typeof evaAppSchema>;

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

function parseJson(text: string, file: string): ParseResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid JSON";
    return { ok: false, error: `${file}: ${reason}` };
  }
}

/** Parses `.eva/config.json` text. Errors are readable, one line per issue. */
export function parseEvaConfig(text: string): ParseResult<EvaConfig> {
  const json = parseJson(text, EVA_CONFIG_PATH);
  if (!json.ok) return json;
  const parsed = evaConfigSchema.safeParse(json.value);
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

/** "./apps/web/" → "apps/web"; "." and undefined → "". */
export function normalizeAppPath(path: string | undefined): string {
  if (!path) return "";
  const trimmed = path
    .trim()
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
  return trimmed === "." ? "" : trimmed;
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

const mcpFileSchema = z.object({
  mcpServers: z.record(mcpServerSchema),
});

export type EvaMcpServerSummary = {
  name: string;
  kind: "http" | "stdio";
  /** URL for http servers, the command line for stdio servers. */
  target: string;
};

/** Eva injects these itself; repo entries with the same name are dropped. */
export const RESERVED_MCP_SERVER_NAMES = ["eva", "linear", "figma"];

/** Parses `.eva/mcp.json` into display summaries (no secrets resolved). */
export function parseEvaMcpSummary(
  text: string,
): ParseResult<EvaMcpServerSummary[]> {
  const json = parseJson(text, EVA_MCP_PATH);
  if (!json.ok) return json;
  const parsed = mcpFileSchema.safeParse(json.value);
  if (!parsed.success) {
    return {
      ok: false,
      error: `${EVA_MCP_PATH}: ${formatZodError(parsed.error)}`,
    };
  }
  const servers = Object.entries(parsed.data.mcpServers).map(
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
  return {
    seed: computeSeedFingerprint({
      build: config.snapshot.build,
      seed: config.snapshot.seed,
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
};

/**
 * Builds `.eva/config.json` text from the commands stored in Convex, so the
 * setup agent starts from the exact values a repo runs today.
 */
export function buildEvaConfigDraft(input: {
  apps: ReadonlyArray<ConvexAppCommands>;
  buildCommands?: string[];
  seedCommands?: string[];
}): string {
  const apps = input.apps
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
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return `${JSON.stringify(
    {
      version: 1,
      snapshot: {
        build: input.buildCommands ?? [],
        seed: input.seedCommands ?? [],
      },
      apps: apps.length > 0 ? apps : [{ path: "", startup: [], background: [], stop: [] }],
    },
    null,
    2,
  )}\n`;
}
