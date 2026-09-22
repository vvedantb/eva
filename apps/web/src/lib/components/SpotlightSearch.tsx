"use client";

import { useDeferredValue, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  Dialog,
  DialogContent,
} from "@eva/ui";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@eva/backend";
import { useSearch } from "@/lib/contexts/SearchContext";
import { useSidebar } from "@/lib/contexts/SidebarContext";
import { useThemeMode } from "@/lib/hooks/useThemeMode";
import { useRecentSpotlightItems } from "@/lib/hooks/useRecentSpotlightItems";
import { openShortcutsCheatsheet } from "@/lib/hotkeys/shortcutsCheatsheetStore";
import { ShortcutKbd } from "@/lib/components/ui/Kbd";
import {
  buildSpotlightActions,
  filterSpotlightActions,
} from "@/lib/components/_components/SpotlightActions";
import {
  GROUP_LABEL,
  groupHits,
  iconForHit,
  iconForRecent,
} from "@/lib/components/_components/spotlightGroups";
import { SpotlightItem } from "@/lib/components/_components/SpotlightItem";

<<<<<<< HEAD
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
=======
/** What a selected row records in Recents — the shape both hits and recents share. */
interface SelectableHit {
  type: string;
  title: string;
  subtitle: string;
  href: string;
>>>>>>> origin/main
}

export function SpotlightSearch() {
  const { isOpen, setIsOpen } = useSearch();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const navigate = useNavigate();
  const { collapsed, setCollapsed } = useSidebar();
  const { setTheme } = useThemeMode();
  const { recents, record } = useRecentSpotlightItems();
  // Quick tasks belong to an app, so the action needs the repo in the URL.
  const { owner, repo } = useParams({ strict: false });

  const results = useQuery(
    api.spotlight.search,
    isOpen ? { query: deferredSearch, limit: 40 } : "skip",
  );

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) setSearch("");
  };

  const handleSelect = (hit: SelectableHit) => {
    record({
      type: hit.type,
      title: hit.title,
      subtitle: hit.subtitle,
      href: hit.href,
    });
    navigate({ to: hit.href });
    setIsOpen(false);
    setSearch("");
  };

  const runAction = (run: () => void) => {
    run();
    setIsOpen(false);
    setSearch("");
  };

  const actions = filterSpotlightActions(
    buildSpotlightActions({
      navigate: (href) => navigate({ to: href }),
      toggleSidebar: () => setCollapsed(!collapsed),
      setTheme,
      openShortcutsCheatsheet,
      quickTasksHref:
        owner !== undefined && repo !== undefined
          ? `/${owner}/${repo}/quick-tasks`
          : null,
    }),
    search,
  );

  const groups = results ? groupHits(results) : [];
  const showRecents = search.trim().length === 0 && recents.length > 0;

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
            {/* Where you were, then what you can do, then what was found. */}
            {showRecents ? (
              <CommandGroup heading="Recent">
                {recents.map((item, index) => (
                  <SpotlightItem
                    key={`recent:${item.href}`}
                    value={`recent ${item.title} ${item.href}`}
                    icon={iconForRecent(item.type, item.title)}
                    title={item.title}
                    trailing={item.subtitle}
                    index={index}
                    onSelect={() => handleSelect(item)}
                  />
                ))}
              </CommandGroup>
            ) : null}
            {actions.length > 0 ? (
              <CommandGroup heading="Actions">
                {actions.map((action, index) => (
                  <SpotlightItem
                    key={action.id}
                    value={`action ${action.title} ${action.keywords}`}
                    icon={action.icon}
                    title={action.title}
                    trailing={
                      action.shortcutId === undefined ? undefined : (
                        <ShortcutKbd id={action.shortcutId} />
                      )
                    }
                    index={index}
                    onSelect={() => runAction(action.run)}
                  />
                ))}
              </CommandGroup>
            ) : null}
            {groups.map((group) => (
              <CommandGroup key={group.type} heading={GROUP_LABEL[group.type]}>
                {group.items.map((hit, index) => (
                  <SpotlightItem
                    key={`${hit.type}:${hit.href}`}
                    value={`${hit.type} ${hit.title} ${hit.subtitle} ${hit.href}`}
                    icon={iconForHit(hit.type, hit.title)}
                    title={hit.title}
                    trailing={hit.subtitle}
                    index={index}
                    onSelect={() => handleSelect(hit)}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
