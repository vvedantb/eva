import type { BadgeProps } from "@vvedantb/ui";
import type { Doc } from "@eva/backend";
import { ownerLabel } from "@eva/shared";

type RoutedThread = Doc<"routedThreads">;
type RoutedThreadStatus = RoutedThread["status"];

const STATUS_LABELS: Record<RoutedThreadStatus, string> = {
  open: "Open",
  waiting_human: "Needs reply",
  // Everyone asked has answered and Eva has been woken with the replies.
  // Not "Waiting on Eva": that reads as a person called Eva.
  waiting_eva: "Answered",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

const STATUS_BADGE_VARIANTS: Record<RoutedThreadStatus, BadgeProps["variant"]> =
  {
    open: "secondary",
    waiting_human: "warning",
    waiting_eva: "secondary",
    resolved: "success",
    cancelled: "outline",
  };

export function statusLabel(status: RoutedThreadStatus): string {
  return STATUS_LABELS[status];
}

export function statusBadgeVariant(
  status: RoutedThreadStatus,
): BadgeProps["variant"] {
  return STATUS_BADGE_VARIANTS[status];
}

/**
 * One-line list of the people on a thread: names joined with commas, or the
 * first two plus a `+N` tail once there are more than three.
 */
export function participantNames(
  participants: readonly { name: string }[],
): string {
  if (participants.length > 3) {
    const shown = participants
      .slice(0, 2)
      .map((participant) => participant.name)
      .join(", ");
    return `${shown} +${participants.length - 2}`;
  }
  return participants.map((participant) => participant.name).join(", ");
}

/** "Session #42", or just "Session" when the chat has no number. */
export function sourceLabel(
  thread: Pick<RoutedThread, "sourceKind"> & { sourceNumId?: number },
): string {
  return ownerLabel(thread.sourceKind, thread.sourceNumId);
}
