"use client";

import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react";
import { Button } from "@eva/ui";
import { BrandMark } from "./BrandMark";
import {
  EVA_GITHUB_URL,
  EVA_SETUP_URL,
  LANDING_OPEN_SOURCE_FACTS,
  LANDING_STACK,
} from "./landingContent";
import {
  LandingLattice,
  LandingReveal,
  LandingSection,
  LandingSectionHeading,
} from "./LandingPrimitives";

/** Licence, hosting model and stack — the questions a self-hoster asks first. */
export function LandingOpenSource() {
  return (
    <div
      id="open-source"
      className="scroll-mt-16 border-y border-border bg-muted/30"
    >
      <LandingSection>
        <LandingReveal>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
            <div>
              <LandingSectionHeading
                eyebrow="Open source"
                heading="Fully open source. Fully yours."
                intro="Eva is MIT licensed and self-hosted. There is no managed cloud version, so your code, your data and your agent credentials stay on infrastructure you control."
              />

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <a href={EVA_GITHUB_URL} target="_blank" rel="noreferrer">
                    <IconBrandGithub size={16} aria-hidden />
                    View on GitHub
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href={EVA_SETUP_URL} target="_blank" rel="noreferrer">
                    Read the setup guide
                    <IconArrowRight size={16} aria-hidden />
                  </a>
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <LandingLattice className="sm:grid-cols-3">
                {LANDING_OPEN_SOURCE_FACTS.map((fact) => (
                  <div key={fact.label} className="bg-background p-6">
                    <p className="font-mono text-2xs uppercase tracking-[0.22em] text-muted-foreground/70">
                      {fact.label}
                    </p>
                    <p className="mt-2 text-lg font-medium tracking-tight text-foreground">
                      {fact.value}
                    </p>
                  </div>
                ))}
              </LandingLattice>

              <div className="rounded-surface border border-border bg-background p-6">
                <p className="font-mono text-2xs uppercase tracking-[0.22em] text-muted-foreground/70">
                  Built with
                </p>
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2.5">
                  {LANDING_STACK.map((item) => (
                    <li
                      key={item.name}
                      className="flex items-center gap-1.5 text-sm text-foreground"
                    >
                      <BrandMark name={item.brand} size={15} />
                      {item.name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </LandingReveal>
      </LandingSection>
    </div>
  );
}
