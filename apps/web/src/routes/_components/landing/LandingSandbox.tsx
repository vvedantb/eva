"use client";

import { m, type Variants } from "motion/react";
import { cn } from "@eva/ui";
import {
  LANDING_SANDBOX_BOOT,
  LANDING_SANDBOX_SPEC,
  type LandingBootKind,
} from "./landingContent";
import {
  LandingReveal,
  LandingSection,
  LandingSectionHeading,
} from "./LandingPrimitives";

const BOOT_CONTAINER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.16, delayChildren: 0.15 } },
};

const BOOT_LINE: Variants = {
  hidden: { opacity: 0, x: -4 },
  show: { opacity: 1, x: 0, transition: { duration: 0.2 } },
};

/** No stagger and no slide when the visitor asks for less movement. */
const BOOT_TONE: Record<LandingBootKind, string> = {
  command: "text-foreground",
  info: "text-muted-foreground",
  ok: "text-success",
};

/**
 * What the agent is actually running on. Contents mirror the snapshot image in
 * `snapshotActions.ts`; the band background breaks up the page between the
 * feature showcases and the MCP section.
 */
export function LandingSandbox() {
  return (
    <div
      id="sandbox"
      className="scroll-mt-16 border-y border-border bg-muted/30"
    >
      <LandingSection>
        <LandingReveal>
          <LandingSectionHeading
            eyebrow="The environment"
            heading="A real machine, not a toy sandbox."
            intro="Every task boots a cloud VM from a prebuilt snapshot. Docker runs inside it. So does a desktop and a real browser, which is how an agent takes a screenshot of the thing it just changed."
          />

          <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <SandboxTerminal />

            <div className="overflow-hidden rounded-surface border border-border">
              <div className="grid gap-px bg-border">
                {LANDING_SANDBOX_SPEC.map((group) => (
                  <div
                    key={group.label}
                    className="flex flex-col gap-1 bg-background px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-5"
                  >
                    <p className="w-24 shrink-0 font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground/70">
                      {group.label}
                    </p>
                    <p className="text-pretty text-2sm leading-relaxed text-foreground">
                      {group.items}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            Snapshot builds usually finish in about six minutes. Rebuild on a
            cron or on demand, and a missing snapshot falls back to a fresh
            clone rather than failing the run.
          </p>
        </LandingReveal>
      </LandingSection>
    </div>
  );
}

/** Boot log that types itself out once, the first time it scrolls into view. */
function SandboxTerminal() {
  return (
    <div className="overflow-hidden rounded-surface bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
        </span>
        <p className="font-mono text-2xs text-muted-foreground">
          acme/web â€” sandbox
        </p>
        <span className="ml-auto flex items-center gap-1.5">
          <span
            className="landing-pulse-dot size-1.5 rounded-full bg-success"
            aria-hidden
          />
          <span className="text-3xs text-muted-foreground">running</span>
        </span>
      </div>

      <m.div
        className="space-y-1.5 p-4 font-mono text-[11.5px] leading-relaxed sm:p-5"
        variants={BOOT_CONTAINER}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
      >
        {LANDING_SANDBOX_BOOT.map((line) => (
          <m.p
            key={line.text}
            variants={BOOT_LINE}
            className={cn("truncate", BOOT_TONE[line.kind])}
          >
            {line.kind === "command" ? (
              <span className="text-primary">$ </span>
            ) : (
              <span className="text-muted-foreground/40">{"  "}</span>
            )}
            {line.text}
          </m.p>
        ))}

        <p className="text-foreground">
          <span className="text-primary">$ </span>
          <span
            className="landing-pulse-dot inline-block h-3.5 w-[7px] translate-y-0.5 bg-foreground"
            aria-hidden
          />
        </p>
      </m.div>
    </div>
  );
}
