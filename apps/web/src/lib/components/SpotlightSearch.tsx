"use client";

import { useDeferredValue, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  CommandShortcut,
} from "@eva/ui";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import type { FunctionReturnType } from "convex/server";
import { useSearch } from "@/lib/contexts/SearchContext";
import { MarqueeOnHover } from "@/lib/components/ui/MarqueeOnHover";
import {
  IconSearch,
  IconLayoutKanban,
  IconChecklist,
  IconTerminal2,
  IconFileText,
  IconFlask,
  IconChartBar,
  IconSettings,
  IconHome,
  IconInbox,
  IconUsers,
  IconBox,
  IconFolder,
  IconRobot,
  IconFileCode,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

type SpotlightHit = FunctionReturnType<typeof api.spotlight.search>[number];

type HitType = SpotlightHit["type"];

const GROUP_ORDER: HitType[] = [
  "page",
  "repo",
  "team",
  "project",
  "task",
  "session",
  "doc",
  "automation",
  "artifact",
];

const GROUP_LABEL: Record<HitType, string> = {
  page: "Pages",
  repo: "Repos",
  team: "Teams",
  project: "Projects",
  task: "Tasks",
  session: "Sessions",
  doc: "Documents",
  automation: "Automations",
  artifact: "Artifacts",
};

const TYPE_ICON: Record<
  HitType,
  ComponentType<{ size?: number; className?: string }>
> = {
  page: IconFolder,
  repo: IconBox,
  team: IconUsers,
  project: IconLayoutKanban,
  task: IconChecklist,
  session: IconTerminal2,
  doc: IconFileText,
  automation: IconRobot,
  artifact: IconFileCode,
};

function iconForPageTitle(title: string) {
  switch (title) {
    case "Home":
      return IconHome;
    case "Inbox":
      return IconInbox;
    case "Messages":
      return IconInbox;
    case "Sessions":
      return IconTerminal2;
    case "Projects":
      return IconLayoutKanban;
    case "Quick Tasks":
      return IconChecklist;
    case "Documents":
      return IconFileText;
    case "Testing Arena":
      return IconFlask;
    case "Stats":
      return IconChartBar;
    case "Settings":
      return IconSettings;
    case "Teams":
      return IconUsers;
    case "Artifacts":
      return IconFileCode;
    case "Automations":
      return IconRobot;
    default:
      return IconSearch;
  }
}

function groupHits(hits: SpotlightHit[]): Array<{
  type: HitType;
  items: SpotlightHit[];
}> {
  const buckets = new Map<HitType, SpotlightHit[]>();
  for (const hit of hits) {
    const existing = buckets.get(hit.type);
    if (existing) {
      existing.push(hit);
    } else {
      buckets.set(hit.type, [hit]);
    }
  }
  return GROUP_ORDER.flatMap((type) => {
    const items = buckets.get(type);
    if (!items || items.length === 0) return [];
    return [{ type, items }];
  });
}

export function SpotlightSearch() {
  const { isOpen, setIsOpen } = useSearch();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const navigate = useNavigate();

  const results = useQuery(
    api.spotlight.search,
    isOpen ? { query: deferredSearch, limit: 40 } : "skip",
  );

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) setSearch("");
  };

  const handleSelect = (href: string) => {
    navigate({ to: href });
    setIsOpen(false);
    setSearch("");
  };

  const groups = results ? groupHits(results) : [];

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        hideCloseButton
        className="h-[min(28rem,70dvh)] max-w-xl gap-0 overflow-hidden p-0"
      >
        <Command
          shouldFilter={false}
          className="flex h-full min-h-0 flex-col border-0"
        >
          <CommandInput
            autoFocus
            placeholder="Search across your teams and repos…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="min-h-0 flex-1 max-h-none">
            <CommandEmpty className="flex h-full min-h-48 items-center justify-center py-0">
              {results === undefined ? "Searching…" : "No results found"}
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.type} heading={GROUP_LABEL[group.type]}>
                {group.items.map((hit) => {
                  const Icon =
                    hit.type === "page"
                      ? iconForPageTitle(hit.title)
                      : TYPE_ICON[hit.type];
                  return (
                    <CommandItem
                      key={`${hit.type}:${hit.href}`}
                      value={`${hit.type} ${hit.title} ${hit.subtitle} ${hit.href}`}
                      onSelect={() => handleSelect(hit.href)}
                    >
                      <Icon size={16} className="text-muted-foreground" />
                      <MarqueeOnHover className="min-w-0 flex-1">
                        {hit.title}
                      </MarqueeOnHover>
                      <CommandShortcut className="max-w-[40%] truncate normal-case tracking-normal">
                        {hit.subtitle}
                      </CommandShortcut>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
