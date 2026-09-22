"use client";

import { Link } from "@tanstack/react-router";
import {
  IconLayoutDashboard,
  IconSparkles,
  IconStack2,
} from "@tabler/icons-react";
import {
  SharedLayoutNav,
  SharedLayoutNavSurface,
  sidebarNavLinkClassCompact,
} from "@/lib/components/sidebar/SharedLayoutNav";
import { HomeTeamsNav } from "@/lib/components/sidebar/_components/HomeTeamsNav";
import { ChangelogUnreadDot } from "@/lib/components/sidebar/_components/ChangelogUnreadDot";

const WHATS_NEW_HREF = "/whats-new";

const HOME_NAV = [
  { name: "Artifacts", href: "/artifacts", icon: IconLayoutDashboard },
  { name: "What's New", href: WHATS_NEW_HREF, icon: IconSparkles },
] as const;

interface HomeSidebarProps {
  pathname: string;
  onNavigate?: () => void;
}

/** Second sidebar column for the global home routes (see `HOME_ROOTS`). */
export function HomeSidebar({ pathname, onNavigate }: HomeSidebarProps) {
  const codebasesActive = pathname === "/home" || pathname.startsWith("/home/");

  return (
    <SharedLayoutNav layoutId="home-nav" className="space-y-1">
      <SharedLayoutNavSurface itemId="Codebases" isActive={codebasesActive}>
        <Link
          to="/home"
          onClick={onNavigate}
          className={sidebarNavLinkClassCompact(codebasesActive)}
        >
          <IconStack2 size={14} />
          <span>Codebases</span>
        </Link>
      </SharedLayoutNavSurface>
      <HomeTeamsNav pathname={pathname} onNavigate={onNavigate} />
      {HOME_NAV.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <SharedLayoutNavSurface
            key={item.name}
            itemId={item.name}
            isActive={isActive}
          >
            <Link
              to={item.href}
              onClick={onNavigate}
              className={sidebarNavLinkClassCompact(isActive)}
            >
              <item.icon size={14} />
              <span>{item.name}</span>
              {item.href === WHATS_NEW_HREF ? <ChangelogUnreadDot /> : null}
            </Link>
          </SharedLayoutNavSurface>
        );
      })}
    </SharedLayoutNav>
  );
}
