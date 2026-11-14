"use client";

import { useClerk } from "@clerk/clerk-react";
import { IconEva, ProductHero, ProductHeroOrbit } from "@vvedantb/ui";
import { EVA_GITHUB_URL, LANDING_HERO } from "./landingContent";

/**
 * The shared Project V hero, so every app opens the same way. Sign in stays in
 * `LandingNav`, so the hero gets no `signIn`. The product mock is not a hero
 * visual; it sits in `LandingPreview` directly below.
 */
export function LandingHero() {
  const clerk = useClerk();

  return (
    <ProductHero
      title={`${LANDING_HERO.headlineLead} ${LANDING_HERO.headlineTail}`}
      tagline={LANDING_HERO.lede}
      primaryCta={{
        label: "Get started",
        onClick: () => {
          clerk.openSignUp();
        },
      }}
      secondaryCta={{
        label: "Star on GitHub",
        href: EVA_GITHUB_URL,
        target: "_blank",
        rel: "noreferrer",
      }}
      visual={
        <ProductHeroOrbit>
          <IconEva size={40} />
        </ProductHeroOrbit>
      }
      showProductOf={false}
    />
  );
}
