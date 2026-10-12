import { useEffect } from "react";
import type { RefObject } from "react";
import { useAction, useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { z } from "zod";
import { api } from "@eva/backend";
import type { Id } from "@eva/backend";

// Messages the sandboxed artifact may post. Parsed at the boundary: the frame
// runs untrusted code, so anything that does not match is ignored.
const stateScope = z.enum(["user", "shared"]);
const bridgeMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("eva-bridge-hello") }),
  z.object({
    type: z.literal("eva-mcp-call"),
    id: z.number(),
    name: z.string(),
    // JSON text: the shim serialises the args, and callTool parses them per tool.
    args: z.string(),
  }),
  z.object({
    type: z.literal("eva-state-set"),
    id: z.number(),
    scope: stateScope,
    key: z.string(),
    value: z.string(),
  }),
  z.object({
    type: z.literal("eva-state-remove"),
    id: z.number(),
    scope: stateScope,
    key: z.string(),
  }),
]);
type StateScope = z.infer<typeof stateScope>;
type BridgeMessage = z.infer<typeof bridgeMessage>;

/** Patches the live state snapshot so the frame sees its own write at once. */
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
  localStore.setQuery(
    api.artifactState.list,
    { artifactId },
    {
      ...current,
      [scope]: value === null ? rest : [...rest, { key, value }],
    },
  );
}

/**
 * Parent-side half of the artifact bridge. Listens for messages from the
 * sandboxed artifact iframe:
 *  - "eva-bridge-hello": the shim announcing it is ready; we reply
 *    "eva-bridge-ready" (so it flushes queued calls) plus the current state.
 *  - "eva-mcp-call": a tool call, run through eva's read-only MCP tools as the
 *    signed-in user (api.artifacts.callTool).
 *  - "eva-state-set" / "eva-state-remove": writes to the artifact's persistent
 *    state (api.artifactState).
 * Every request is answered with "eva-result" by id. The live state snapshot
 * is pushed as "eva-state-snapshot" whenever it changes, so writes from other
 * viewers reach the frame too.
 * Messages are accepted only from this iframe's own contentWindow (the sandboxed
 * frame is an opaque origin, so we match by source, not origin).
 */
export function useArtifactBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  artifactId: Id<"artifacts">,
): void {
  const callTool = useAction(api.artifacts.callTool);
  const setState = useMutation(api.artifactState.set).withOptimisticUpdate(
    (localStore, args) =>
      patchStateSnapshot(
        localStore,
        args.artifactId,
        args.scope,
        args.key,
        args.value,
      ),
  );
  const removeState = useMutation(
    api.artifactState.remove,
  ).withOptimisticUpdate((localStore, args) =>
    patchStateSnapshot(localStore, args.artifactId, args.scope, args.key, null),
  );
  const snapshot = useQuery(api.artifactState.list, { artifactId });

  // Push each new snapshot into the frame. Before the frame's shim is up the
  // post is dropped; the hello handler below re-sends it.
  useEffect(() => {
    if (!snapshot) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "eva-state-snapshot", ...snapshot },
      "*",
    );
  }, [snapshot, iframeRef]);

  useEffect(() => {
    // Runs one request. State writes resolve to null; the frame reads the new
    // value from the next snapshot.
    function run(message: Exclude<BridgeMessage, { type: "eva-bridge-hello" }>) {
      switch (message.type) {
        case "eva-mcp-call":
          return callTool({ toolName: message.name, args: message.args });
        case "eva-state-set":
          return setState({
            artifactId,
            scope: message.scope,
            key: message.key,
            value: message.value,
          });
        case "eva-state-remove":
          return removeState({
            artifactId,
            scope: message.scope,
            key: message.key,
          });
      }
    }

    async function handle(event: MessageEvent) {
      const target = iframeRef.current?.contentWindow;
      if (!target || event.source !== target) return;
      const parsed = bridgeMessage.safeParse(event.data);
      if (!parsed.success) return;
      const message = parsed.data;

      if (message.type === "eva-bridge-hello") {
        target.postMessage({ type: "eva-bridge-ready" }, "*");
        if (snapshot) {
          target.postMessage({ type: "eva-state-snapshot", ...snapshot }, "*");
        }
        return;
      }

      const { id } = message;
      try {
        const result = await run(message);
        target.postMessage({ type: "eva-result", id, result }, "*");
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        target.postMessage({ type: "eva-result", id, error }, "*");
      }
    }

    function listener(event: MessageEvent) {
      void handle(event);
    }
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [artifactId, callTool, iframeRef, removeState, setState, snapshot]);
}
