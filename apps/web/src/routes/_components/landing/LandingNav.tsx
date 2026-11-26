"use client";

import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { Button, SiteHeader } from "@vvedantb/ui";
import { EVA_GITHUB_URL, LANDING_NAV_LINKS } from "./landingContent";
import { LandingBrand } from "./LandingBrand";

/**
 * The shared floating header. Section links are anchors rather than router
 * links: they scroll the marketing page, they do not navigate.
 *
 * Sign in sits in the bar at every width, because an existing user on a phone
 * needs a way in. Get started moves into the menu below `md`.
 */
export function LandingNav() {
  return (
    <SiteHeader
      brand={<LandingBrand />}
      homeHref="#top"
      homeLabel="Eva, back to top"
      links={LANDING_NAV_LINKS}
      githubUrl={EVA_GITHUB_URL}
      githubLabel="Eva on GitHub"
      actions={
        <SignInButton mode="modal">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Button>
        </SignInButton>
      }
      cta={
        <SignUpButton mode="modal">
          <Button size="sm" className="rounded-full px-4">
            Get started
          </Button>
        </SignUpButton>
      }
    />
  );
}
