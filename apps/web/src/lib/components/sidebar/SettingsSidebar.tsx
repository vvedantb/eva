"use client";

import { Link } from "@tanstack/react-router";
import {
  IconKey,
  IconCamera,
  IconFolders,
  IconSettings2,
  IconChartBar,
  IconPlug,
  IconTerminal2,
  IconSparkles,
  IconLayoutGrid,
} from "@tabler/icons-react";
import {
  SharedLayoutNav,
  SharedLayoutNavSurface,
  sidebarNavLinkClassCompact,
  sidebarSectionLabelClass,
} from "@/lib/components/sidebar/SharedLayoutNav";

interface SettingsSidebarProps {
  basePath: string;
  pathname: string;
  onNavigate?: () => void;
}

export function SettingsSidebar({
  basePath,
  pathname,
  onNavigate,
}: SettingsSidebarProps) {
  const baseUrl = `${basePath}/settings`;

  // Simple view redirects out of /settings entirely, so no filtering here.
  const navigationGroups = [
    {
      label: "General",
      items: [
        { name: "Repository", href: `${baseUrl}/config`, icon: IconSettings2 },
        { name: "Skills", href: `${baseUrl}/skills`, icon: IconSparkles },
        { name: "Monorepo", href: `${baseUrl}/monorepo`, icon: IconFolders },
      ],
    },
    {
      label: "Sandbox",
      items: [
        { name: "App", href: `${baseUrl}/app`, icon: IconTerminal2 },
        { name: "Tabs", href: `${baseUrl}/tabs`, icon: IconLayoutGrid },
        {
          name: "Env Variables",
          href: `${baseUrl}/env-variables/repo`,
          icon: IconKey,
        },
        { name: "Snapshots", href: `${baseUrl}/snapshots`, icon: IconCamera },
      ],
    },
    {
      label: "Review",
      items: [
        { name: "MCP Config", href: `${baseUrl}/mcp-config`, icon: IconPlug },
        { name: "Usage", href: `${baseUrl}/logs`, icon: IconChartBar },
      ],
    },
  ];

  return (
    <SharedLayoutNav layoutId="settings-nav" className="space-y-4">
      {navigationGroups.map((group) => (
        <div key={group.label}>
          <p className={sidebarSectionLabelClass}>{group.label}</p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const isActive = pathname.startsWith(item.href);
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
                  </Link>
                </SharedLayoutNavSurface>
              );
            })}
          </div>
        </div>
      ))}
    </SharedLayoutNav>
  );
}
