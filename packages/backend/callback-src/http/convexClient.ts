import {
  CALLBACK_HTTP_MAX_RETRIES,
  CALLBACK_HTTP_RETRY_BASE_MS,
  CALLBACK_HTTP_TIMEOUT_MS,
  CONVEX_SITE_URL,
  CONVEX_TOKEN,
  CONVEX_URL,
  HARNESS_CATALOG_SANDBOX_ID,
  HARNESS_CATALOG_TOKEN,
  REPO_ID,
  STREAMING_HMAC,
  STREAMING_HEARTBEAT_MAX_RETRIES,
} from "../config.js";
import type { ConvexCallType, JsonObject, JsonValue } from "../types.js";
import { readResponseJson } from "../utils.js";
import {
  getCurrentTurnLease,
  noteHeartbeatResponse,
} from "../runtime/turnLease.js";

function appendTurnLease(body: URLSearchParams): void {
  const identity = getCurrentTurnLease();
  if (identity === null) return;
  body.set("turnId", identity.turnId);
  body.set("leaseGeneration", String(identity.leaseGeneration));
}

/** Wraps fetch with an AbortController timeout. */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = CALLBACK_HTTP_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Calculates exponential backoff delay with jitter for retry attempts. */
function buildRetryDelayMs(attempt: number): number {
  const exponential = Math.pow(2, attempt - 1) * CALLBACK_HTTP_RETRY_BASE_MS;
  const jitter = Math.floor(Math.random() * 500);
  return exponential + jitter;
}

/** Runs an HTTP callback, retrying with exponential backoff on failure. */
async function withRetries<T>(
  label: string,
  maxRetries: number,
  run: () => Promise<T>,
  shouldRetry: (error: Error) => boolean = () => true,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await run();
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      attempt++;
      if (attempt > maxRetries || !shouldRetry(error)) throw e;
      const delayMs = buildRetryDelayMs(attempt);
      console.error(
        label +
          " attempt " +
          attempt +
          " failed, retrying in " +
          delayMs +
          "ms:",
        String(e),
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export class HttpResponseError extends Error {
  readonly status: number;

  constructor(label: string, status: number, body: string) {
    super(label + " failed: " + status + " " + body);
    this.name = "HttpResponseError";
    this.status = status;
  }
}

/** Network failures and server errors may recover; deterministic 4xx do not. */
export function shouldRetryHttpError(error: Error): boolean {
  return !(error instanceof HttpResponseError) || error.status >= 500;
}

/**
 * POSTs a signed form body to a Convex HTTP route. The routes authenticate the
 * scoped HMAC in the body, not the sandbox's Convex identity token.
 */
async function postSignedForm(
  url: string,
  body: URLSearchParams,
  label: string,
): Promise<string> {
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new HttpResponseError(label, res.status, text);
  }
  return res.text();
}

/** Calls a Convex mutation or action via HTTP API. */
async function callConvex(
  type: ConvexCallType,
  path: string,
  args: JsonObject,
): Promise<JsonValue> {
  const endpoint = type === "mutation" ? "/api/mutation" : "/api/action";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (CONVEX_TOKEN) headers["Authorization"] = "Bearer " + CONVEX_TOKEN;
  const res = await fetchWithTimeout(CONVEX_URL + endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ path, args, format: "json" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      "Convex " + type + " " + path + " failed: " + res.status + " " + text,
    );
  }
  return (await readResponseJson(res)) ?? null;
}

/** Calls Convex with automatic retry on failure. */
export async function callConvexWithRetry(
  type: ConvexCallType,
  path: string,
  args: JsonObject,
  maxRetries: number = CALLBACK_HTTP_MAX_RETRIES,
): Promise<JsonValue> {
  return await withRetries("callConvex(" + type + ")", maxRetries, () =>
    callConvex(type, path, args),
  );
}

/** One built-in slash command as the harness CLI describes it. */
export interface HarnessCommandReport {
  name: string;
  description: string;
  argumentHint?: string;
}

/**
 * Reports the harness CLI's built-in slash-command catalog. Returns null when
 * the launcher injected no signature (older backend, or no ENCRYPTION_KEY) —
 * the catalog is a nicety, so an unsigned daemon simply does not report.
 */
export async function callHarnessSkillCatalogReport(
  provider: string,
  cliVersion: string,
  skills: readonly HarnessCommandReport[],
): Promise<string | null> {
  if (
    !CONVEX_SITE_URL ||
    !HARNESS_CATALOG_TOKEN ||
    !HARNESS_CATALOG_SANDBOX_ID ||
    !REPO_ID
  ) {
    return null;
  }
  const url = CONVEX_SITE_URL + "/api/harness-skills/report";
  const body = new URLSearchParams();
  body.set("provider", provider);
  body.set("cliVersion", cliVersion);
  body.set("skills", JSON.stringify(skills));
  body.set("token", HARNESS_CATALOG_TOKEN);
  body.set("sandboxId", HARNESS_CATALOG_SANDBOX_ID);
  body.set("repoId", REPO_ID);
  return await withRetries(
    "harness skill catalog report",
    CALLBACK_HTTP_MAX_RETRIES,
    () => postSignedForm(url, body, "Harness skill catalog report"),
    shouldRetryHttpError,
  );
}

/** Lightweight heartbeat that only bumps streamingActivity.lastUpdatedAt in Convex. */
async function callStreamingHeartbeatTouchOnce(
  entityId: string,
): Promise<string | JsonValue> {
  if (CONVEX_SITE_URL && STREAMING_HMAC) {
    const body = new URLSearchParams();
    body.set("entityId", entityId);
    body.set("hmac", STREAMING_HMAC);
    body.set("touchOnly", "1");
    appendTurnLease(body);
    const response = await postSignedForm(
      CONVEX_SITE_URL + "/api/streaming/heartbeat",
      body,
      "Streaming heartbeat touch",
    );
    noteHeartbeatResponse(response);
    return response;
  }

  const identity = getCurrentTurnLease();
  const response =
    identity === null
      ? await callConvex("mutation", "turns:legacyHeartbeatFromCallback", {
          entityId,
          touchOnly: true,
        })
      : await callConvex("mutation", "turns:heartbeatFromCallback", {
          entityId,
          touchOnly: true,
          turnId: identity.turnId,
          leaseGeneration: identity.leaseGeneration,
        });
  noteHeartbeatResponse(response);
  return response;
}

/** Sends one streaming heartbeat request through the scoped HMAC endpoint or legacy mutation fallback. */
async function callStreamingHeartbeatOnce(
  entityId: string,
  currentActivity: string,
  currentContent: string,
  pendingQuestion?: string,
): Promise<string | JsonValue> {
  if (CONVEX_SITE_URL && STREAMING_HMAC) {
    const body = new URLSearchParams();
    body.set("entityId", entityId);
    body.set("hmac", STREAMING_HMAC);
    body.set("currentActivity", currentActivity);
    body.set("currentContent", currentContent || "");
    appendTurnLease(body);
    if (pendingQuestion) {
      body.set("pendingQuestion", pendingQuestion);
    }
    const response = await postSignedForm(
      CONVEX_SITE_URL + "/api/streaming/heartbeat",
      body,
      "Streaming heartbeat",
    );
    noteHeartbeatResponse(response);
    return response;
  }

  const args: JsonObject = {
    entityId,
    touchOnly: false,
    currentActivity,
    currentContent,
  };
  if (pendingQuestion) {
    args.pendingQuestion = pendingQuestion;
  }
  const identity = getCurrentTurnLease();
  const path =
    identity === null
      ? "turns:legacyHeartbeatFromCallback"
      : "turns:heartbeatFromCallback";
  if (identity !== null) {
    args.turnId = identity.turnId;
    args.leaseGeneration = identity.leaseGeneration;
  }
  const response = await callConvex("mutation", path, args);
  noteHeartbeatResponse(response);
  return response;
}

/** Sends a streaming heartbeat update with current activity and content. */
export async function callStreamingHeartbeat(
  entityId: string,
  currentActivity: string,
  currentContent: string,
  pendingQuestion?: string,
): Promise<string | JsonValue> {
  return await withRetries(
    "streaming heartbeat",
    STREAMING_HEARTBEAT_MAX_RETRIES,
    () =>
      callStreamingHeartbeatOnce(
        entityId,
        currentActivity,
        currentContent,
        pendingQuestion,
      ),
  );
}

/**
 * Convex `/api/mutation` wraps returns in `{ status, value }`. Readers accept
 * either that envelope or a bare object so older/unwrapped fixtures still work.
 */
export function unwrapConvexMutationPayload(
  result: JsonValue,
): JsonObject | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }
  const inner = result.value;
  return typeof inner === "object" && inner !== null && !Array.isArray(inner)
    ? inner
    : result;
}

/** Retries a lightweight touch heartbeat (no activity payload). */
export async function callStreamingHeartbeatTouch(
  entityId: string,
): Promise<string | JsonValue> {
  return await withRetries(
    "streaming heartbeat touch",
    STREAMING_HEARTBEAT_MAX_RETRIES,
    () => callStreamingHeartbeatTouchOnce(entityId),
  );
}
