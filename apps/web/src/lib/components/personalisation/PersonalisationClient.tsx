"use client";

import { useQuery, useMutation } from "convex/react";
import { api, PERSONALISATION_PRESETS } from "@eva/backend";
import { SettingsPage } from "@/lib/components/settings/SettingsPage";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import {
  Textarea,
  Input,
  Button,
  Spinner,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@eva/ui";
import { useEffect, useRef } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { RolePresetPicker } from "./RolePresetPicker";
import {
  catchMutationError,
  withMutationToast,
} from "@/lib/utils/mutationToast";

export function PersonalisationClient() {
  const personalisation = useQuery(api.auth.getPersonalisation);
  const workProfile = useQuery(api.workProfiles.getMine);
  const upsertWorkProfile = useMutation(api.workProfiles.upsertMine);
  const headlineRef = useRef<HTMLInputElement>(null);
  const ownsRef = useRef<HTMLTextAreaElement>(null);
  const askRef = useRef<HTMLTextAreaElement>(null);
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const savedValue = personalisation?.customInstructions ?? "";

  const handleSave = async () => {
    const value = textareaRef.current?.value ?? "";
    try {
      await withMutationToast(
        setCustomInstructions({ customInstructions: value }),
        "Instructions saved",
        "Couldn't save instructions",
        "personalisation-instructions",
      );
    } catch {
      // Toast already shown.
    }
  };

  useEffect(() => {
    if (textareaRef.current && personalisation) {
      textareaRef.current.value = personalisation.customInstructions ?? "";
    }
  }, [personalisation]);

  useEffect(() => {
    if (!workProfile) return;
    if (headlineRef.current) headlineRef.current.value = workProfile.headline;
    if (ownsRef.current) ownsRef.current.value = workProfile.owns;
    if (askRef.current) askRef.current.value = workProfile.askMeAbout;
  }, [workProfile]);

  const handleSaveProfile = async () => {
    try {
      await withMutationToast(
        upsertWorkProfile({
          headline: headlineRef.current?.value ?? "",
          owns: ownsRef.current?.value ?? "",
          askMeAbout: askRef.current?.value ?? "",
        }),
        "Work profile saved",
        "Couldn't save work profile",
        "work-profile",
      );
    } catch {
      // Toast already shown.
    }
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
        title="Work profile"
        description="What you own, so Eva can message you instead of dumping design or product questions in whoever opened the chat."
        footer={
          <Button size="sm" onClick={() => void handleSaveProfile()}>
            Save profile
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="work-headline">
              Headline
            </label>
            <Input
              id="work-headline"
              ref={headlineRef}
              placeholder="Product designer — CarePulse web"
              defaultValue={workProfile?.headline ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="work-owns">
              What you own
            </label>
            <Textarea
              id="work-owns"
              ref={ownsRef}
              className="min-h-[72px] text-sm"
              placeholder="Empty states, IA, visual polish on web"
              defaultValue={workProfile?.owns ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="work-ask">
              Ask me about
            </label>
            <Textarea
              id="work-ask"
              ref={askRef}
              className="min-h-[72px] text-sm"
              placeholder="Spacing, copy, which variation to ship"
              defaultValue={workProfile?.askMeAbout ?? ""}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Custom instructions"
        description="Extra guidance included in every session."
        footer={
          <Button size="sm" onClick={handleSave}>
            Save instructions
          </Button>
        }
      >
        <Textarea
          ref={textareaRef}
          className="min-h-[160px] font-mono text-xs"
          placeholder="e.g. Explain changes in plain English before showing code"
          defaultValue={savedValue}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
