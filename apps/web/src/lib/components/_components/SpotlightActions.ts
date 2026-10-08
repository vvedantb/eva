import {
  IconChecklist,
  IconContrast,
  IconDeviceDesktop,
  IconKeyboard,
  IconLayoutSidebar,
  IconMoon,
  IconSettings,
  IconSun,
  IconTerminal2,
} from "@tabler/icons-react";
import type { SpotlightIcon } from "@/lib/components/_components/spotlightGroups";
import type { ThemeMode } from "@/lib/hooks/useThemeMode";
import type { ShortcutId } from "@/lib/hotkeys/registry";

export interface SpotlightAction {
  id: string;
  title: string;
  /** Matched against the query but never shown — synonyms for the title. */
  keywords: string;
  icon: SpotlightIcon;
  /** Shown as a key cap when the action also has a shortcut. */
  shortcutId?: ShortcutId;
  run: () => void;
}

interface SpotlightActionDeps {
  navigate: (href: string) => void;
  toggleSidebar: () => void;
  setTheme: (mode: ThemeMode) => void;
  openShortcutsCheatsheet: () => void;
  /**
   * The current URL's repo, as a quick-tasks link. Quick tasks belong to an
   * app, so the action is omitted rather than guessing one when the user is
   * somewhere global.
   */
  quickTasksHref: string | null;
}

const THEME_ACTIONS: Array<{ mode: ThemeMode; label: string; icon: SpotlightIcon }> =
  [
    { mode: "light", label: "Light", icon: IconSun },
    { mode: "dark", label: "Dark", icon: IconMoon },
    { mode: "neutral", label: "Neutral", icon: IconContrast },
    { mode: "system", label: "System", icon: IconDeviceDesktop },
  ];

/**
 * The commands spotlight offers alongside the things it finds — the half of a
 * command palette that is not search. Built per render from the handlers the
 * dialog holds, so nothing here needs its own state.
 */
export function buildSpotlightActions(
  deps: SpotlightActionDeps,
): SpotlightAction[] {
  const actions: SpotlightAction[] = [
    {
      id: "new-session",
      title: "New session",
      keywords: "create start chat agent",
      icon: IconTerminal2,
      run: () => deps.navigate("/sessions"),
    },
  ];

  const quickTasksHref = deps.quickTasksHref;
  if (quickTasksHref !== null) {
    actions.push({
      id: "new-quick-task",
      title: "New quick task",
      keywords: "create todo work item",
      icon: IconChecklist,
      shortcutId: "newQuickTask",
      run: () => deps.navigate(quickTasksHref),
    });
  }

  actions.push({
    id: "toggle-sidebar",
    title: "Toggle sidebar",
    keywords: "collapse expand hide show navigation",
    icon: IconLayoutSidebar,
    shortcutId: "toggleSidebar",
    run: deps.toggleSidebar,
  });

  for (const theme of THEME_ACTIONS) {
    actions.push({
      id: `theme-${theme.mode}`,
      title: `Theme: ${theme.label}`,
      keywords: "appearance dark light colour color mode",
      icon: theme.icon,
      run: () => deps.setTheme(theme.mode),
    });
  }

  actions.push(
    {
      id: "open-shortcut-settings",
      title: "Open shortcuts",
      keywords: "settings rebind keyboard keys customise",
      icon: IconSettings,
      run: () => deps.navigate("/settings/shortcuts"),
    },
    {
      id: "shortcuts-cheatsheet",
      title: "Keyboard shortcuts",
      keywords: "cheatsheet keys help hotkeys",
      icon: IconKeyboard,
      shortcutId: "showShortcuts",
      run: deps.openShortcutsCheatsheet,
    },
  );

  return actions;
}

/** Actions are filtered here rather than by cmdk, which the dialog has off. */
export function filterSpotlightActions(
  actions: SpotlightAction[],
  query: string,
): SpotlightAction[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return actions;
  return actions.filter((action) =>
    `${action.title} ${action.keywords}`.toLowerCase().includes(normalized),
  );
}
