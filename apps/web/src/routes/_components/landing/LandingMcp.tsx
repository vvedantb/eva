"use client";

import { IconArrowRight, IconBrowser, IconCheck } from "@tabler/icons-react";
import { m, type Variants } from "motion/react";
import { LANDING_MCP_CALLS, LANDING_MCP_CARDS } from "./landingContent";
import {
  LandingLattice,
  LandingReveal,
  LandingSection,
  LandingSectionHeading,
} from "./LandingPrimitives";

const CALLS_CONTAINER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.18, delayChildren: 0.2 } },
};

const CALL_ROW: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

/** MCP in both directions, plus the Chrome extension as a closing note. */
export function LandingMcp() {
  return (
    <LandingSection id="mcp">
      <LandingReveal>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-center">
          <LandingSectionHeading
            eyebrow="Integrations"
            heading="Eva speaks MCP in both directions."
            intro="Drive Eva from the MCP client you already use, and let agents inside a sandbox call back to Eva while they work."
          />
          <McpCallPanel />
        </div>

        <LandingLattice className="mt-12 lg:grid-cols-3">
          {LANDING_MCP_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.name}
                className="motion-base flex flex-col gap-4 bg-background p-6 hover:bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-card">
                    <Icon size={17} className="text-primary" aria-hidden />
                  </div>
                  <h3 className="text-base font-medium text-foreground">
                    {card.name}
                  </h3>
                </div>

                <p className="text-pretty text-sm leading-relaxed text-foreground">
                  {card.summary}
                </p>

                <ul className="mt-auto space-y-2 border-t border-border pt-4">
                  {card.points.map((point) => (
                    <li
                      key={point}
                      className="text-pretty text-2sm leading-relaxed text-muted-foreground"
                    >
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </LandingLattice>

        <div className="mt-4 flex items-start gap-4 rounded-surface bg-card p-6">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
            <IconBrowser size={17} className="text-primary" aria-hidden />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-medium text-foreground">
              Chrome extension
            </h3>
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              An on-page toolbar for the app you are building. Annotate what is
              wrong where you found it, and file the task without switching
              tabs.
            </p>
          </div>
        </div>
      </LandingReveal>
    </LandingSection>
  );
}

/** Tool calls arriving from an external MCP client, revealed one at a time. */
function McpCallPanel() {
  return (
    <div className="overflow-hidden rounded-surface bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="font-mono text-2xs text-muted-foreground">
          Claude Desktop
        </p>
        <IconArrowRight
          size={13}
          className="text-muted-foreground/60"
          aria-hidden
        />
        <p className="font-mono text-2xs text-foreground">eva</p>
        <span className="ml-auto rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-3xs font-medium text-success">
          OAuth 2.1
        </span>
      </div>

      <m.div
        className="divide-y divide-border"
        variants={CALLS_CONTAINER}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
      >
        {LANDING_MCP_CALLS.map((call) => (
          <m.div
            key={call.tool}
            variants={CALL_ROW}
            className="flex items-center gap-3 px-4 py-2.5"
          >
            <IconCheck
              size={13}
              className="shrink-0 text-success"
              aria-hidden
            />
            <code className="shrink-0 font-mono text-[11.5px] text-foreground">
              {call.tool}
            </code>
            <span className="min-w-0 flex-1 truncate text-right text-2xs text-muted-foreground">
              {call.result}
            </span>
          </m.div>
        ))}
      </m.div>

      <p className="border-t border-border px-4 py-2.5 text-2xs text-muted-foreground">
        Around 25 tools, the same ones an agent calls from inside a sandbox.
      </p>
    </div>
  );
}
