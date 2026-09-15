"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@eva/ui";
import { useClerk } from "@clerk/clerk-react";
import { UserInitials } from "@eva/shared/user-initials";
import {
  IconUserCog,
  IconLogout,
  IconSearch,
  IconSun,
  IconMoon,
  IconCircleHalf,
  IconLoader2,
} from "@tabler/icons-react";
import { useThemeContext } from "@/lib/contexts/useThemeContext";
import { useSearch } from "@/lib/contexts/SearchContext";
import {
  ConfirmSkipHint,
  requestConfirm,
  skipConfirmTitle,
  useAltHeld,
} from "@/lib/confirm";

interface SidebarUserMenuProps {
  name: string;
  /** Search only does anything on repo routes, so the item is gated. */
  showSearch?: boolean;
}

/**
 * Avatar-only account menu for the left icon rail. Name sits above the actions
 * (sentence case — not the shared uppercase menu-label style); email is omitted.
 *
 * Sign out is destructive, so it confirms in a dialog (sibling of the
 * dropdown) so the menu can close cleanly before the dialog traps focus.
 */
export function SidebarUserMenu({ name, showSearch }: SidebarUserMenuProps) {
  const { openUserProfile, signOut } = useClerk();
  const { theme, toggleTheme } = useThemeContext();
  const { openSearch } = useSearch();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const altHeld = useAltHeld();

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      setIsSigningOut(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={name}
            aria-label={`Account menu for ${name}`}
            className="relative flex size-11 items-center justify-center rounded-lg border border-transparent opacity-75 motion-press active:scale-[0.96] hover:bg-sidebar-accent/50 hover:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring/35"
          >
            <UserInitials
              user={{ fullName: name }}
              hideLastSeen
              size="md"
              disableProfileCard
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          side="right"
          sideOffset={8}
          className="w-56"
        >
          <DropdownMenuLabel className="flex items-center justify-center gap-2 normal-case tracking-normal font-normal">
            <UserInitials
              user={{ fullName: name }}
              hideLastSeen
              size="sm"
              disableProfileCard
            />
            <p
              data-pii
              className="truncate text-sm font-medium text-foreground"
            >
              {name}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void openUserProfile()}>
            <IconUserCog size={16} className="mr-2" />
            Manage account
          </DropdownMenuItem>
          {showSearch ? (
            <DropdownMenuItem onSelect={() => openSearch()}>
              <IconSearch size={16} className="mr-2" />
              Search
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => toggleTheme()}>
            {theme === "dark" ? (
              <IconSun size={16} className="mr-2" />
            ) : theme === "neutral" ? (
              <IconMoon size={16} className="mr-2" />
            ) : (
              <IconCircleHalf size={16} className="mr-2" />
            )}
            {theme === "dark"
              ? "Light mode"
              : theme === "neutral"
                ? "Dark mode"
                : "Neutral mode"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              requestConfirm(
                altHeld,
                () => setConfirmOpen(true),
                () => {
                  void handleSignOut();
                },
              )
            }
            className="text-destructive focus:text-destructive"
            title={skipConfirmTitle("Sign out")}
          >
            <IconLogout size={16} className="mr-2" />
            Sign out
            <ConfirmSkipHint />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !isSigningOut) setConfirmOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign out</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Sign out of your account? You&apos;ll need to sign back in to
            continue.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={isSigningOut}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
            >
              {isSigningOut && (
                <IconLoader2 size={16} className="animate-spin" />
              )}
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
