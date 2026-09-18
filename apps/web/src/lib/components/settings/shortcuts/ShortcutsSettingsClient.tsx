"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@eva/backend";
import { Button, Spinner } from "@eva/ui";
import { normalizeHotkey, type Hotkey } from "@tanstack/react-hotkeys";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/lib/components/settings/SettingsToggleRow";
import { ShortcutRow } from "@/lib/components/settings/shortcuts/_components/ShortcutRow";
import { ListEnter } from "@/lib/components/ui/ListEnter";
import { EDITING_KEYS } from "@/lib/components/settings/shortcuts/editingKeys";
import { Kbd } from "@/lib/components/ui/Kbd";
import {
  SHORTCUT_DEFS,
  SHORTCUT_IDS,
  SHORTCUT_SECTIONS,
  resolveBinding,
  type ShortcutId,
} from "@/lib/hotkeys/registry";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

/**
 * The other shortcuts bound to the same combo, keyed by id. A warning only:
 * two shortcuts can legitimately share a combo when their scopes never overlap,
 * and blocking duplicates would make a straight swap impossible.
 */
function findConflicts(
  overrides: Record<string, string>,
): Record<string, ShortcutId[]> {
  const byCombo = new Map<string, ShortcutId[]>();
  for (const id of SHORTCUT_IDS) {
    const combo = normalizeHotkey(resolveBinding(id, overrides));
    byCombo.set(combo, [...(byCombo.get(combo) ?? []), id]);
  }
  const conflicts: Record<string, ShortcutId[]> = {};
  for (const ids of byCombo.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      conflicts[id] = ids.filter((other) => other !== id);
    }
  }
  return conflicts;
}

export function ShortcutsSettingsClient() {
  const overrides = useQuery(api.auth.getShortcutOverrides);

  const setOverride = useMutation(
    api.auth.setShortcutOverride,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.auth.getShortcutOverrides, {});
    if (current === undefined) return;
    const next = { ...current };
    if (args.hotkey === null) {
      delete next[args.id];
    } else {
      next[args.id] = args.hotkey;
    }
    localStore.setQuery(api.auth.getShortcutOverrides, {}, next);
  });

  const resetAll = useMutation(
    api.auth.resetShortcutOverrides,
  ).withOptimisticUpdate((localStore) => {
    localStore.setQuery(api.auth.getShortcutOverrides, {}, {});
  });

  if (overrides === undefined) {
    return (
      <SettingsPage title="Shortcuts">
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </SettingsPage>
    );
  }

  const conflicts = findConflicts(overrides);
  const hasOverrides = Object.keys(overrides).length > 0;

  const record = (id: ShortcutId, hotkey: Hotkey | null) => {
    void catchMutationError(
      setOverride({ id, hotkey }),
      "Couldn't save shortcut",
      `shortcut-${id}`,
    );
  };

  return (
    <SettingsPage title="Shortcuts">
      {SHORTCUT_SECTIONS.map((section, index) => (
        <SettingsSection
          key={section.group}
          title={section.group}
          description={
            index === 0
              ? "Click a combo, then press the keys you want."
              : undefined
          }
          bodyVariant="list"
          action={
            index === 0 ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={!hasOverrides}
                onClick={() =>
                  void withMutationToast(
                    resetAll({}),
                    "Shortcuts reset to defaults",
                    "Couldn't reset shortcuts",
                    "shortcuts-reset",
                  )
                }
              >
                Reset all to defaults
              </Button>
            ) : undefined
          }
        >
          {section.ids.map((id, rowIndex) => (
            <ListEnter key={id} index={rowIndex} fast staggerMax={8}>
              <ShortcutRow
                id={id}
                binding={resolveBinding(id, overrides)}
                isOverridden={overrides[id] !== undefined}
                conflictsWith={(conflicts[id] ?? []).map(
                  (other) => SHORTCUT_DEFS[other].name,
                )}
                onRecord={(hotkey) => record(id, hotkey)}
              />
            </ListEnter>
          ))}
        </SettingsSection>
      ))}

      <SettingsSection
        title="Editing keys"
        description="Handled by whatever is focused, so they cannot be rebound."
        bodyVariant="list"
      >
        {EDITING_KEYS.map((entry) => (
          <SettingsToggleRow
            key={entry.keys.join("+")}
            // Multi-key combos are wide; wrap them under the description on a
            // phone rather than squeezing the description to one word a line.
            className="max-sm:flex-wrap"
            title={entry.description}
            action={
              <div className="flex items-center gap-1">
                {entry.keys.map((key) => (
                  <Kbd key={key} hotkey={key} />
                ))}
              </div>
            }
          />
        ))}
      </SettingsSection>
    </SettingsPage>
  );
}
