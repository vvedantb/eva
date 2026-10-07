"use client";

import { motionFast, Surface } from "@eva/ui";
import { m } from "motion/react";
import { parseChatUiSpec } from "@eva/shared/generativeUi";
import { ChatUiSpecRenderer } from "@/lib/components/chat/generativeUi/renderer";

interface ChatUiPanelProps {
  /** The stored json-render spec, still serialised. */
  spec: string;
  /**
   * Posts a button's text back into the chat. Undefined when the chat cannot
   * send right now (archived, or the sandbox is asleep), which is what makes
   * the panel's buttons inert rather than silently swallowing the press.
   */
  onReply?: (message: string) => void;
}

/**
 * The composer already rejects anything that is not http(s), but a stored spec
 * is data and `window.open("javascript:…")` would run it, so the scheme is
 * checked again at the point of use.
 */
function isSafeHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * One agent-composed panel in the transcript.
 *
 * The spec is re-parsed here rather than trusted: it was composed on the
 * server against the catalog, but it arrives as a string and a row written by
 * an older catalog must degrade to nothing rather than to a broken card.
 */
export function ChatUiPanel({ spec, onReply }: ChatUiPanelProps) {
  const parsed = parseChatUiSpec(spec);
  if (!parsed) return null;

  const handleAction = (
    actionName: string,
    params?: Record<string, unknown>,
  ) => {
    if (actionName === "reply") {
      const message = params?.message;
      if (onReply && typeof message === "string") onReply(message);
      return;
    }
    if (actionName === "open_url") {
      const url = params?.url;
      if (typeof url === "string" && isSafeHttpUrl(url)) {
        window.open(url, "_blank", "noopener");
      }
    }
  };

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionFast}
    >
      <Surface
        density="tight"
        className="min-w-0 max-w-full"
        data-testid="chat-ui-panel"
      >
        {/* `display: contents` keeps the fieldset out of the layout while its
            disabled state still reaches every button inside the spec. */}
        <fieldset className="contents" disabled={onReply === undefined}>
          <ChatUiSpecRenderer spec={parsed} onAction={handleAction} />
        </fieldset>
      </Surface>
    </m.div>
  );
}
