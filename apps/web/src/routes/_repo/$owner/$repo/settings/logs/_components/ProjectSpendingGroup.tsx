import type { FunctionReturnType } from "convex/server";
import type { api } from "@eva/backend";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { formatCost } from "../_utils";
import { LogCompletionRow } from "./LogCompletionRow";

type ProjectGroup = FunctionReturnType<typeof api.logs.listByProject>[number];
type LogEntry = ProjectGroup["logs"][number];

interface ProjectSpendingGroupProps {
  projectTitle: string;
  logs: LogEntry[];
  totalCost: number;
}

/** One project's completions as a settings list section. */
export function ProjectSpendingGroup({
  projectTitle,
  logs,
  totalCost,
}: ProjectSpendingGroupProps) {
  const countLabel =
    logs.length === 1 ? "1 completion" : `${logs.length} completions`;

  return (
    <SettingsSection
      title={projectTitle}
      description={countLabel}
      action={
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatCost(totalCost)}
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
            entityType={log.entityType}
          />
        </ListEnter>
      ))}
    </SettingsSection>
  );
}
