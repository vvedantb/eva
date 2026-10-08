"use client";

import { useState, type ReactNode } from "react";
import { IconBolt, IconChevronDown } from "@tabler/icons-react";
import { SimpleModelLadder } from "./simple-model-ladder";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "../utils/cn";
import { ProviderIcon } from "./provider-icon";
import {
  ModelPickerContent,
  buildPickerInstances,
  providerInstanceInitials,
  teamInstanceKey,
} from "./model-picker-content";
import {
  type ModelAccount,
  type ModelOption,
  findModelOption,
  formatModelDisplayLabel,
  getProviderLabel,
} from "./model-picker-types";

export type { ModelAccount, ModelOption };
export { findModelOption, formatModelDisplayLabel, getProviderLabel };
/** Embeddable picker body — use in menus/submenus; use `ModelSelect` for button triggers. */
export { ModelPickerContent };

/**
 * Shared chrome for the picker panel (popover + menu submenu). Keep these in
 * sync so trigger vs embed surfaces cannot drift.
 */
export const modelPickerSurfaceClass =
  "w-100 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border-0 bg-transparent p-0 shadow-none";

export interface ModelSelectProps<TModel extends string = string> {
  value: TModel;
  onValueChange: (model: TModel) => void;
  options: ReadonlyArray<ModelOption<TModel>>;
  disabled?: boolean;
  className?: string;
  /**
   * The user's own provider accounts. When non-empty, each provider opens into
   * Team + account groups, each listing that provider's models so picking a
   * model also picks whose credential runs it.
   */
  accounts?: ReadonlyArray<ModelAccount>;
  /** Currently selected account id, or null for the team credential. */
  accountId?: string | null;
  /** Fired alongside a model change with the chosen account (null = team). */
  onAccountChange?: (accountId: string | null) => void;
  /**
   * When set, called once per pick instead of separate model/account
   * callbacks — use this to persist both fields in a single mutation.
   */
  onSelectionChange?: (model: TModel, accountId: string | null) => void;
  /**
   * When a personal account is selected, Team for that provider is shown
   * disabled. Set false when the viewer cannot switch the sticky account
   * (e.g. non-owner on a task) so Team stays unselectable.
   */
  canSelectTeamWhilePersonal?: boolean;
  /**
   * Compact label after the model name on the trigger (e.g. the active
   * reasoning level).
   */
  triggerSuffix?: string;
  /** Pinned above the model list — typically trait controls. */
  header?: ReactNode;
  /** Bolt before the provider icon when Fast mode is on. */
  showFastIcon?: boolean;
  /**
   * Simple-view capability ladder (cheapest → strongest). When at least two of
   * these ids are in `options`, the popover opens on a discrete slider;
   * Advanced swaps to the full picker.
   */
  simpleLadder?: ReadonlyArray<TModel>;
  /** Parks the slider thumb when `value` is not itself a ladder tick. */
  simpleLadderSnap?: TModel;
}

/**
 * Button + popover model picker (create modal, composers, toolbars).
 * For context/dropdown menus, embed `ModelPickerContent` with
 * `modelPickerSurfaceClass` instead of nesting this popover.
 */
export function ModelSelect<TModel extends string>({
  value,
  onValueChange,
  options,
  disabled,
  className,
  accounts,
  accountId = null,
  onAccountChange,
  onSelectionChange,
  canSelectTeamWhilePersonal = true,
  triggerSuffix,
  header,
  showFastIcon,
  simpleLadder,
  simpleLadderSnap,
}: ModelSelectProps<TModel>) {
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [previewId, setPreviewId] = useState<TModel | null>(null);
  const displayValue = previewId ?? value;
  const selectedModel = findModelOption(displayValue, options);

  const ladderSteps: ModelOption<TModel>[] = [];
  if (simpleLadder) {
    for (const id of simpleLadder) {
      const option = options.find((entry) => entry.id === id);
      if (option) ladderSteps.push(option);
    }
  }
  const showLadder = ladderSteps.length >= 2 && !advanced;
  const preferredSnap = simpleLadderSnap ?? value;
  let snappedAmong = ladderSteps[0]?.id ?? value;
  for (const step of ladderSteps) {
    if (step.id === value || step.id === preferredSnap) {
      snappedAmong = step.id;
      if (step.id === value) break;
    }
  }
  const triggerLabel = selectedModel ? selectedModel.label : "Select model";
  const instances = buildPickerInstances(options, accounts);

  const selectedAccount = accountId
    ? accounts?.find((account) => account.id === accountId)
    : undefined;

  const activeInstance =
    (selectedAccount
      ? instances.find((instance) => instance.key === selectedAccount.id)
      : undefined) ??
    (selectedModel
      ? instances.find(
          (instance) =>
            instance.key === teamInstanceKey(selectedModel.provider),
        )
      : undefined) ??
    instances[0];

  const showAccountBadge = Boolean(
    selectedAccount &&
    instances.filter(
      (instance) => instance.provider === selectedAccount.provider,
    ).length > 1,
  );

  const commit = (modelId: TModel, nextAccountId: string | null) => {
    if (onSelectionChange) {
      onSelectionChange(modelId, nextAccountId);
    } else {
      onValueChange(modelId);
      onAccountChange?.(nextAccountId);
    }
  };

  const accountForModel = (modelId: TModel): string | null => {
    const option = options.find((entry) => entry.id === modelId);
    if (!option) return null;
    if (selectedAccount && selectedAccount.provider === option.provider) {
      return accountId;
    }
    return null;
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setAdvanced(false);
          setPreviewId(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          data-slot="select-trigger"
          className={cn(
            // Carries `data-slot="select-trigger"` and is styled to read as one,
            // so it has to press like one: `SelectTrigger` is
            // `motion-press active:scale-[0.98]`, and this sits directly beside
            // real selects in the composer footer where the mismatch showed.
            // `motion-press` supersedes `transition-colors` — the two at equal
            // specificity silently replaced each other's declaration.
            "motion-press flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground active:scale-[0.98] disabled:opacity-50",
            className,
          )}
          disabled={disabled}
        >
          {showFastIcon ? (
            <span title="Fast" className="inline-flex shrink-0">
              <IconBolt size={12} aria-hidden />
            </span>
          ) : null}
          {activeInstance && selectedAccount && showAccountBadge ? (
            <span className="relative isolate inline-flex size-4 shrink-0 items-center justify-center">
              <ProviderIcon
                provider={selectedModel?.provider ?? "claude"}
                size={14}
              />
              <span
                className="pointer-events-none absolute -right-0.5 -bottom-0.5 z-10 flex h-3 min-w-3 items-center justify-center rounded-full bg-muted px-0.5 text-[7px] font-semibold leading-none text-muted-foreground"
                style={{
                  boxShadow: "0 0 0 1.5px rgb(var(--input))",
                }}
                aria-hidden
              >
                {providerInstanceInitials(selectedAccount.label)}
              </span>
            </span>
          ) : (
            <ProviderIcon
              provider={selectedModel?.provider ?? "claude"}
              size={14}
            />
          )}
          {/* On a phone the composer's under-bar is only a few hundred pixels
              wide, so the label gives up width to the control beside it rather
              than pushing it out of the row. `min-w-0` is the load-bearing half
              — a flex child defaults to `min-width: auto` and never shrinks. */}
          <span className="whitespace-nowrap text-left max-sm:min-w-0 max-sm:truncate">
            {triggerLabel}
            {triggerSuffix ? (
              <span className="text-muted-foreground/70">
                {" · "}
                {triggerSuffix}
              </span>
            ) : null}
          </span>
          <IconChevronDown
            size={12}
            className="shrink-0 opacity-60"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={
          showLadder ? "w-56 p-3" : modelPickerSurfaceClass
        }
        onOpenAutoFocus={(event) => {
          if (showLadder) return;
          // Let ModelPickerContent own focus (search input); Radix would
          // otherwise park it on the first focusable and fight our layout effect.
          event.preventDefault();
        }}
      >
        {showLadder ? (
          <SimpleModelLadder
            value={displayValue}
            steps={ladderSteps}
            snappedId={snappedAmong}
            disabled={disabled}
            onValueChange={(modelId) => {
              setPreviewId(modelId);
              commit(modelId, accountForModel(modelId));
            }}
            onAdvanced={() => setAdvanced(true)}
          />
        ) : (
          <ModelPickerContent
            value={displayValue}
            accountId={accountId}
            options={options}
            accounts={accounts}
            canSelectTeamWhilePersonal={canSelectTeamWhilePersonal}
            onSelect={(modelId, nextAccountId) => {
              setPreviewId(null);
              commit(modelId, nextAccountId);
            }}
            header={header}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
