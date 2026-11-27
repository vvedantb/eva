"use client";

import { Link } from "@tanstack/react-router";
import { IconMoon, IconSun, IconCircleHalf } from "@tabler/icons-react";
import { AveHeaderButton } from "@/lib/components/ave/AveHeaderButton";
import { LogoMark } from "@/lib/components/LogoMark";
import { Button, Sidebar } from "@vvedantb/ui";
import { type ThemeMode } from "@/lib/hooks/useThemeMode";

interface SidebarMobileHeaderProps {
  title: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

/** Content of the package mobile header (below `md`): page title, Ave and theme toggle. */
export function SidebarMobileHeader({
  title,
  theme,
  onToggleTheme,
}: SidebarMobileHeaderProps) {
  return (
    <Sidebar.MobileHeader>
      <Sidebar.MobileMenuButton label="Open navigation" />
      {title ? (
        <Sidebar.MobileTitle>{title}</Sidebar.MobileTitle>
      ) : (
        <Link
          to="/home"
          className="flex min-w-0 items-center gap-2 justify-self-center rounded-surface border border-border bg-muted/40 px-2.5 py-1.5"
        >
          <LogoMark size={26} />
          <span className="text-sm font-semibold tracking-[-0.02em] text-primary">
            Eva
          </span>
        </Link>
      )}
      <Sidebar.MobileActions>
        <AveHeaderButton />
        <Button
          shape="rounded"
          size="icon"
          variant="ghost"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="shrink-0"
        >
          {theme === "dark" ? (
            <IconSun size={18} className="text-muted-foreground" />
          ) : theme === "neutral" ? (
            <IconMoon size={18} className="text-muted-foreground" />
          ) : (
            <IconCircleHalf size={18} className="text-muted-foreground" />
          )}
        </Button>
      </Sidebar.MobileActions>
    </Sidebar.MobileHeader>
  );
}
