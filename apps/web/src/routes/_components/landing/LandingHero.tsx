"use client";

import { useClerk } from "@clerk/clerk-react";
import { IconEva, ProductHero, ProductHeroOrbit } from "@vvedantb/ui";
import { EVA_GITHUB_URL, LANDING_HERO } from "./landingContent";

type LandingHeroProps = {
  compact?: boolean;
};

/**
 * The shared Project V hero, so every app opens the same way, on both versions
 * of the landing page. The product mock is not a hero visual; on the full page
 * it sits in `LandingPreview` directly below.
 */
export function LandingHero({ compact = false }: LandingHeroProps) {
  const clerk = useClerk();

  return (
    <ProductHero
      title={LANDING_HERO.headline}
      tagline={compact ? LANDING_HERO.compactLede : LANDING_HERO.lede}
      primaryCta={
        compact
          ? {
              label: "Sign in",
              onClick: () => {
                clerk.openSignIn();
              },
            }
          : {
              label: "Get started",
              onClick: () => {
                clerk.openSignUp();
              },
            }
      }
      secondaryCta={
        compact
          ? undefined
          : {
              label: "Star on GitHub",
              href: EVA_GITHUB_URL,
              target: "_blank",
              rel: "noreferrer",
            }
      }
      visual={
        <ProductHeroOrbit>
          <IconEva size={40} />
        </ProductHeroOrbit>
      }
      showProductOf={false}
    />
  );
}
