"use client";

import { useQuery, useMutation } from "convex/react";
import { api, PERSONALISATION_PRESETS } from "@eva/backend";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import {
  Textarea,
  Button,
  Spinner,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@eva/ui";
import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { RolePresetPicker } from "./RolePresetPicker";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

export function PersonalisationClient() {
  const personalisation = useQuery(api.auth.getPersonalisation);
  const setCustomInstructions = useMutation(
    api.auth.setCustomInstructions,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.auth.getPersonalisation, {});
    if (current) {
      localStore.setQuery(
        api.auth.getPersonalisation,
        {},
        {
          ...current,
          customInstructions: args.customInstructions,
        },
      );
    }
  });
  const setRole = useMutation(api.auth.setRole).withOptimisticUpdate(
    (localStore, args) => {
      const current = localStore.getQuery(api.auth.getPersonalisation, {});
      if (current) {
        localStore.setQuery(
          api.auth.getPersonalisation,
          {},
          {
            ...current,
            role: args.role,
          },
        );
      }
    },
  );

  const savedValue = personalisation?.customInstructions ?? "";
  const [draft, setDraft] = useState(savedValue);
  const [seenSaved, setSeenSaved] = useState(savedValue);
  const [isSaving, setIsSaving] = useState(false);

  // Adopt a new saved value during render rather than in an effect, and only
  // when the draft is untouched. Picking a role preset (optimistic update) or a
  // save from another tab used to wipe whatever the user was typing.
  if (savedValue !== seenSaved) {
    setSeenSaved(savedValue);
    if (draft === seenSaved) {
      setDraft(savedValue);
    }
  }

  const isDirty = draft !== savedValue;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await withMutationToast(
        setCustomInstructions({ customInstructions: draft }),
        "Instructions saved",
        "Couldn't save instructions",
        "personalisation-instructions",
      );
    } catch {
      // Toast already shown.
    }
    // No `finally`: the catch swallows, so this always runs (and `finally`
    // bails the React Compiler out of the whole file).
    setIsSaving(false);
  };

  if (!personalisation) {
    return (
      <SettingsPage title="Personalisation">
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      </SettingsPage>
    );
  }

  const activeRole = personalisation.role;

  return (
    <SettingsPage title="Personalisation">
      <SettingsSection
        title="Role preset"
        description="How Eva talks to you. Does not change what code it edits."
      >
        <div className="space-y-3">
          <RolePresetPicker
            activeRole={activeRole}
            onSelect={(role) =>
              catchMutationError(
                setRole({ role }),
                "Couldn't update role preset",
                "personalisation-role",
              )
            }
          />

          {activeRole ? (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                View preset prompt
                <IconChevronDown className="size-3.5" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 whitespace-pre-wrap max-sm:wrap-break-word rounded-control bg-muted p-3 font-mono text-xs leading-relaxed text-foreground/80">
                  {PERSONALISATION_PRESETS[activeRole].prompt}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <p className="text-xs text-muted-foreground">No preset selected.</p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Custom instructions"
        description="Extra guidance included in every session."
        footer={
          <>
            {isDirty ? (
              <span className="text-xs text-muted-foreground">
                Unsaved changes
              </span>
            ) : null}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !isDirty}
            >
              {isSaving ? <Spinner size="sm" /> : null}
              Save instructions
            </Button>
          </>
        }
      >
        <Textarea
          className="min-h-[160px] font-mono text-xs"
          placeholder="e.g. Explain changes in plain English before showing code"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
