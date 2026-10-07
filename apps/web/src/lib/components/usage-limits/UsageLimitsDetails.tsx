import { compactRelativeTime } from "@eva/shared/dates";
import type { Id } from "@eva/backend";
import {
  newestCapturedAt,
  snapshotsOf,
  type UsageAccountEntry,
} from "./_utils";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { UsageProviderSection } from "./UsageProviderSection";
import { UsageRefreshButton } from "./UsageRefreshButton";

interface UsageLimitsDetailsProps {
  repoId: Id<"githubRepos">;
  /** Every credential the viewer can run on, in the query's order. */
  entries: readonly UsageAccountEntry[];
  /**
   * One instant for the whole card, shared with the chip that opens it — both
   * read the same minute clock, so they cannot disagree by a tick, and an open
   * card's countdown ticks along with it.
   */
  now: number;
}

/**
 * The expanded card: one section per Claude credential the viewer can run on,
 * whether or not it has reported yet — an account missing from the list would
 * read as "no limits" rather than "no reading". Refreshing is one button for
 * the lot: a card that lists every account is only useful if one click fills
 * it in.
 */
export function UsageLimitsDetails({
  repoId,
  entries,
  now,
}: UsageLimitsDetailsProps) {
  const capturedAt = newestCapturedAt(snapshotsOf(entries));

  if (entries.length === 0) {
    return (
      <div className="space-y-1 p-3">
        <p className="font-medium text-xs">Plan usage</p>
        <p className="text-muted-foreground text-xs">
          No Claude accounts connected. Connect one in Settings to see plan
          usage.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      <div className="flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-3">
        <p className="font-medium text-xs">Plan usage</p>
        <UsageRefreshButton repoId={repoId} />
      </div>
      {entries.map((entry, index) => (
        <ListEnter key={entry.providerAccountId ?? "team"} index={index}>
          <UsageProviderSection entry={entry} now={now} />
        </ListEnter>
      ))}
      {capturedAt !== undefined && (
        <div className="bg-secondary py-1.5 pr-1.5 pl-3">
          <p className="text-muted-foreground text-xs">
            updated {compactRelativeTime(capturedAt)} ago
          </p>
        </div>
      )}
    </div>
  );
}
