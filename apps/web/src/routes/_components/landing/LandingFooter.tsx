"use client";

import { IconBrandGithub } from "@tabler/icons-react";
import {
  EVA_GITHUB_URL,
  EVA_SETUP_URL,
  LANDING_NAV_LINKS,
} from "./landingContent";
import { LandingBrand } from "./LandingBrand";

/** Hairline footer: brand line, the same anchors as the nav, and the repository. */
export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-12 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div className="flex flex-col gap-2">
          <LandingBrand href="#top" />
          <p className="text-sm text-muted-foreground">
            MIT licensed and free to self-host.
          </p>
        </div>

        {/* `hit-target` on every link: at `text-sm` these are 20px tall, which is
            half a comfortable thumb. It grows the pressable box, not the layout. */}
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {LANDING_NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="motion-base max-sm:hit-target max-sm:py-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <a
            href={EVA_SETUP_URL}
            target="_blank"
            rel="noreferrer"
            className="motion-base max-sm:hit-target max-sm:py-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Self-host
          </a>
          <a
            href={EVA_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Eva on GitHub"
            className="motion-base max-sm:hit-target max-sm:py-1 text-muted-foreground hover:text-foreground"
          >
            <IconBrandGithub size={18} />
          </a>
        </nav>
      </div>
    </footer>
  );
}
