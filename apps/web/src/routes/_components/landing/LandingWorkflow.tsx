"use client";

import { IconArrowDownRight } from "@tabler/icons-react";
import { cn } from "@eva/ui";
import { LANDING_PILLARS } from "./landingContent";
import {
  LANDING_CARD,
  LandingReveal,
  LandingSection,
  LandingSectionHeading,
} from "./LandingPrimitives";

/**
 * Four-stage overview of the platform. Each card links to the matching section
 * below, so this doubles as a table of contents for a long page.
 */
export function LandingWorkflow() {
  return (
    <LandingSection id="workflow" className="pt-8 sm:pt-10 lg:pt-12">
      <LandingReveal>
        <LandingSectionHeading
          split
          eyebrow="How it works"
          heading="From an idea to a merged pull request."
          intro="Eva covers the whole loop. Plan the work, let agents build it in a real environment, check what they did, and keep it running."
        />

        <ol className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LANDING_PILLARS.map((pillar) => (
            <li key={pillar.id}>
              <a
                href={`#${pillar.id}`}
                className={cn(
                  LANDING_CARD,
                  "motion-base group flex h-full flex-col p-6 hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <div className="flex items-start justify-between">
                  <span className="landing-display text-5xl font-semibold tabular-nums text-foreground/15 motion-base group-hover:text-foreground/30">
                    {pillar.step}
                  </span>
                  <IconArrowDownRight
                    size={18}
                    aria-hidden
                    className="motion-base text-muted-foreground group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:text-foreground"
                  />
                </div>
                <p className="mt-10 text-lg font-semibold tracking-tight text-foreground">
                  {pillar.label}
                </p>
                <p className="mt-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {pillar.tagline}
                </p>
                <p className="mt-6 font-mono text-2xs text-muted-foreground/80">
                  {pillar.features.map((feature) => feature.name).join(" · ")}
                </p>
              </a>
            </li>
          ))}
        </ol>
      </LandingReveal>
    </LandingSection>
  );
}
