import dayjs from "@eva/shared/dates";
import { formatDurationMsShort } from "@eva/shared/duration";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";
import { formatCost, labelFor, parseResultEvent } from "../_utils";

interface LogCompletionRowProps {
  title: string;
  createdAt: number;
  rawResultEvent: string | undefined;
  /** When set, the entity kind is included in the meta line (project view). */
  entityType?: string;
}

/** One completion inside a logs list section: title, quiet meta, cost. */
export function LogCompletionRow({
  title,
  createdAt,
  rawResultEvent,
  entityType,
}: LogCompletionRowProps) {
  const event = parseResultEvent(rawResultEvent);
  const meta: string[] = [];
  if (entityType) meta.push(labelFor(entityType));
  if (event.model !== "-") meta.push(event.model);
  if (event.durationMs > 0) {
    meta.push(formatDurationMsShort(event.durationMs));
  }
  meta.push(dayjs(createdAt).format("D MMM, HH:mm"));

  return (
    <SettingsToggleRow
      title={title}
      description={meta.join(" · ")}
      action={
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatCost(event.costUsd)}
        </span>
      }
    />
  );
}
