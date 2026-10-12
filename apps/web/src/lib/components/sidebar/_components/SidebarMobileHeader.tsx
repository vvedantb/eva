import { Link } from "@tanstack/react-router";
import {
  IconMenu2,
  IconMoon,
  IconSun,
  IconCircleHalf,
} from "@tabler/icons-react";
import { AveHeaderButton } from "@/lib/components/ave/AveHeaderButton";
import { LogoMark } from "@/lib/components/LogoMark";
import { Button } from "@eva/ui";
import { type ThemeMode } from "@/lib/hooks/useThemeMode";

interface SidebarMobileHeaderProps {
  title: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  setMobileOpen: (open: boolean) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

/** Fixed top bar below `lg`: drawer trigger, page title and theme toggle. */
export function SidebarMobileHeader({
  title,
  theme,
  onToggleTheme,
  setMobileOpen,
  onKeyDown,
}: SidebarMobileHeaderProps) {
  return (
    <header
      onKeyDown={onKeyDown}
      className="fixed inset-x-0 top-0 z-30 flex h-(--eva-mobile-header-height) items-center gap-2 bg-background/80 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:px-4 lg:hidden"
    >
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        className="-ml-1 max-sm:shrink-0"
      >
        <IconMenu2 size={20} className="text-muted-foreground" />
      </Button>
      {title ? (
        <h1 className="mx-auto max-sm:min-w-0 truncate text-base font-semibold tracking-[-0.02em] text-foreground text-balance">
          {title}
        </h1>
      ) : (
        <Link
          to="/home"
          className="mx-auto flex max-sm:min-w-0 max-sm:shrink-0 items-center gap-2 rounded-surface border border-border bg-muted/40 px-2.5 py-1.5"
        >
          <LogoMark size={26} />
          <span className="text-sm font-semibold tracking-[-0.02em] text-primary">
            Eva
          </span>
        </Link>
      )}
      {/* Manager Ave's summon button lives here below `lg`; the floating
          launcher is desktop-only because it covers the composer's send
          button on a phone. */}
      <AveHeaderButton />
      <Button
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
    </header>
  );
}
