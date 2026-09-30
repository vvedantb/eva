/**
 * Boat (boat.dev) public API v1, validated with Zod at the fetch boundary.
 *
 * Kept free of `"use node"` and SDK imports so the id helpers below can be used
 * from queries/mutations (routing decisions) as well as the Node provider.
 */

import { z } from "zod";

const BASE_URL = "https://boat.dev/api/v1";

/** Boat sandbox ids: `bx_` + 8 chars of Boat's alphabet. Vercel names never match. */
const BOAT_SANDBOX_ID = /^bx_[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;

/** True when a stored sandbox (or template/snapshot) id belongs to Boat. */
export function isBoatSandboxId(id: string): boolean {
  return BOAT_SANDBOX_ID.test(id);
}

/** Which provider owns an existing sandbox or snapshot id. */
export function providerForId(id: string): "vercel" | "boat" {
  return isBoatSandboxId(id) ? "boat" : "vercel";
}

/**
 * True when `ref` is a snapshot the given provider can boot from: a Vercel
 * `snap_*` id, or a Boat template sandbox id.
 */
export function isUsableSnapshotRef(
  ref: string,
  provider: "vercel" | "boat",
): boolean {
  return provider === "boat" ? isBoatSandboxId(ref) : ref.startsWith("snap_");
}

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

/** The sandbox fields the provider reads; Boat's payload is extensible and the rest is stripped. */
export const boatSandbox = z.object({
  id: z.string(),
  name: z.string(),
  state: z.string(),
  type: nullableString,
  vcpu: z.number().nullish(),
  memoryGB: z.number().nullish(),
  error: nullableString,
  url: nullableString,
  archiveAfter: nullableString,
  createdAt: nullableString,
  updatedAt: nullableString,
  snapshotAvailable: z.boolean().nullish(),
  lastSnapshotStatus: nullableString,
});
export type BoatSandbox = z.infer<typeof boatSandbox>;

export const sandboxResponse = z.object({ sandbox: boatSandbox });

export const sandboxListResponse = z.object({
  sandboxes: z.array(boatSandbox),
  pageInfo: z
    .object({
      nextCursor: z.string().nullish(),
      hasMore: z.boolean().nullish(),
    })
    .nullish(),
});

const exitCode = z
  .number()
  .nullish()
  .transform((code) => code ?? null);
const output = z
  .string()
  .nullish()
  .transform((text) => text ?? "");

export const commandResponse = z.object({
  exitCode,
  stdout: output,
  stderr: output,
  timedOut: z.boolean().nullish(),
  oomKilled: z.boolean().nullish(),
});

export const detachedResponse = z.object({ processId: z.number() });

export const commandStatusResponse = z.object({
  status: z.string(),
  running: z.boolean(),
  exitCode,
  stdout: output,
  stderr: output,
  oomKilled: z.boolean().nullish(),
});

export const hostResponse = z.object({ url: z.string() });

export const emptyResponse = z.object({});

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

export interface BoatRequestOptions {
  body?: object;
  headers?: Record<string, string>;
}

/** One authenticated Boat API call. Throws {@link BoatApiError} on `ok: false` or a non-2xx status. */
export async function boatRequest<S extends z.ZodTypeAny>(
  apiKey: string,
  schema: S,
  method: string,
  path: string,
  options: BoatRequestOptions = {},
): Promise<z.output<S>> {
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
