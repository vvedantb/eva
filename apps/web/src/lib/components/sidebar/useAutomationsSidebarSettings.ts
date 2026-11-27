"use client";

import { useLocalStorage } from "usehooks-ts";
import {
  AUTOMATIONS_SIDEBAR_SETTINGS_KEY,
  DEFAULT_AUTOMATIONS_SIDEBAR_SETTINGS,
  isAutomationSortOrder,
  type AutomationSortOrder,
  type AutomationsSidebarSettings,
} from "./_utils/automationsSidebarSettings";
import {
  clampSessionPreviewCount,
  isAppSortOrder,
  type AppSortOrder,
} from "./_utils/sessionsSidebarSettings";

function parseSettings(
  raw: AutomationsSidebarSettings,
): AutomationsSidebarSettings {
  const appSortOrder =
    typeof raw.appSortOrder === "string" && isAppSortOrder(raw.appSortOrder)
      ? raw.appSortOrder
      : DEFAULT_AUTOMATIONS_SIDEBAR_SETTINGS.appSortOrder;
  const automationSortOrder =
    typeof raw.automationSortOrder === "string" &&
    isAutomationSortOrder(raw.automationSortOrder)
      ? raw.automationSortOrder
      : DEFAULT_AUTOMATIONS_SIDEBAR_SETTINGS.automationSortOrder;
  return {
    appSortOrder,
    automationSortOrder,
    // Same 2–10 window as the Sessions sidebar, so both panels clamp alike.
    automationPreviewCount: clampSessionPreviewCount(
      raw.automationPreviewCount,
    ),
  };
}

/** Persisted Automations sidebar sort / preview prefs. */
export function useAutomationsSidebarSettings() {
  const [raw, setRaw] = useLocalStorage<AutomationsSidebarSettings>(
    AUTOMATIONS_SIDEBAR_SETTINGS_KEY,
    DEFAULT_AUTOMATIONS_SIDEBAR_SETTINGS,
  );
  const settings = parseSettings(raw);

  return {
    settings,
    setAppSortOrder: (appSortOrder: AppSortOrder) => {
      setRaw((prev) => ({ ...parseSettings(prev), appSortOrder }));
    },
    setAutomationSortOrder: (automationSortOrder: AutomationSortOrder) => {
      setRaw((prev) => ({ ...parseSettings(prev), automationSortOrder }));
    },
    setAutomationPreviewCount: (automationPreviewCount: number) => {
      setRaw((prev) => ({
        ...parseSettings(prev),
        automationPreviewCount: clampSessionPreviewCount(
          automationPreviewCount,
        ),
      }));
    },
  };
}
