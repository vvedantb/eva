"use client";

import { Tabs, TabsList, TabsTrigger } from "@vvedantb/ui";
import {
  ARCHIVE_LIST_MODES,
  ARCHIVE_LIST_MODE_LABELS,
  isArchiveListMode,
  type ArchiveListMode,
} from "@eva/shared";

interface ListModeTabsProps {
  mode: ArchiveListMode;
  onChange: (mode: ArchiveListMode) => void;
  className?: string;
}

/** Segmented Active / Archived switch: the Sessions sidebar, Quick tasks and Projects. */
export function ListModeTabs({ mode, onChange, className }: ListModeTabsProps) {
  return (
    <Tabs
      value={mode}
      onValueChange={(value) => {
        if (isArchiveListMode(value)) onChange(value);
      }}
      className={className ?? "w-full"}
    >
      <TabsList className="tabs-segmented h-8 w-full">
        {ARCHIVE_LIST_MODES.map((value) => (
          <TabsTrigger
            key={value}
            value={value}
            className="flex-1 px-2.5 py-1 text-xs"
          >
            {ARCHIVE_LIST_MODE_LABELS[value]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
