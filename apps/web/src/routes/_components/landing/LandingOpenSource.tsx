"use client";

import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react";
import { Button, cn } from "@eva/ui";
import { BrandMark } from "./BrandMark";
import {
  EVA_GITHUB_URL,
  EVA_SETUP_URL,
  LANDING_OPEN_SOURCE_FACTS,
  LANDING_STACK,
} from "./landingContent";
import {
  LANDING_CARD,
  LandingReveal,
  LandingSection,
  LandingSectionHeading,
} from "./LandingPrimitives";

/** Licence, hosting model and stack — the questions a self-hoster asks first. */
export function LandingOpenSource() {
  return (
    <div id="open-source" className="scroll-mt-20 bg-muted/40">
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
                <Button asChild size="lg" className="rounded-full px-6">
                  <a href={EVA_GITHUB_URL} target="_blank" rel="noreferrer">
                    <IconBrandGithub size={16} aria-hidden />
                    View on GitHub
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="rounded-full px-5"
                >
                  <a href={EVA_SETUP_URL} target="_blank" rel="noreferrer">
                    Read the setup guide
                    <IconArrowRight size={16} aria-hidden />
                  </a>
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <dl className="grid gap-3 sm:grid-cols-3">
                {LANDING_OPEN_SOURCE_FACTS.map((fact) => (
                  <div key={fact.label} className={cn(LANDING_CARD, "p-6")}>
                    <dt className="text-xs text-muted-foreground">
                      {fact.label}
                    </dt>
                    <dd className="landing-display mt-6 text-xl font-semibold text-foreground">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className={cn(LANDING_CARD, "p-6")}>
                <p className="text-xs text-muted-foreground">Built with</p>
                <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
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
