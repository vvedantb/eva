import { useId } from "react";
import cronstrue from "cronstrue";
import { CronExpressionParser } from "cron-parser";
import { Input } from "@eva/ui";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsField } from "@/lib/components/settings/SettingsField";

function getOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

function offsetCronHour(expression: string, offsetMin: number): string | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [min, hour, ...rest] = parts;
  const minNum = parseInt(min);
  const hourNum = parseInt(hour);
  if (
    isNaN(minNum) ||
    isNaN(hourNum) ||
    min !== String(minNum) ||
    hour !== String(hourNum)
  )
    return null;
  const total = hourNum * 60 + minNum + offsetMin;
  const newHour = ((Math.floor(total / 60) % 24) + 24) % 24;
  const newMin = ((total % 60) + 60) % 60;
  return [String(newMin), String(newHour), ...rest].join(" ");
}

function localCronToUtc(localExpr: string): string {
  const result = offsetCronHour(localExpr, -getOffsetMinutes());
  return result ?? localExpr;
}

function utcCronToLocal(utcExpr: string): string {
  const result = offsetCronHour(utcExpr, getOffsetMinutes());
  return result ?? utcExpr;
}

function describeCron(
  utcExpression: string,
): { valid: true; text: string } | { valid: false; partial: boolean } {
  const parts = utcExpression.trim().split(/\s+/);
  if (parts.length < 5) return { valid: false, partial: true };
  try {
    const localExpr = utcCronToLocal(utcExpression);
    return {
      valid: true,
      text: cronstrue.toString(localExpr, { use24HourTimeFormat: false }),
    };
  } catch {
    return { valid: false, partial: false };
  }
}

function nextCronDate(utcExpression: string): string | null {
  try {
    const iter = CronExpressionParser.parse(utcExpression, { tz: "UTC" });
    const next = iter.next().toDate();
    return next.toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

interface CronScheduleCardProps {
  value: string;
  onChange: (value: string) => void;
  allowManual?: boolean;
  /**
   * Fired on blur with the normalised value, for callers that persist on blur
   * rather than on every keystroke. Optional — omit for change-driven saves.
   */
  onBlurCommit?: (value: string) => void;
}

export function CronScheduleCard({
  value,
  onChange,
  allowManual = false,
  onBlurCommit,
}: CronScheduleCardProps) {
  const fieldId = useId();
  const isManual = allowManual && value === "manual";
  const localDisplay = isManual ? "" : utcCronToLocal(value);
  const schedule = allowManual ? value : value || "";

  return (
    <SettingsSection title="Cron Schedule">
      <SettingsField
        label="Schedule (cron expression, your timezone)"
        htmlFor={fieldId}
        description={
          <>
            Times are in your local timezone. Examples: <code>0 6 * * *</code>{" "}
            (daily at 6am), <code>0 6 * * 1</code> (weekly Monday at 6am),{" "}
            <code>0 */6 * * *</code> (every 6 hours)
            {allowManual && ". Leave empty for manual only."}
          </>
        }
      >
        <CronPreview schedule={schedule} allowManual={allowManual} />
        <Input
          id={fieldId}
          className="font-mono text-center"
          placeholder={
            allowManual ? "0 6 * * * (leave empty for manual)" : "0 6 * * *"
          }
          value={localDisplay}
          onChange={(e) => {
            const raw = e.target.value;
            if (allowManual && !raw) {
              onChange("manual");
              return;
            }
            onChange(localCronToUtc(raw));
          }}
          onBlur={() => {
            const normalized = allowManual
              ? value.trim() || "manual"
              : value.trim();
            onChange(normalized);
            onBlurCommit?.(normalized);
          }}
        />
      </SettingsField>
      <CronGuide />
    </SettingsSection>
  );
}

function CronPreview({
  schedule,
  allowManual,
}: {
  schedule: string;
  allowManual: boolean;
}) {
  if (allowManual && schedule === "manual") {
    return (
      <div className="mb-2 rounded-surface bg-muted/50 px-3 py-2 text-center">
        <p className="text-sm text-muted-foreground">Manual only</p>
      </div>
    );
  }

  if (!schedule) return null;

  const result = describeCron(schedule);

  if (!result.valid) {
    return (
      <div className="mb-2 rounded-surface bg-muted/50 px-3 py-2 text-center">
        <p className="text-sm text-muted-foreground">
          {result.partial
            ? "Type a cron expression..."
            : "Invalid cron expression"}
        </p>
      </div>
    );
  }

  const next = nextCronDate(schedule);

  return (
    <div className="mb-2 rounded-surface bg-muted/50 px-3 py-2 text-center">
      <p className="text-lg font-medium">{result.text}</p>
      {next && (
        <p className="text-2xs text-muted-foreground">next at {next}</p>
      )}
    </div>
  );
}

function CronGuide() {
  return (
    <div className="mt-3 rounded-surface border border-border bg-muted/40 overflow-hidden">
      <div className="bg-muted/30 px-3 py-1.5">
        <p className="text-2xs font-medium text-muted-foreground">
          Cron format reference
        </p>
      </div>
      <div className="p-2 flex flex-col gap-3 sm:flex-row sm:gap-6 sm:p-3">
        <pre className="overflow-x-auto font-mono text-2xs text-muted-foreground leading-relaxed shrink-0">
          {"┌─ minute (0-59)\n"}
          {"│ ┌─ hour (0-23)\n"}
          {"│ │ ┌─ day of month (1-31)\n"}
          {"│ │ │ ┌─ month (1-12)\n"}
          {"│ │ │ │ ┌─ day of week (0-6)\n"}
          {"* * * * *"}
        </pre>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-2xs content-start sm:gap-x-4">
          {(
            [
              ["*", "any value"],
              [",", "list separator"],
              ["-", "range"],
              ["/", "step values"],
              ["0-6", "day of week range"],
              ["SUN-SAT", "day names"],
            ] as const
          ).map(([symbol, desc]) => (
            <div key={symbol} className="contents">
              <span className="font-mono text-foreground/70">{symbol}</span>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { describeCron };
