import { z } from "zod";
import { env } from "./_generated/server";

const BASE_URL = "https://boat.dev/api/v1";

export class BoatApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(`Boat API ${status} ${code}: ${message}`);
    this.name = "BoatApiError";
  }
}

const nullableString = z.string().nullish();

/** Boat's sandbox payload is extensible; Zod strips it to exactly the fields `sandboxInfo` stores. */
export const boatSandbox = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  type: nullableString.transform((type) => type ?? undefined),
  url: nullableString,
  ip: nullableString,
  subdomain: nullableString,
  archiveAfter: nullableString,
  createdAt: nullableString,
  updatedAt: nullableString,
  snapshotAvailable: z.boolean().optional(),
  snapshotCompletedAt: nullableString,
  setupStatus: nullableString,
  setupError: nullableString,
});
export type BoatSandbox = z.infer<typeof boatSandbox>;

export const sandboxResponse = z.object({ sandbox: boatSandbox });

const errorBody = z.object({
  ok: z.boolean().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
  error: z
    .object({ code: z.string().optional(), message: z.string().optional() })
    .optional(),
});

/** Parses a response body as JSON, reporting non-JSON (a proxy's HTML 502) as a schema issue. */
const json = z.string().transform((text, ctx) => {
  try {
    return JSON.parse(text === "" ? "{}" : text);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: text.slice(0, 500) });
    return z.NEVER;
  }
});

/** Calls the Boat public API. Reads the key per call: module scope runs at deploy analysis, where env is unset. */
export async function boat<S extends z.ZodTypeAny>(
  schema: S,
  method: string,
  path: string,
  options: { body?: object; headers?: Record<string, string> } = {},
): Promise<z.output<S>> {
  const apiKey = env.BOAT_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    throw new Error(
      "BOAT_API_KEY is not set on this deployment: npx convex env set BOAT_API_KEY boat_...",
    );
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const envelope = json.pipe(errorBody).safeParse(text);
  const body = envelope.success ? envelope.data : {};
  // Every v1 response carries `ok`; a failure is `ok: false` whatever the status.
  if (!response.ok || body.ok === false) {
    throw new BoatApiError(
      response.status,
      body.code ?? body.error?.code ?? "boat_api_error",
      body.message ?? body.error?.message ?? response.statusText,
    );
  }
  return json.pipe(schema).parse(text);
}

export const sandboxPath = (sandboxId: string, suffix = "") =>
  `/sandboxes/${encodeURIComponent(sandboxId)}${suffix}`;

/** States a sandbox passes through on its way to a settled one. */
export const TRANSITIONAL = new Set([
  "creating",
  "init",
  "provisioning",
  "provisioned",
  "cloning",
  "archiving",
]);

export function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    2_000,
  );
}
