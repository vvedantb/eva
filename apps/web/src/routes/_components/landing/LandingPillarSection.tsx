"use client";

import type { LandingPillar } from "./landingContent";
import { LandingShowcase } from "./LandingShowcase";
import {
  LandingReveal,
  LandingSection,
  LandingSectionHeading,
} from "./LandingPrimitives";

/** One stage of the workflow: heading plus a tabbed showcase of its features. */
export function LandingPillarSection({ pillar }: { pillar: LandingPillar }) {
  return (
    <LandingSection id={pillar.id}>
      <LandingReveal>
        <LandingSectionHeading
          split
          eyebrow={
            <>
              <span className="text-foreground">{pillar.step}</span>
              {pillar.label}
            </>
          }
          heading={pillar.heading}
          intro={pillar.intro}
        />
        <LandingShowcase idPrefix={pillar.id} features={pillar.features} />
      </LandingReveal>
    </LandingSection>
  );
}
