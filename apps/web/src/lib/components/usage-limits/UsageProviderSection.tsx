import {
  emptyAccountUsageCopy,
  providerHeading,
  reportedWindows,
  snapshotOf,
  type UsageAccountEntry,
} from "./_utils";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { UsageWindowRow } from "./UsageWindowRow";

interface UsageProviderSectionProps {
  entry: UsageAccountEntry;
  /** Passed in so every row in one card measures against the same instant. */
  now: number;
}

/**
 * One credential's reading: the plan windows the provider reported, or a line
 * saying why there are none to draw.
 *
 * The account's name trails the heading, muted: the plan is what the numbers
 * measure, and the label is the only thing telling two of the same plan apart —
 * so it is shown for every entry, the shared team credential ("Team") included.
 */
export function UsageProviderSection({
  entry,
  now,
}: UsageProviderSectionProps) {
  const snapshot = snapshotOf(entry);
  const windows = snapshot === undefined ? [] : reportedWindows(snapshot, now);

  return (
    <div className="space-y-2 p-3">
      <p className="font-medium text-xs">
        {snapshot === undefined ? "Claude" : providerHeading(snapshot)}
        <span className="font-normal text-muted-foreground">
          {` · ${entry.accountLabel}`}
        </span>
      </p>
      {windows.length > 0 ? (
        <div className="space-y-2.5">
          {windows.map((usageWindow, index) => (
            <ListEnter key={usageWindow.key} index={index} fast>
              <UsageWindowRow usageWindow={usageWindow} now={now} />
            </ListEnter>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {emptyAccountUsageCopy(snapshot === undefined ? [] : [snapshot], now)}
        </p>
      )}
    </div>
  );
}
