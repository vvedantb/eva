"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vvedantb/ui";
import {
  IconAdjustmentsHorizontal,
  IconList,
  IconMinus,
  IconPlus,
  IconSortDescending,
} from "@tabler/icons-react";
import {
  AUTOMATION_APP_SORT_LABELS,
  AUTOMATION_SORT_LABELS,
  AUTOMATION_SORT_ORDERS,
  isAutomationSortOrder,
} from "@/lib/components/sidebar/_utils/automationsSidebarSettings";
import {
  APP_SORT_ORDERS,
  isAppSortOrder,
  MAX_SESSION_PREVIEW_COUNT,
  MIN_SESSION_PREVIEW_COUNT,
} from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import { useAutomationsSidebarSettings } from "@/lib/components/sidebar/useAutomationsSidebarSettings";

/**
 * Automations panel options — the Sessions options menu with automation
 * wording. There is no View entry: automation rows have a single layout.
 */
export function AutomationsSidebarOptionsMenu() {
  const {
    settings,
    setAppSortOrder,
    setAutomationSortOrder,
    setAutomationPreviewCount,
  } = useAutomationsSidebarSettings();

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              aria-label="Sidebar options"
            >
              <IconAdjustmentsHorizontal size={16} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Sidebar options</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconSortDescending size={16} />
            Sort apps
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={settings.appSortOrder}
              onValueChange={(value) => {
                if (isAppSortOrder(value)) setAppSortOrder(value);
              }}
            >
              {APP_SORT_ORDERS.map((order) => (
                <DropdownMenuRadioItem key={order} value={order}>
                  {AUTOMATION_APP_SORT_LABELS[order]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconList size={16} />
            Sort automations
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={settings.automationSortOrder}
              onValueChange={(value) => {
                if (isAutomationSortOrder(value)) setAutomationSortOrder(value);
              }}
            >
              {AUTOMATION_SORT_ORDERS.map((order) => (
                <DropdownMenuRadioItem key={order} value={order}>
                  {AUTOMATION_SORT_LABELS[order]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Visible automations</DropdownMenuLabel>
        <div className="flex items-center gap-1 px-2.5 pb-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Decrease visible automation count"
            disabled={
              settings.automationPreviewCount <= MIN_SESSION_PREVIEW_COUNT
            }
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault();
              setAutomationPreviewCount(settings.automationPreviewCount - 1);
            }}
          >
            <IconMinus size={16} />
          </Button>
          <span className="min-w-8 flex-1 text-center text-sm tabular-nums text-muted-foreground">
            {settings.automationPreviewCount}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Increase visible automation count"
            disabled={
              settings.automationPreviewCount >= MAX_SESSION_PREVIEW_COUNT
            }
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault();
              setAutomationPreviewCount(settings.automationPreviewCount + 1);
            }}
          >
            <IconPlus size={16} />
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
