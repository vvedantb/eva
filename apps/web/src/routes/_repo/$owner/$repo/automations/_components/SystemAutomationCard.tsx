import { Link } from "@tanstack/react-router";
import { Button, Surface, cn, motionFast } from "@eva/ui";
import { AnimatePresence, m } from "motion/react";
import {
  IconArrowRight,
  IconBook,
  IconBug,
  IconCheck,
  IconClock,
  IconEye,
  IconFileText,
  IconRadioactive,
  IconSitemap,
  IconSparkles,
  IconTestPipe,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import { describeCron } from "@/lib/components/CronScheduleCard";

/**
 * Per-entry glyph for the card's icon tile. Keyed by catalog key so the backend
 * stays free of presentation; unknown keys fall back to the generic mark.
 */
const ENTRY_ICONS: Record<string, Icon> = {
  "daily-standup": IconFileText,
  "find-critical-bugs": IconBug,
  "add-test-coverage": IconTestPipe,
  "generate-docs": IconBook,
  "improve-code-structure": IconSitemap,
  "thermo-nuclear-code-review": IconRadioactive,
};

interface SystemAutomationCardProps {
  entryKey: string;
  title: string;
  /** One-line card copy, not the prompt. */
  blurb: string;
  /** Cron expression in UTC; shown in the reader's local time. */
  cronSchedule: string;
  readOnly: boolean;
  installed: boolean;
  /** Per-repo URL id once installed; null otherwise. */
  numId: number | null;
  basePath: string;
  onInstall: () => void;
  onUninstall: () => void;
}

/**
 * One entry in the Automations Hub: an eva-managed automation the user installs
 * into this app. Installing adds it to the app's automations (where it can be
 * enabled, disabled and run); uninstalling takes it back out.
 */
export function SystemAutomationCard({
  entryKey,
  title,
  blurb,
  cronSchedule,
  readOnly,
  installed,
  numId,
  basePath,
  onInstall,
  onUninstall,
}: SystemAutomationCardProps) {
  const schedule = describeCron(cronSchedule);
  const EntryIcon = ENTRY_ICONS[entryKey] ?? IconSparkles;
  // Plain `string`: `<Link to>` is a union of known route paths.
  const href: string = `${basePath}/automations/${numId}`;

  return (
    <Surface
      density="none"
      className={cn(
        "group flex flex-col overflow-hidden transition-colors",
        installed ? "bg-card" : "bg-card hover:bg-muted/40",
      )}
    >
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              // rounded-lg, not rounded-surface: a 36px tile should read as a
              // circle under the "Full" radius theme, like other compact chrome.
              "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
              installed
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <EntryIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium leading-tight">
              {title}
            </h3>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {blurb}
            </p>
          </div>
        </div>

        {/* Pre-install the schedule is only a seed value, so showing a clock
            time would read as a fixed property of the automation. */}
        {(installed || readOnly) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {installed && (
              <Chip icon={IconClock}>
                {schedule.valid ? schedule.text : cronSchedule}
              </Chip>
            )}
            {readOnly && <Chip icon={IconEye}>Report only</Chip>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
        <AnimatePresence mode="wait" initial={false}>
          {installed ? (
            <m.div
              key="installed"
              className="flex w-full items-center justify-between gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-success">
                <IconCheck size={13} />
                Installed
              </span>
              <div className="flex items-center gap-1">
                {numId !== null && (
                  <Link
                    to={href}
                    className="max-sm:hit-target flex items-center gap-1 rounded-menu-item px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Open
                    <IconArrowRight size={12} />
                  </Link>
                )}
                <Button size="sm" variant="ghost" onClick={onUninstall}>
                  Uninstall
                </Button>
              </div>
            </m.div>
          ) : (
            <m.div
              key="available"
              className="flex w-full items-center justify-between gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionFast}
            >
              <span className="text-[11px] text-muted-foreground">
                Not installed
              </span>
              <Button size="sm" onClick={onInstall}>
                Install
              </Button>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </Surface>
  );
}

/** Small metadata pill in the card body. */
function Chip({ icon: ChipIcon, children }: { icon: Icon; children: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
      <ChipIcon size={12} className="shrink-0" />
      {children}
    </span>
  );
}
