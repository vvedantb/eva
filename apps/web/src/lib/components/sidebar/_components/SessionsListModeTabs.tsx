"use client";

import { Tabs, TabsList, TabsTrigger } from "@vvedantb/ui";
import {
  isSessionListMode,
  type SessionListMode,
} from "@/lib/components/sidebar/_utils/sessionsSidebarSettings";

interface SessionsListModeTabsProps {
  mode: SessionListMode;
  onChange: (mode: SessionListMode) => void;
}

/** Segmented Active / Archived switch for the Sessions sidebar. */
export function SessionsListModeTabs({
  mode,
  onChange,
}: SessionsListModeTabsProps) {
  return (
    <Tabs
      value={mode}
      onValueChange={(value) => {
        if (isSessionListMode(value)) onChange(value);
      }}
      className="w-full"
    >
      <TabsList className="tabs-segmented h-8 w-full">
        <TabsTrigger value="active" className="flex-1 px-2.5 py-1 text-xs">
          Active
        </TabsTrigger>
        <TabsTrigger value="archived" className="flex-1 px-2.5 py-1 text-xs">
          Archived
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
