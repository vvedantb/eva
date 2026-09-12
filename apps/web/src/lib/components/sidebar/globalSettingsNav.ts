import {
  IconBell,
  IconCode,
  IconFlask,
  IconGitBranch,
  IconKey,
  IconKeyboard,
  IconPalette,
  IconRobot,
  IconServerBolt,
  IconUserCog,
} from "@tabler/icons-react";

/** Shared nav for the rail settings menu and the global Settings sidebar. */
export const GLOBAL_SETTINGS_NAV = [
  {
    name: "Theme",
    href: "/settings/theme",
    icon: IconPalette,
  },
  {
    name: "Personalisation",
    href: "/settings/personalisation",
    icon: IconUserCog,
  },
  {
    name: "Shortcuts",
    href: "/settings/shortcuts",
    icon: IconKeyboard,
  },
  {
    name: "Accounts",
    href: "/settings/accounts",
    icon: IconKey,
  },
  {
    name: "Grok Bot",
    href: "/settings/grok-bot",
    icon: IconRobot,
  },
  {
    name: "Notifications",
    href: "/settings/notifications",
    icon: IconBell,
  },
  {
    name: "Sandboxes",
    href: "/settings/sandboxes",
    icon: IconServerBolt,
  },
  {
    name: "Sync",
    href: "/settings/sync",
    icon: IconGitBranch,
  },
  {
    name: "Experimental",
    href: "/settings/experimental",
    icon: IconFlask,
  },
] as const;

/** Dev-only entry shown under Settings. */
export const GLOBAL_SETTINGS_TESTING = {
  name: "Testing",
  href: "/testing",
  icon: IconCode,
} as const;
