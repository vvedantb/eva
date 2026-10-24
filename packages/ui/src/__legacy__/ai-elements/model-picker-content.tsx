"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { IconCheck, IconSearch } from "@tabler/icons-react";
import { Command, CommandEmpty, CommandItem, CommandList } from "../ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../utils/cn";
import { ProviderIcon } from "./provider-icon";
import {
  type ModelAccount,
  type ModelOption,
  formatModelDisplayLabel,
  getProviderLabel,
} from "./model-picker-types";

export type ModelPickerInstance = {
  key: string;
  provider: string;
  accountId: string | null;
  label: string;
};

type ModelPickerRow = {
  compositeKey: string;
  modelId: string;
  modelLabel: string;
  instance: ModelPickerInstance;
};

export function providerInstanceInitials(label: string): string {
  const words = label.replace(/[_-]+/g, " ").split(/\s+/u).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0];
  if (!first) return "";
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const second = words[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
}

export function teamInstanceKey(provider: string): string {
  return `team:${provider}`;
}

function toCompositeKey(instanceKey: string, modelId: string): string {
  return `${instanceKey}::${modelId}`;
}

export function buildPickerInstances<TModel extends string>(
  options: ReadonlyArray<ModelOption<TModel>>,
  accounts: ReadonlyArray<ModelAccount> | undefined,
): ModelPickerInstance[] {
  const providers: string[] = [];
  for (const option of options) {
    if (!providers.includes(option.provider)) {
      providers.push(option.provider);
    }
  }

  const instances: ModelPickerInstance[] = [];
  for (const provider of providers) {
    instances.push({
      key: teamInstanceKey(provider),
      provider,
      accountId: null,
      label: getProviderLabel(provider),
    });
    const providerAccounts =
      accounts?.filter((account) => account.provider === provider) ?? [];
    for (const account of providerAccounts) {
      instances.push({
        key: account.id,
        provider,
        accountId: account.id,
        label: account.label,
      });
    }
  }
  return instances;
}

function InstanceIcon({
  instance,
  size = 20,
  showBadge,
  indicatorBackground = "rgb(var(--popover))",
}: {
  instance: ModelPickerInstance;
  size?: number;
  showBadge: boolean;
  indicatorBackground?: string;
}) {
  return (
    <span className="relative isolate inline-flex shrink-0 items-center justify-center overflow-visible">
      <ProviderIcon provider={instance.provider} size={size} />
      {showBadge ? (
        <span
          className="pointer-events-none absolute -right-0.5 -bottom-0.5 z-10 flex h-3 min-w-3 items-center justify-center rounded-full bg-muted px-0.5 text-[7px] font-semibold leading-none text-muted-foreground"
          style={{
            boxShadow: `0 0 0 1.5px ${indicatorBackground}`,
          }}
          aria-hidden
        >
          {providerInstanceInitials(instance.label)}
        </span>
      ) : null}
    </span>
  );
}

function rowFooter(instance: ModelPickerInstance): string {
  const providerLabel = getProviderLabel(instance.provider);
  if (instance.accountId === null) return providerLabel;
  return `${providerLabel} · ${instance.label}`;
}

/**
 * Searchable model + account list used by `ModelSelect` and by menu embeds
 * (context/dropdown submenus). Do not reimplement provider/account radios
 * elsewhere — pass the same options/accounts hooks the modal uses.
 */
export function ModelPickerContent<TModel extends string>({
  value,
  accountId,
  options,
  accounts,
  onSelect,
  canSelectTeamWhilePersonal = true,
  header,
}: {
  value: TModel;
  accountId: string | null;
  options: ReadonlyArray<ModelOption<TModel>>;
  accounts?: ReadonlyArray<ModelAccount>;
  onSelect: (modelId: TModel, accountId: string | null) => void;
  canSelectTeamWhilePersonal?: boolean;
  /** Trait controls (or any extra chrome) pinned above the model list. */
  header?: ReactNode;
}) {
  const instances = useMemo(
    () => buildPickerInstances(options, accounts),
    [options, accounts],
  );

  const selectedPersonalAccount = accountId
    ? accounts?.find((account) => account.id === accountId)
    : undefined;
  const lockedTeamProvider = selectedPersonalAccount?.provider;
  const lockedTeamKey = lockedTeamProvider
    ? teamInstanceKey(lockedTeamProvider)
    : undefined;
  const lockedTeamLabel = selectedPersonalAccount
    ? `${getProviderLabel(selectedPersonalAccount.provider)} Team is unavailable while using ${selectedPersonalAccount.label}'s personal account`
    : undefined;

  const initialInstanceKey = useMemo(() => {
    if (accountId) {
      const match = instances.find((instance) => instance.key === accountId);
      if (match) return match.key;
    }
    const selected = options.find((option) => option.id === value);
    if (selected) return teamInstanceKey(selected.provider);
    const first = instances[0];
    return first ? first.key : "";
  }, [accountId, instances, options, value]);

  const [selectedInstanceKey, setSelectedInstanceKey] =
    useState(initialInstanceKey);
  const [search, setSearch] = useState("");
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const [indicatorTop, setIndicatorTop] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const railContentRef = useRef<HTMLDivElement>(null);

  const isSearching = search.trim().length > 0;

  const selectedInstance =
    instances.find((instance) => instance.key === selectedInstanceKey) ??
    instances[0];

  const activeCompositeKey = useMemo(() => {
    const selected = options.find((option) => option.id === value);
    if (!selected) return "";
    if (accountId) {
      const accountInstance = instances.find(
        (instance) => instance.key === accountId,
      );
      if (accountInstance) {
        return toCompositeKey(accountInstance.key, selected.id);
      }
    }
    return toCompositeKey(teamInstanceKey(selected.provider), selected.id);
  }, [accountId, instances, options, value]);

  const rows = useMemo((): ModelPickerRow[] => {
    const sourceInstances = isSearching
      ? instances
      : selectedInstance
        ? [selectedInstance]
        : [];
    const out: ModelPickerRow[] = [];
    for (const instance of sourceInstances) {
      for (const option of options) {
        if (option.provider !== instance.provider) continue;
        out.push({
          compositeKey: toCompositeKey(instance.key, option.id),
          modelId: option.id,
          modelLabel: option.label,
          instance,
        });
      }
    }
    return out;
  }, [instances, isSearching, options, selectedInstance]);

  const focusSearch = () => {
    searchInputRef.current?.focus({ preventScroll: true });
  };

  // Match t3code: focus survives popover open + any later focus steal.
  useLayoutEffect(() => {
    focusSearch();
    const frame = window.requestAnimationFrame(() => {
      focusSearch();
    });
    const timeout = window.setTimeout(() => {
      focusSearch();
    }, 0);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, []);

  // Measure the active rail button â€” hardcoded spacing drifts vs real layout.
  useLayoutEffect(() => {
    if (isSearching) {
      setIndicatorTop(null);
      return;
    }
    const content = railContentRef.current;
    if (!content || !selectedInstance) {
      setIndicatorTop(null);
      return;
    }
    const selectedButton = content.querySelector(
      `[data-model-picker-instance="${CSS.escape(selectedInstance.key)}"]`,
    );
    if (!(selectedButton instanceof HTMLElement)) {
      setIndicatorTop(null);
      return;
    }
    // With a scrolling rail the active provider can open off-screen; `nearest`
    // is a no-op when it is already visible.
    selectedButton.scrollIntoView({ block: "nearest" });
    const contentRect = content.getBoundingClientRect();
    const buttonRect = selectedButton.getBoundingClientRect();
    setIndicatorTop(
      buttonRect.top -
        contentRect.top +
        content.scrollTop +
        buttonRect.height / 2 -
        10,
    );
  }, [instances, isSearching, selectedInstance]);

  const updateScrollFades = (element: HTMLElement) => {
    const { scrollTop, scrollHeight, clientHeight } = element;
    setShowTopFade(scrollTop > 2);
    setShowBottomFade(scrollTop + clientHeight < scrollHeight - 2);
  };

  const providerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const instance of instances) {
      counts.set(instance.provider, (counts.get(instance.provider) ?? 0) + 1);
    }
    return counts;
  }, [instances]);

  return (
    <TooltipProvider>
      <div
        className="flex h-96 max-h-[min(24rem,var(--radix-popover-content-available-height))] w-full flex-col overflow-hidden rounded-lg bg-popover smooth-shadow-ring-lg"
        data-model-picker-content
      >
        {header ? (
          <div
            className="shrink-0 border-b border-border bg-muted/30 px-3 py-2"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {header}
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {!isSearching ? (
          // The rail grows with every provider + personal account, so it has to
          // scroll on its own once it outruns the panel — `overflow-hidden`
          // simply clipped the tail off.
          <div className="w-12 shrink-0 overflow-y-auto overscroll-contain border-r border-border bg-muted/30 scrollbar-none">
            <div
              ref={railContentRef}
              className="relative flex flex-col gap-1 px-1 pb-1 pt-0.5"
            >
              {indicatorTop !== null ? (
                // Pinned at `top: 0` and moved by `translateY`, the same way the
                // tabs pill lands on its tab. Transitioning `top` relayouted the
                // rail on every frame of a slide that happens while the pointer
                // is still moving down the list.
                <div
                  className="pointer-events-none absolute top-0 right-0 z-10 h-5 w-[3px] rounded-l-full bg-primary transition-transform duration-[var(--motion-base)]"
                  style={{ transform: `translateY(${indicatorTop}px)` }}
                  aria-hidden
                />
              ) : null}
              {instances.map((instance) => {
                const showBadge =
                  (providerCounts.get(instance.provider) ?? 0) > 1;
                const isPersonalTeamVariant =
                  lockedTeamKey !== undefined && instance.key === lockedTeamKey;
                const isLockedTeam =
                  isPersonalTeamVariant && !canSelectTeamWhilePersonal;
                const showTeamLockedHint =
                  isPersonalTeamVariant && lockedTeamLabel !== undefined;
                return (
                  <Tooltip key={instance.key}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        data-model-picker-instance={instance.key}
                        disabled={isLockedTeam}
                        className={cn(
                          "relative isolate flex aspect-square w-full items-center justify-center rounded-md transition-colors",
                          isPersonalTeamVariant
                            ? "opacity-40"
                            : "hover:bg-muted",
                          isLockedTeam
                            ? "cursor-not-allowed"
                            : "cursor-pointer hover:bg-muted",
                        )}
                        aria-label={instance.label}
                        onClick={() => {
                          if (isLockedTeam) return;
                          setSelectedInstanceKey(instance.key);
                          window.requestAnimationFrame(() => {
                            focusSearch();
                          });
                        }}
                      >
                        <InstanceIcon
                          instance={instance}
                          size={20}
                          showBadge={showBadge}
                          indicatorBackground="rgb(var(--muted))"
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" sideOffset={8}>
                      {showTeamLockedHint ? lockedTeamLabel : instance.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ) : null}

        {/*
        Key only on the rail instance â€” NOT on isSearching. Remounting when the
        first search character lands unmounts the input and drops focus (the
        "click twice" bug). Row filtering already switches search vs rail views.
      */}
        <Command
          key={selectedInstanceKey}
          className="flex min-w-0 flex-1 flex-col rounded-none border-0 bg-muted/40"
          defaultValue={activeCompositeKey || undefined}
        >
          <div className="px-4 pt-2.5">
            <div className="flex items-center gap-2 border-b border-border/70 pb-2.5 transition-colors focus-within:border-ring">
              <IconSearch
                className="size-4 shrink-0 text-muted-foreground/55"
                aria-hidden
              />
              <CommandPrimitive.Input
                ref={searchInputRef}
                value={search}
                onValueChange={setSearch}
                placeholder="Search models..."
                className="h-auto w-full bg-transparent py-0 text-sm outline-hidden placeholder:text-muted-foreground"
                onMouseDown={(event) => event.stopPropagation()}
                onTouchStart={(event) => event.stopPropagation()}
              />
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            {showTopFade ? (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-linear-to-b from-muted/40 to-transparent"
                aria-hidden
              />
            ) : null}
            {showBottomFade ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-linear-to-t from-muted/40 to-transparent"
                aria-hidden
              />
            ) : null}

            <CommandList
              className="max-h-none h-full flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5"
              onScroll={(event) => updateScrollFades(event.currentTarget)}
              ref={(node) => {
                if (node) updateScrollFades(node);
              }}
            >
              <CommandEmpty>No models found</CommandEmpty>
              {rows.map((row) => {
                const isActive = row.compositeKey === activeCompositeKey;
                const showBadge =
                  (providerCounts.get(row.instance.provider) ?? 0) > 1;
                const isPersonalTeamVariant =
                  lockedTeamKey !== undefined &&
                  row.instance.key === lockedTeamKey;
                const isLockedTeamRow =
                  isPersonalTeamVariant && !canSelectTeamWhilePersonal;
                const showTeamLockedHint =
                  isPersonalTeamVariant && lockedTeamLabel !== undefined;
                return (
                  <CommandItem
                    key={row.compositeKey}
                    value={row.compositeKey}
                    disabled={isLockedTeamRow}
                    keywords={[
                      row.modelLabel,
                      formatModelDisplayLabel(
                        row.instance.provider,
                        row.modelLabel,
                      ),
                      getProviderLabel(row.instance.provider),
                      row.instance.label,
                    ]}
                    onSelect={() => {
                      if (isLockedTeamRow) return;
                      const option = options.find(
                        (entry) => entry.id === row.modelId,
                      );
                      if (!option) return;
                      setSelectedInstanceKey(row.instance.key);
                      setSearch("");
                      onSelect(option.id, row.instance.accountId);
                    }}
                    className={cn(
                      "flex flex-col items-stretch gap-1 rounded-md px-2 py-2.5 data-[selected=true]:bg-muted",
                      isPersonalTeamVariant && "opacity-50",
                      isLockedTeamRow ? "cursor-not-allowed" : "cursor-pointer",
                    )}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex min-w-0 flex-col items-stretch gap-1">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-xs font-medium">
                              {row.modelLabel}
                            </span>
                            {isActive ? (
                              <IconCheck
                                className="size-3.5 shrink-0 text-primary"
                                aria-hidden
                              />
                            ) : null}
                          </div>
                          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground/70">
                            <InstanceIcon
                              instance={row.instance}
                              size={12}
                              showBadge={showBadge}
                              indicatorBackground="rgb(var(--muted))"
                            />
                            <span className="truncate">
                              {rowFooter(row.instance)}
                            </span>
                          </div>
                        </div>
                      </TooltipTrigger>
                      {showTeamLockedHint ? (
                        <TooltipContent>{lockedTeamLabel}</TooltipContent>
                      ) : null}
                    </Tooltip>
                  </CommandItem>
                );
              })}
            </CommandList>
          </div>
        </Command>
        </div>
      </div>
    </TooltipProvider>
  );
}
