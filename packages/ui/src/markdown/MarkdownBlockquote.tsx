import type { ComponentProps } from "react";
import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconBulb,
  IconInfoCircle,
  IconMessageReport,
} from "@tabler/icons-react";
import type { ExtraProps } from "streamdown";

import type { AlertKind } from "./rehypeGithubAlerts";
import { isAlertKind } from "./rehypeGithubAlerts";

const ALERTS: Record<AlertKind, { label: string; Icon: typeof IconInfoCircle }> = {
  note: { label: "Note", Icon: IconInfoCircle },
  tip: { label: "Tip", Icon: IconBulb },
  important: { label: "Important", Icon: IconMessageReport },
  warning: { label: "Warning", Icon: IconAlertTriangle },
  caution: { label: "Caution", Icon: IconAlertOctagon },
};

/**
 * `blockquote` renderer. Alerts tagged by `rehypeGithubAlerts` become a tinted
 * callout with an icon and title; a plain quote stays a quote. The callout is
 * a `div role="note"`, not a `blockquote`, so quote styling never mutes it.
 */
export function MarkdownBlockquote({
  children,
  node,
}: ComponentProps<"blockquote"> & ExtraProps) {
  const kind = node?.properties.dataAlert;
  if (typeof kind !== "string" || !isAlertKind(kind)) {
    return <blockquote>{children}</blockquote>;
  }
  const { label, Icon } = ALERTS[kind];
  return (
    <div role="note" className="markdown-alert" data-alert={kind}>
      <p className="markdown-alert-title" data-markdown-copy={`[!${kind.toUpperCase()}]`}>
        <Icon aria-hidden />
        {label}
      </p>
      {children}
    </div>
  );
}
