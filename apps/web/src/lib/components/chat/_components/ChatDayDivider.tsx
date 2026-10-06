import dayjs, { formatDayLabel } from "@eva/shared/dates";

/**
 * iMessage-style date label heading the first turn of each day: the day in
 * medium weight, the turn's time beside it. Text only — no rule lines, per the
 * no-decorative-hairline surface rule.
 */
export function ChatDayDivider({ timestamp }: { timestamp: number }) {
  const day = formatDayLabel(timestamp);
  const time = dayjs(timestamp).format("h:mm A");
  return (
    <div
      role="separator"
      aria-label={`${day} ${time}`}
      className="flex justify-center gap-1 pt-2 pb-1 text-[11px] text-muted-foreground/70 select-none"
    >
      <span className="font-medium text-muted-foreground">{day}</span>
      <span>{time}</span>
    </div>
  );
}
