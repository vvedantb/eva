import { cn } from "@eva/ui";
import type { BadgeProps } from "@eva/ui";

export function statusLabel(status: string): string {
  if (status === "waiting_human") return "Needs reply";
  if (status === "waiting_eva") return "Waiting on Eva";
  if (status === "resolved") return "Resolved";
  if (status === "cancelled") return "Cancelled";
  return "Open";
}

export function statusClass(status: string): string {
  return cn(
    status === "waiting_human" && "text-warning",
    status === "waiting_eva" && "text-muted-foreground",
    status === "resolved" && "text-success",
  );
}

export function statusBadgeVariant(status: string): BadgeProps["variant"] {
  if (status === "waiting_human") return "warning";
  if (status === "resolved") return "success";
  if (status === "cancelled") return "outline";
  return "secondary";
}

export function sourceKindLabel(kind: string): string {
  if (kind === "session") return "Session";
  if (kind === "task") return "Task";
  if (kind === "project") return "Project";
  return "Chat";
}

export const LIST_STATUS_ORDER = [
  "waiting_human",
  "waiting_eva",
  "open",
] as const;
