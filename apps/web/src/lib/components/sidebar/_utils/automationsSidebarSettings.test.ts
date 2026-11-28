import { describe, expect, test } from "bun:test";
import {
  AUTOMATION_APP_SORT_LABELS,
  AUTOMATION_SORT_LABELS,
  AUTOMATION_SORT_ORDERS,
  DEFAULT_AUTOMATIONS_SIDEBAR_SETTINGS,
  isAutomationSortOrder,
} from "./automationsSidebarSettings";
import { APP_SORT_ORDERS } from "./sessionsSidebarSettings";

describe("automations sidebar defaults", () => {
  test("hold both lists still when a run lands", () => {
    expect(DEFAULT_AUTOMATIONS_SIDEBAR_SETTINGS.appSortOrder).toBe("manual");
    expect(DEFAULT_AUTOMATIONS_SIDEBAR_SETTINGS.automationSortOrder).toBe(
      "created_at",
    );
  });
});

describe("automation sort order guard", () => {
  test.each([...AUTOMATION_SORT_ORDERS])("accepts %s", (value) => {
    expect(isAutomationSortOrder(value)).toBe(true);
  });

  test.each(["manual", "", "recent", "Created_at"])(
    "rejects %s so a stale persisted value falls back",
    (value) => {
      expect(isAutomationSortOrder(value)).toBe(false);
    },
  );
});

describe("sort menu labels", () => {
  test("cover every order the menu can offer", () => {
    for (const order of APP_SORT_ORDERS) {
      expect(AUTOMATION_APP_SORT_LABELS[order]).toBeTruthy();
    }
    for (const order of AUTOMATION_SORT_ORDERS) {
      expect(AUTOMATION_SORT_LABELS[order]).toBeTruthy();
    }
  });
});
