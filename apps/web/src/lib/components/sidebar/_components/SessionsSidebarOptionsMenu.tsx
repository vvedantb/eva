"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
} from "@eva/ui";
import {
  IconAdjustmentsHorizontal,
  IconLayoutList,
  IconList,
  IconMinus,
  IconPlus,
  IconSortDescending,
} from "@tabler/icons-react";
import {
  APP_SORT_LABELS,
  APP_SORT_ORDERS,
  isAppSortOrder,
  isSessionLayout,
  isSessionSortOrder,
  MAX_SESSION_PREVIEW_COUNT,
  MIN_SESSION_PREVIEW_COUNT,
  SESSION_LAYOUT_LABELS,
  SESSION_LAYOUTS,
  SESSION_SORT_LABELS,
  SESSION_SORT_ORDERS,
} from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";
import { useSessionsSidebarSettings } from "@/lib/components/sidebar/useSessionsSidebarSettings";

/**
 * Sessions panel options — same control surface as Projects Options
 * (Eva menu tokens + header icon button).
 */
export function SessionsSidebarOptionsMenu() {
  const {
    settings,
    setAppSortOrder,
    setSessionSortOrder,
    setSessionPreviewCount,
    setLayout,
    setOnlyMine,
  } = useSessionsSidebarSettings();

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
            <IconLayoutList size={16} />
            View
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={settings.layout}
              onValueChange={(value) => {
                if (isSessionLayout(value)) setLayout(value);
              }}
            >
              {SESSION_LAYOUTS.map((layout) => (
                <DropdownMenuRadioItem key={layout} value={layout}>
                  {SESSION_LAYOUT_LABELS[layout]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconSortDescending size={16} />
            Sort projects
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
                  {APP_SORT_LABELS[order]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <IconList size={16} />
            Sort threads
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={settings.sessionSortOrder}
              onValueChange={(value) => {
                if (isSessionSortOrder(value)) setSessionSortOrder(value);
              }}
            >
              {SESSION_SORT_ORDERS.map((order) => (
                <DropdownMenuRadioItem key={order} value={order}>
                  {SESSION_SORT_LABELS[order]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuCheckboxItem
          checked={settings.onlyMine}
          onCheckedChange={(checked) => setOnlyMine(checked === true)}
          onSelect={(e) => e.preventDefault()}
        >
          Only my sessions
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Visible threads</DropdownMenuLabel>
        <div className="flex items-center gap-1 px-2.5 pb-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Decrease visible thread count"
            disabled={settings.sessionPreviewCount <= MIN_SESSION_PREVIEW_COUNT}
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault();
              setSessionPreviewCount(settings.sessionPreviewCount - 1);
            }}
          >
            <IconMinus size={16} />
          </Button>
          <span className="min-w-8 flex-1 text-center text-sm tabular-nums text-muted-foreground">
            {settings.sessionPreviewCount}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Increase visible thread count"
            disabled={settings.sessionPreviewCount >= MAX_SESSION_PREVIEW_COUNT}
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault();
              setSessionPreviewCount(settings.sessionPreviewCount + 1);
            }}
          >
            <IconPlus size={16} />
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
