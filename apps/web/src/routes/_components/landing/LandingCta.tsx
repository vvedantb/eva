"use client";

import { SignUpButton } from "@clerk/clerk-react";
import { IconArrowRight, IconBrandGithub } from "@tabler/icons-react";
import { Button } from "@eva/ui";
import { EVA_GITHUB_URL } from "./landingContent";
import { LandingReveal, LandingSection } from "./LandingPrimitives";

/**
 * Closing panel. Reuses the hero atmosphere inside a rounded stage, so the page
 * ends where it started without another full-bleed band.
 */
export function LandingCta() {
  return (
    <LandingSection>
      <LandingReveal className="landing-atmosphere landing-grain relative overflow-hidden rounded-surface px-6 py-20 text-center ring-1 ring-border/70 sm:px-12 sm:py-28">
        <div aria-hidden className="landing-grid" />
        <div className="relative z-10 flex flex-col items-center">
          <h2 className="landing-display max-w-3xl text-balance text-4xl font-semibold leading-[1.02] text-foreground sm:text-6xl">
            Point Eva at a{" "}
            <span className="landing-headline-tail">repository.</span>
          </h2>
          <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Connect GitHub, pick an agent, and describe the change. Eva handles
            the environment, the branch and the pull request.
          </p>

          <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <SignUpButton mode="modal">
              <Button
                size="lg"
                className="group w-full rounded-full px-6 sm:w-auto"
              >
                Get started
                <IconArrowRight
                  size={16}
                  aria-hidden
                  className="motion-base group-hover:translate-x-0.5"
                />
              </Button>
            </SignUpButton>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="w-full rounded-full px-5 sm:w-auto"
            >
              <a href={EVA_GITHUB_URL} target="_blank" rel="noreferrer">
                <IconBrandGithub size={16} aria-hidden />
                Self-host it
              </a>
            </Button>
          </div>
        </div>
      </LandingReveal>
    </LandingSection>
  );
}
