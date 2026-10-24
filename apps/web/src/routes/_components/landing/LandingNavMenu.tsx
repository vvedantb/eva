"use client";

import { IconBrandGithub, IconMenu2 } from "@tabler/icons-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vvedantb/ui";
import { EVA_GITHUB_URL, LANDING_NAV_LINKS } from "./landingContent";

/** Menu rows are 36px by default; on touch they need the full 40px. */
const MENU_ITEM_CLASS = "max-sm:py-2.5";

/**
 * The nav's overflow menu below `lg`.
 *
 * The section links and the GitHub link do not fit in a phone-width bar, and
 * hiding them outright leaves no way to reach the page's own sections. Sign in
 * and Get started stay in the bar itself — a call to action inside an overflow
 * menu is a call to action nobody finds.
 */
export function LandingNavMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open menu"
          className="hit-target lg:hidden"
        >
          <IconMenu2 size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[70dvh] w-56 max-w-[calc(100vw-2rem)] overflow-y-auto"
      >
        {LANDING_NAV_LINKS.map((link) => (
          <DropdownMenuItem key={link.href} asChild className={MENU_ITEM_CLASS}>
            <a href={link.href}>{link.label}</a>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className={MENU_ITEM_CLASS}>
          <a href={EVA_GITHUB_URL} target="_blank" rel="noreferrer">
            <IconBrandGithub size={16} aria-hidden />
            GitHub
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
