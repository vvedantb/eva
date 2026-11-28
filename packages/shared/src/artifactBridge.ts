import { api, ARTIFACT_STATE_SCOPES, type Id } from "@eva/backend";
import type { OptimisticLocalStore } from "convex/browser";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, type RefObject } from "react";
import { z } from "zod";

export { buildArtifactSrcDoc } from "./artifactShim";

const stateScope = z.enum(ARTIFACT_STATE_SCOPES);
const bridgeMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("eva-bridge-hello") }),
  z.object({
    type: z.literal("eva-mcp-call"),
    id: z.number(),
    name: z.string(),
    args: z.string(),
  }),
  z.object({ type: z.literal("eva-state-set"), id: z.number(), scope: stateScope, key: z.string(), value: z.string() }),
  z.object({ type: z.literal("eva-state-remove"), id: z.number(), scope: stateScope, key: z.string() }),
]);
type StateScope = z.infer<typeof stateScope>;
type BridgeRequest = Exclude<z.infer<typeof bridgeMessage>, { type: "eva-bridge-hello" }>;

/** Where the host's replies go: the web iframe's window, or the phone's `HtmlView` handle. Takes JSON text. */
export type ArtifactBridgeTarget = { postMessage: (json: string) => void };

function parseBridgeMessage(data: unknown) {
  if (typeof data !== "string") return bridgeMessage.safeParse(data);
  try {
    return bridgeMessage.safeParse(JSON.parse(data));
  } catch {
    return null;
  }
}

function patchStateSnapshot(
  localStore: OptimisticLocalStore,
  artifactId: Id<"artifacts">,
  scope: StateScope,
  key: string,
  value: string | null,
) {
  const current = localStore.getQuery(api.artifactState.list, { artifactId });
  if (!current) return;
  const rest = current[scope].filter((entry) => entry.key !== key);
  localStore.setQuery(api.artifactState.list, { artifactId }, {
    ...current,
    [scope]: value === null ? rest : [...rest, { key, value }],
  });
}

/**
 * The host half of the artifact bridge, for the web iframe and the phone
 * WebView alike. Pass each message the page posts to the returned `onMessage`:
 *  - "eva-bridge-hello": the shim announcing it is ready; the host replies
 *    "eva-bridge-ready" (so it flushes queued calls) and the current state.
 *  - "eva-mcp-call": a tool call, run through eva's read-only MCP tools as the
 *    signed-in user (`artifacts.callTool`).
 *  - "eva-state-set" / "eva-state-remove": writes to the artifact's persistent
 *    state (`artifactState`).
 * Every request is answered with "eva-result" by id. The live state snapshot
 * is pushed as "eva-state-snapshot" whenever it changes, so writes from other
 * viewers reach the page too. The caller makes sure messages come from its
 * own page (the web matches the iframe's window; a WebView has only its own).
 */
export function useArtifactBridge(artifactId: Id<"artifacts">, target: RefObject<ArtifactBridgeTarget | null>) {
  const callTool = useAction(api.artifacts.callTool);
  const setState = useMutation(api.artifactState.set).withOptimisticUpdate((localStore, args) =>
    patchStateSnapshot(localStore, args.artifactId, args.scope, args.key, args.value),
  );
  const removeState = useMutation(api.artifactState.remove).withOptimisticUpdate((localStore, args) =>
    patchStateSnapshot(localStore, args.artifactId, args.scope, args.key, null),
  );
  const snapshot = useQuery(api.artifactState.list, { artifactId });

  const post = (message: object) => target.current?.postMessage(JSON.stringify(message));

  useEffect(() => {
    if (snapshot) target.current?.postMessage(JSON.stringify({ type: "eva-state-snapshot", ...snapshot }));
  }, [snapshot, target]);

  const run = (message: BridgeRequest) => {
    switch (message.type) {
      case "eva-mcp-call":
        return callTool({ toolName: message.name, args: message.args });
      case "eva-state-set":
        return setState({ artifactId, scope: message.scope, key: message.key, value: message.value });
      case "eva-state-remove":
        return removeState({ artifactId, scope: message.scope, key: message.key });
    }
  };

  const handle = async (data: unknown) => {
    const parsed = parseBridgeMessage(data);
    if (!parsed?.success) return;
    const message = parsed.data;
    if (message.type === "eva-bridge-hello") {
      post({ type: "eva-bridge-ready" });
      if (snapshot) post({ type: "eva-state-snapshot", ...snapshot });
      return;
    }
    try {
      post({ type: "eva-result", id: message.id, result: await run(message) });
    } catch (err) {
      post({ type: "eva-result", id: message.id, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const onMessage = (data: unknown) => {
    void handle(data);
  };
  return { onMessage };
}

type ArtifactHtmlResult = { ok: true; html: string } | { ok: false; error: string };
const artifactHtmlCache = new Map<string, Promise<ArtifactHtmlResult>>();

/** An artifact's stored HTML from its signed URL, fetched once per URL (for React's `use`). */
export function loadArtifactHtml(url: string): Promise<ArtifactHtmlResult> {
  const cached = artifactHtmlCache.get(url);
  if (cached) return cached;
  const promise = fetch(url)
    .then(async (response): Promise<ArtifactHtmlResult> =>
      response.ok
        ? { ok: true, html: await response.text() }
        : { ok: false, error: `Failed to load artifact (status ${response.status})` },
    )
    .catch((error: unknown): ArtifactHtmlResult => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  artifactHtmlCache.set(url, promise);
  return promise;
}
