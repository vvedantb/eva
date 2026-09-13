"use node";

import { Client } from "pg";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { assertSafePostgresUrl } from "../_mcp/assertSafePostgresUrl";

const ENV_KEY = "POSTGRES_READ_REPLICA_URL";
const CONNECT_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 30_000;
// Keep the shaped payload well under Convex's function return size limits.
const MAX_RESULT_BYTES = 1_000_000;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// Superset of values node-postgres can produce per cell (driver rows are
// untyped, but every value it emits fits one of these shapes).
type PgValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | Date
  | Buffer
  | PgValue[]
  | { [key: string]: PgValue };

/** Converts a pg cell value into something JSON/Convex-serializable. */
function toJsonSafe(value: PgValue): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString("hex");
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === "object") {
    const out: { [key: string]: JsonValue } = {};
    for (const [key, cell] of Object.entries(value)) {
      out[key] = toJsonSafe(cell);
    }
    return out;
  }
  return value;
}

type PostgresQueryResult =
  | {
      ok: true;
      columns: string[];
      rows: JsonValue[];
      rowCount: number;
      truncated: boolean;
    }
  | {
      ok: false;
      errorCode: "missing_config" | "query_error";
      error: string;
    };

/**
 * Runs a read-only SQL query against the repo's Postgres read replica
 * (connection string from the repo's POSTGRES_READ_REPLICA_URL env var).
 *
 * Read-only enforcement (replica itself is the final guarantee):
 * - session-level default_transaction_read_only + explicit READ ONLY txn
 * - extended query protocol (values: []) rejects multi-statement SQL, so
 *   "COMMIT; INSERT ..." style escapes fail at the server
 * - fixed 30s statement_timeout (constant, never interpolated from input)
 *
 * The connection string never leaves this action; errors are returned as
 * data so the MCP tool layer can surface clean Postgres error text.
 */
export const runPostgresQuery = internalAction({
  args: {
    repoId: v.string(),
    sql: v.string(),
    maxRows: v.number(),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      columns: v.array(v.string()),
      rows: v.array(v.any()),
      rowCount: v.number(),
      truncated: v.boolean(),
    }),
    v.object({
      ok: v.literal(false),
      errorCode: v.union(v.literal("missing_config"), v.literal("query_error")),
      error: v.string(),
    }),
  ),
  handler: async (ctx, args): Promise<PostgresQueryResult> => {
    const vars: Array<{ key: string; value: string }> = await ctx.runAction(
      internal.mcp.routes.getDecryptedRepoEnvVars,
      { repoId: args.repoId },
    );
    const connEntry = vars.find((entry) => entry.key === ENV_KEY);
    if (!connEntry || connEntry.value.trim().length === 0) {
      return {
        ok: false,
        errorCode: "missing_config",
        error: `${ENV_KEY} is not set for this repo.`,
      };
    }

    try {
      await assertSafePostgresUrl(connEntry.value);
    } catch (err) {
      return {
        ok: false,
        errorCode: "query_error",
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Fresh client per request; pg honours ?sslmode=... in the URL itself.
    const client = new Client({
      connectionString: connEntry.value,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    });

    try {
      await client.connect();
      await client.query("SET default_transaction_read_only = on");
      await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      await client.query("BEGIN TRANSACTION READ ONLY");

      // values: [] forces the extended query protocol, which rejects
      // multi-statement SQL at the server.
      const result = await client.query({ text: args.sql, values: [] });

      const fields = result.fields ?? [];
      const allRows = result.rows ?? [];
      const maxRows = Math.max(0, Math.floor(args.maxRows));
      let truncated = allRows.length > maxRows;

      // Shape rows up to maxRows, then drop tail rows past the byte cap.
      const rows: JsonValue[] = [];
      let bytes = 0;
      for (const row of allRows.slice(0, maxRows)) {
        const safeRow = toJsonSafe(row);
        bytes += JSON.stringify(safeRow).length;
        if (bytes > MAX_RESULT_BYTES && rows.length > 0) {
          truncated = true;
          break;
        }
        rows.push(safeRow);
      }

      return {
        ok: true,
        columns: fields.map((field) => field.name),
        rows,
        rowCount: allRows.length,
        truncated,
      };
    } catch (err) {
      return {
        ok: false,
        errorCode: "query_error",
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      // Always roll back (read-only) and close; ignore failures on a
      // connection that may already be dead.
      await client.query("ROLLBACK").catch(() => {});
      await client.end().catch(() => {});
    }
  },
});
