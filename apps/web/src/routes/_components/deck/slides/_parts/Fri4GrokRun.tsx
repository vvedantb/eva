import { IconCircleCheckFilled, IconDownload } from "@tabler/icons-react";
import { m } from "motion/react";
import { LoadingState, cn } from "@eva/ui";
import { GrokMark } from "@/lib/components/grokBot/GrokMark";
import { useAppScheme, useDeckStep } from "../../_components/DeckPrimitives";
import { DUR, EASE, Pulse, cueTransition } from "../../_components/motion";
import { DROP_AT, MERGE_AT } from "./Fri4ReviewBoard";

interface Line {
  step: number;
  /** Seconds into its step that the line starts. */
  at: number;
  label: string;
}

/** What the bot does, in the order it does it. Each line works, then ticks. */
const LINES: readonly Line[] = [
  { step: 1, at: DROP_AT + 0.2, label: "Notified: ready for review" },
  { step: 2, at: 0.25, label: "Migrations applied" },
  { step: 2, at: 0.85, label: "Backend deployed" },
  { step: 2, at: 1.45, label: "Pull request merged" },
];

const WORK = 0.5;

const STATUS_LABELS: readonly string[] = ["Waiting", "Working", "Done"];

function RunLine({ line }: { line: Line }) {
  const step = useDeckStep();
  const shown = step >= line.step;
  const current = step === line.step;
  const at = current ? line.at : 0;
  const done = current ? line.at + WORK : 0;

  return (
    <m.li
      className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm"
      initial={{ opacity: 0.3 }}
      animate={{ opacity: shown ? 1 : 0.3 }}
      transition={cueTransition(shown, at, {
        duration: DUR.base,
        ease: EASE.out,
      })}
    >
      <span className="relative flex size-4 items-center justify-center">
        {/* The pending mark: the whole run is visible before it starts. */}
        <m.span
          aria-hidden
          className="absolute inset-[1.5px] rounded-full border border-foreground/40"
          initial={{ opacity: 1 }}
          animate={{ opacity: shown ? 0 : 1 }}
          transition={cueTransition(shown, at, { duration: DUR.fast })}
        />
        {current ? (
          <m.span
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: DUR.fast, delay: done }}
          >
            <LoadingState label="Working" size="sm" iconOnly />
          </m.span>
        ) : null}
        <m.span
          className="absolute inset-0 flex items-center justify-center text-status-done"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={
            shown ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }
          }
          transition={cueTransition(shown, done, {
            type: "spring",
            bounce: 0.4,
            duration: 0.45,
          })}
        >
          <IconCircleCheckFilled size={16} />
        </m.span>
      </span>
      <span className="text-foreground/85">{line.label}</span>
    </m.li>
  );
}

/** The bot's own run log: wakes on the drop, then works through the release. */
export function Fri4GrokRun() {
  const appScheme = useAppScheme();
  const step = useDeckStep();
  const awake = step >= 1;
  const finished = step >= 2;
  const status = finished ? "Done" : awake ? "Working" : "Waiting";

  return (
    <div
      className={cn(
        appScheme,
        "overflow-hidden rounded-2xl bg-background ring-1 ring-white/10",
      )}
    >
      <div className="flex h-11 items-center gap-2.5 border-b border-border/60 px-4">
        <m.span
          className="flex"
          animate={
            awake
              ? { scale: [1, 1.25, 1], opacity: 1 }
              : { scale: 1, opacity: 0.45 }
          }
          transition={
            awake
              ? { duration: 0.5, times: [0, 0.4, 1], delay: DROP_AT }
              : { duration: DUR.fast }
          }
        >
          <GrokMark size={16} className="text-white" />
        </m.span>
        <span className="text-sm font-medium text-foreground">Grok bot</span>
        <span className="ml-auto flex items-center gap-2 text-2xs text-muted-foreground">
          {awake ? (
            <m.span
              className="flex"
              initial={false}
              animate={{ opacity: finished ? 0 : 1 }}
              transition={{
                duration: DUR.base,
                delay: finished && step === 2 ? MERGE_AT : 0,
              }}
            >
              <Pulse size={6} step={1} delay={DROP_AT} />
            </m.span>
          ) : null}
          <span className="grid">
            {STATUS_LABELS.map((label) => (
              <m.span
                key={label}
                className="col-start-1 row-start-1 text-right"
                initial={false}
                animate={{ opacity: label === status ? 1 : 0 }}
                transition={{
                  duration: DUR.base,
                  delay: step === 2 && label !== "Waiting" ? MERGE_AT : 0,
                }}
              >
                {label}
              </m.span>
            ))}
          </span>
        </span>
      </div>
      <ul className="flex flex-col gap-0.5 p-2">
        {LINES.map((line) => (
          <RunLine key={line.label} line={line} />
        ))}
      </ul>
    </div>
  );
}

/** The page the task changed, with the new button arriving once it is merged. */
export function Fri4LivePage() {
  const appScheme = useAppScheme();
  const step = useDeckStep();
  const live = step >= 2;
  const at = step === 2 ? MERGE_AT + 0.5 : 0;

  return (
    <div
      className={cn(
        appScheme,
        "overflow-hidden rounded-2xl bg-background ring-1 ring-white/10",
      )}
    >
      <div className="flex h-9 items-center gap-1.5 border-b border-border/60 px-3">
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="ml-3 rounded-md bg-muted px-2.5 py-0.5 text-2xs text-muted-foreground">
          Reports
        </span>
        <m.span
          className="ml-auto flex items-center gap-1.5 rounded-full bg-status-done-bg px-2 py-0.5 text-2xs font-medium text-status-done"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={live ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={cueTransition(live, at, {
            duration: DUR.base,
            ease: EASE.out,
          })}
        >
          <Pulse size={6} step={2} delay={at} color="currentColor" />
          Live
        </m.span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex h-8 items-center justify-between">
          <span className="text-base font-semibold text-foreground">
            Reports
          </span>
          <m.span
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={
              live
                ? {
                    opacity: 1,
                    scale: 1,
                    boxShadow: [
                      "0 0 0 0 rgba(59,125,216,0.7)",
                      "0 0 0 10px rgba(59,125,216,0)",
                    ],
                  }
                : { opacity: 0, scale: 0.6 }
            }
            transition={
              live
                ? {
                    opacity: { duration: DUR.base, delay: at },
                    scale: {
                      type: "spring",
                      bounce: 0.45,
                      duration: 0.6,
                      delay: at,
                    },
                    boxShadow: { duration: 0.9, delay: at + 0.25 },
                  }
                : { duration: DUR.fast }
            }
          >
            <IconDownload size={13} />
            Export
          </m.span>
        </div>
        {[0.9, 0.75, 0.82].map((width) => (
          <div key={width} className="flex items-center gap-3">
            <span className="h-2 w-16 rounded-full bg-muted" />
            <span
              className="h-2 rounded-full bg-muted/60"
              style={{ width: `${width * 100}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
