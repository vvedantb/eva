"use client";

import { SignInButton, SignUpButton } from "@clerk/clerk-react";
import { IconBrandGithub } from "@tabler/icons-react";
import { Button } from "@eva/ui";
import { EVA_GITHUB_URL, LANDING_NAV_LINKS } from "./landingContent";
import { LandingBrand } from "./LandingBrand";
import { LandingNavMenu } from "./LandingNavMenu";

/**
 * Floating pill nav. The header itself is transparent and 80px tall; the hero
 * pulls up under it with `-mt-20` so the atmosphere shows behind the glass.
 * Section links are anchors rather than router links — they scroll the
 * marketing page, they do not navigate.
 */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 h-20 px-3 pt-3 sm:px-5">
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-6 rounded-full bg-background/70 pl-4 pr-2 ring-1 ring-border/70 backdrop-blur-md sm:pl-5">
        <LandingBrand href="#top" />

        <ul className="hidden items-center gap-0.5 lg:flex">
          {LANDING_NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="motion-base rounded-full px-3.5 py-2 text-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="hidden rounded-full sm:inline-flex"
          >
            <a
              href={EVA_GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Eva on GitHub"
            >
              <IconBrandGithub size={18} />
            </a>
          </Button>
          <SignInButton mode="modal">
            {/* Visible at every width: an existing user on a phone needs a way
                in, and "Get started" sends them to sign-up instead. */}
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm" className="rounded-full px-4">
              Get started
            </Button>
          </SignUpButton>
          <LandingNavMenu />
        </div>
      </nav>
    </header>
  );
}
