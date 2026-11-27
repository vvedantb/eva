import {
  api,
  getModelTraits,
  getReasoningLevelLabel,
  getVisibleAIModelOptions,
  modelTraitSummary,
  resolveTraitsForDisplay,
  type AIModel,
  type AIProvider,
  type Id,
  type ReasoningLevel,
  type StoredModelTraits,
} from "@eva/backend";
import type { PickerAccount } from "@eva/shared";
import { EVA_THEME } from "@eva/shared/evaTheme";
import { IconBolt } from "@tabler/icons-react-native";
import { PROMPT_INPUT_CHIP, PromptInputChip } from "@vvedantb/native-ui/ai";
import { ProviderIcon, providerLabel } from "@vvedantb/native-ui/brand";
import { SheetRow } from "@vvedantb/native-ui/primitives";
import { SearchInput } from "@vvedantb/native-ui/search-input";
import { tokens } from "@vvedantb/native-ui/theme";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FOOTER_CHIP, FooterSheet, useFooterChipColor } from "@/chat/ComposerFooter";
import { useScheme } from "@/ui/theme";

/** What the model chip shows and changes: the composer's model and its stored traits. */
export type ModelPick = {
  repoId: Id<"githubRepos">;
  model: AIModel;
  traits?: StoredModelTraits;
  onModelChange: (model: AIModel) => void;
  onTraitsChange?: (partial: StoredModelTraits) => void;
  account?: AccountPick;
};

export type AccountPick = {
  accounts: ReadonlyArray<PickerAccount>;
  value: Id<"userProviderAccounts"> | null;
  onChange: (accountId: Id<"userProviderAccounts"> | null) => void;
};

type Instance = { key: string; provider: AIProvider; accountId: Id<"userProviderAccounts"> | null; label: string };

const teamKey = (provider: string) => `team:${provider}`;

function pickerInstances(providers: AIProvider[], accounts: ReadonlyArray<PickerAccount>): Instance[] {
  return providers.flatMap((provider) => [
    { key: teamKey(provider), provider, accountId: null, label: providerLabel(provider) },
    ...accounts
      .filter((account) => account.provider === provider)
      .map((account): Instance => ({ key: account.id, provider, accountId: account.id, label: account.label })),
  ]);
}

function instanceInitials(label: string): string {
  const [first = "", second] = label.replace(/[_-]+/g, " ").split(/\s+/u).filter(Boolean);
  return second ? `${first.charAt(0)}${second.charAt(0)}`.toUpperCase() : first.slice(0, 2).toUpperCase();
}

function InstanceIcon({ instance, size, badge }: { instance: Instance; size: number; badge: boolean }) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View>
      <ProviderIcon provider={instance.provider} size={size} />
      {badge ? (
        <View
          className="absolute -bottom-0.5 -right-0.5 h-3 min-w-3 items-center justify-center rounded-full px-0.5"
          style={{ backgroundColor: theme.secondary, borderWidth: 1.5, borderColor: theme.popover }}
        >
          <Text style={{ fontSize: 7, lineHeight: 8, fontWeight: "600", color: theme.mutedForeground }}>
            {instanceInitials(instance.label)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The web composer's model picker (`ModelSelectWithTraits` over
 * `ModelPickerContent`): Fast's bolt, the provider mark, the model, " · " and
 * the trait summary, then a chevron. It opens a sheet with the web trait rows
 * on top, then "Search models...", then the web rail as a row of 44 tabs: each
 * provider's Team credential and the user's accounts for it. The list shows
 * the tab's models the repo can run (`githubRepos.getProviderAvailability`);
 * a search lists every tab's matches instead, by model, provider or account
 * name. A row picks the model and its account and closes the sheet; a trait
 * pick keeps it open, as the web panel.
 */
export function ModelChip({ repoId, model, traits = {}, onModelChange, onTraitsChange, account }: ModelPick) {
  const color = useFooterChipColor();
  const theme = EVA_THEME[useScheme()];
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const availability = useQuery(api.githubRepos.getProviderAvailability, { repoId });
  const options = getVisibleAIModelOptions(availability, model);
  const selected = options.find((option) => option.id === model) ?? options[0];
  const summary = modelTraitSummary(model, traits);
  const label = selected ? selected.label : "Select model";
  const instances = pickerInstances([...new Set(options.map((option) => option.provider))], account?.accounts ?? []);
  const perProvider = (provider: string) => instances.filter((instance) => instance.provider === provider).length;
  const accountValue = account?.value ?? null;
  const accountInstance = instances.find((instance) => accountValue !== null && instance.key === accountValue);
  const current = accountInstance ?? instances.find((instance) => instance.key === teamKey(selected?.provider ?? ""));
  const shown = instances.find((instance) => instance.key === tab) ?? current ?? instances[0];
  const dimmedKey = accountInstance ? teamKey(accountInstance.provider) : undefined;
  const query = search.trim().toLowerCase();
  const rows = (query ? instances : shown ? [shown] : []).flatMap((instance) =>
    options
      .filter((option) => option.provider === instance.provider)
      .filter((option) =>
        [option.label, providerLabel(option.provider), instance.label].some((word) => word.toLowerCase().includes(query)),
      )
      .map((option) => ({ option, instance })),
  );

  const close = () => {
    setOpen(false);
    setTab(null);
    setSearch("");
  };

  return (
    <>
      <PromptInputChip
        icon={
          <View className="flex-row items-center gap-1.5">
            {summary.fast ? <IconBolt size={12} color={color} /> : null}
            {current ? (
              <InstanceIcon instance={current} size={PROMPT_INPUT_CHIP.iconSize} badge={accountInstance !== undefined && perProvider(current.provider) > 1} />
            ) : (
              <ProviderIcon provider="claude" size={PROMPT_INPUT_CHIP.iconSize} />
            )}
          </View>
        }
        label={label}
        suffix={summary.suffix}
        {...FOOTER_CHIP}
        color={color}
        accessibilityLabel={`Model: ${[label, summary.suffix, summary.fast ? "Fast" : undefined, accountInstance?.label].filter(Boolean).join(", ")}`}
        expanded={open}
        onPress={() => setOpen(true)}
      />
      <FooterSheet
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title="Model"
        header={
          <>
            {onTraitsChange ? <TraitRows model={model} traits={traits} onChange={onTraitsChange} /> : null}
            <View className="px-2">
              <SearchInput size="md" value={search} onChange={setSearch} label="Search models" placeholder="Search models..." />
            </View>
            {!query && instances.length > 1 ? (
              <View accessibilityRole="tablist" className="flex-row flex-wrap gap-1 px-1">
                {instances.map((instance) => (
                  <Pressable
                    key={instance.key}
                    accessibilityRole="tab"
                    accessibilityLabel={instance.label}
                    accessibilityState={{ selected: instance.key === shown?.key }}
                    onPress={() => setTab(instance.key)}
                    className="size-11 items-center justify-center active:opacity-70"
                    style={{
                      borderRadius: tokens.radius.md,
                      backgroundColor: instance.key === shown?.key ? theme.muted : "transparent",
                      opacity: instance.key === dimmedKey ? 0.4 : 1,
                    }}
                  >
                    <InstanceIcon instance={instance} size={20} badge={perProvider(instance.provider) > 1} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        }
      >
        {rows.length === 0 ? (
          <Text className="py-6 text-center text-sm" style={{ color: theme.mutedForeground }}>
            No models found
          </Text>
        ) : (
          rows.map(({ option, instance }) => (
            <View key={`${instance.key}::${option.id}`} style={{ opacity: instance.key === dimmedKey ? 0.5 : 1 }}>
              <SheetRow
                leading={<InstanceIcon instance={instance} size={20} badge={perProvider(instance.provider) > 1} />}
                title={option.label}
                detail={instance.accountId ? `${providerLabel(option.provider)} · ${instance.label}` : providerLabel(option.provider)}
                active={option.id === model && instance.key === current?.key}
                onPress={() => {
                  if (option.id !== model) onModelChange(option.id);
                  if (account && instance.accountId !== accountValue) account.onChange(instance.accountId);
                  close();
                }}
              />
            </View>
          ))
        )}
      </FooterSheet>
    </>
  );
}

type TraitOption = { value: string; label: string };

const TRAIT_TEXT = { fontSize: 11, lineHeight: 16, fontWeight: "500" } as const;

function TraitRows({
  model,
  traits,
  onChange,
}: {
  model: AIModel;
  traits: StoredModelTraits;
  onChange: (partial: StoredModelTraits) => void;
}) {
  const config = getModelTraits(model);
  const display = resolveTraitsForDisplay(model, traits);
  const { reasoning } = config;
  const rows: Array<{ label: string; value: string; options: TraitOption[]; onPick: (value: string) => void }> = [];
  if (reasoning) {
    rows.push({
      label: "Reasoning",
      value: display.effortLevel ?? reasoning.default,
      options: reasoning.levels.map((level) => ({ value: level, label: getReasoningLevelLabel(level) })),
      onPick: (value) => {
        const level: ReasoningLevel | undefined = reasoning.levels.find((entry) => entry === value);
        if (level) onChange({ effortLevel: level });
      },
    });
  }
  if (config.fastMode) {
    rows.push({
      label: "Speed",
      value: display.fastMode ? "fast" : "standard",
      options: [
        { value: "standard", label: "Standard" },
        { value: "fast", label: "Fast" },
      ],
      onPick: (value) => onChange({ fastMode: value === "fast" }),
    });
  }
  if (config.contextWindow1m) {
    rows.push({
      label: "Context",
      value: display.use1mContext ? "1m" : "standard",
      options: [
        { value: "standard", label: config.contextWindowDefaultLabel ?? "200K" },
        { value: "1m", label: "1M" },
      ],
      onPick: (value) => onChange({ use1mContext: value === "1m" }),
    });
  }
  if (config.thinkingToggle) {
    rows.push({
      label: "Thinking",
      value: display.thinkingEnabled ? "on" : "off",
      options: [
        { value: "on", label: "On" },
        { value: "off", label: "Off" },
      ],
      onPick: (value) => onChange({ thinkingEnabled: value === "on" }),
    });
  }
  if (rows.length === 0) return null;
  return (
    <View className="gap-1 px-2">
      {rows.map((row) => (
        <TraitRow key={row.label} {...row} />
      ))}
    </View>
  );
}

function TraitRow({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: TraitOption[];
  onPick: (value: string) => void;
}) {
  const theme = EVA_THEME[useScheme()];
  return (
    <View className="flex-row items-start gap-2.5">
      <Text
        className="w-[76px] shrink-0 pt-2.5 font-instrument-sans-medium"
        style={{ ...TRAIT_TEXT, color: theme.mutedForeground }}
      >
        {label}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} className="min-w-0 flex-1 flex-row flex-wrap gap-0.5">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              accessibilityLabel={option.label}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => onPick(option.value)}
              className="h-9 justify-center px-3 active:opacity-70"
              style={{ borderRadius: tokens.radius.md, backgroundColor: checked ? theme.background : "transparent" }}
            >
              <Text
                className="font-instrument-sans-medium"
                style={{ ...TRAIT_TEXT, color: checked ? theme.foreground : theme.mutedForeground }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
