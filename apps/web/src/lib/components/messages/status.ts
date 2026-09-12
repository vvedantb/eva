import { cn } from "@eva/ui";

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
