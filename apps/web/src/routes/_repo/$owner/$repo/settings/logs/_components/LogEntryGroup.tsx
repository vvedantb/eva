import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { formatCost, labelFor } from "../_utils";
import { LogCompletionRow } from "./LogCompletionRow";

type LogEntry = FunctionReturnType<typeof api.logs.listByRepo>[number];

interface LogEntryGroupProps {
  type: string;
  logs: LogEntry[];
  total: number;
}

/** One entity-type group: caption on the canvas, completions in a list card. */
export function LogEntryGroup({ type, logs, total }: LogEntryGroupProps) {
  const countLabel =
    logs.length === 1 ? "1 completion" : `${logs.length} completions`;

  return (
    <SettingsSection
      title={labelFor(type)}
      description={countLabel}
      action={
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatCost(total)}
        </span>
      }
      bodyVariant="list"
    >
      {logs.map((log, index) => (
        <ListEnter key={log._id} index={index} fast>
          <LogCompletionRow
            title={log.entityTitle}
            createdAt={log.createdAt}
            rawResultEvent={log.rawResultEvent}
          />
        </ListEnter>
      ))}
    </SettingsSection>
  );
}
