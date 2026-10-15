"use client";

import { LANDING_PILLARS } from "./landingContent";
import {
  LandingLattice,
  LandingReveal,
  LandingSection,
} from "./LandingPrimitives";

/**
 * Four-stage overview of the platform. Each cell links to the matching section
 * below, so this doubles as a table of contents for a long page.
 */
export function LandingWorkflow() {
  return (
    <LandingSection id="workflow" className="py-16 sm:py-20 lg:py-20">
      <LandingReveal>
        <LandingLattice className="sm:grid-cols-2 lg:grid-cols-4">
          {LANDING_PILLARS.map((pillar) => (
            <a
              key={pillar.id}
              href={`#${pillar.id}`}
              className="motion-base group bg-background p-6 hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <p className="font-mono text-2xs tracking-[0.28em] text-primary">
                {pillar.step}
              </p>
              <p className="mt-3 text-base font-medium text-foreground">
                {pillar.label}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {pillar.tagline}
              </p>
            </a>
          ))}
        </LandingLattice>
      </LandingReveal>
    </LandingSection>
  );
}
