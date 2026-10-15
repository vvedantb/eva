"use client";

import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api, type Id, type SandboxOwner } from "@eva/backend";
import {
  previewToolCallError,
  requestWebMcp,
  toPreviewToolCallOutcome,
  toWebMcpRequest,
  type PreviewToolCallOutcome,
  type PreviewToolCallRow,
} from "@/lib/components/sandbox/previewWebMcp";

/** Under the backend's 40 s wait, so the agent sees our error, not its own. */
const PREVIEW_TOOL_CALL_TIMEOUT_MS = 30_000;

export type PreviewToolCallParentId =
  | Id<"sessions">
  | Id<"projects">
  | Id<"agentTasks">;

export function sandboxOwnerParentId(
  owner: SandboxOwner,
): PreviewToolCallParentId {
  if (owner.kind === "session") return owner.sessionId;
  if (owner.kind === "task") return owner.taskId;
  return owner.projectId;
}

/** One id per browser tab: the backend's claim election is between tabs. */
const TAB_CLIENT_ID = crypto.randomUUID();

/**
 * Rows this tab has already started. Every preview pane of a chat mounts an
 * executor and they all see the same pending rows, so the first one to reach
 * a row takes it for the whole tab.
 */
const startedCallIds = new Set<Id<"previewToolCalls">>();

/**
 * Runs the coding agent's `call_preview_tool` / `list_preview_tools` requests
 * inside this chat's live preview. The sandbox cannot reach the page, so the
 * backend queues each call and an open Eva tab claims it, relays it over the
 * iframe bridge and writes the result back. Renders nothing visible.
 */
export function PreviewToolCallExecutor({
  parentId,
  iframeElement,
}: {
  parentId: PreviewToolCallParentId;
  iframeElement: HTMLIFrameElement | null;
}) {
  const pending = useQuery(api.previewToolCalls.listPending, { parentId });
  const claim = useMutation(api.previewToolCalls.claim);
  const complete = useMutation(api.previewToolCalls.complete);

  async function run(
    id: Id<"previewToolCalls">,
    row: PreviewToolCallRow,
    frame: HTMLIFrameElement,
  ) {
    // A pane whose iframe has no document yet leaves the row for one that does.
    const target = frame.contentWindow;
    if (!target || startedCallIds.has(id)) return;
    startedCallIds.add(id);
    const won = await claim({ id, clientId: TAB_CLIENT_ID });
    if (!won) return;
    const outcome = await execute(row, target);
    await complete({ id, clientId: TAB_CLIENT_ID, ...outcome });
  }

  // Without an iframe there is nothing to run against, so no anchors mount and
  // nothing is claimed. When the element arrives the anchors mount fresh.
  if (!iframeElement || !pending) return null;

  return (
    <>
      {pending.map((row) => (
        // Anchor per pending row: the ref callback runs once when the row first
        // appears — the effect-free equivalent of a mount effect, since
        // useEffect is banned here. `startedCallIds` makes re-runs no-ops.
        <span
          hidden
          key={row._id}
          ref={(node) => {
            if (!node) return;
            void run(row._id, row, iframeElement).catch((error) => {
              console.error("Preview tool call failed:", error);
            });
          }}
        />
      ))}
    </>
  );
}

async function execute(
  row: PreviewToolCallRow,
  target: Window,
): Promise<PreviewToolCallOutcome> {
  const parsed = toWebMcpRequest(row);
  if (!parsed.ok) return previewToolCallError(parsed.error);
  try {
    const inbound = await requestWebMcp(
      target,
      parsed.request,
      PREVIEW_TOOL_CALL_TIMEOUT_MS,
    );
    return toPreviewToolCallOutcome(inbound);
  } catch (error) {
    return previewToolCallError(
      error instanceof Error ? error.message : "The preview did not answer",
    );
  }
}
