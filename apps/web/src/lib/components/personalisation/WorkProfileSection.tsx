"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@eva/backend";
import { Button, Input, Spinner, Textarea } from "@eva/ui";
import { useState } from "react";
import { SettingsSection } from "@/lib/components/settings/SettingsSection";
import { withMutationToast } from "@/lib/utils/mutationToast";

interface WorkProfileDraft {
  headline: string;
  owns: string;
  askMeAbout: string;
}

const EMPTY_PROFILE: WorkProfileDraft = {
  headline: "",
  owns: "",
  askMeAbout: "",
};

function sameProfile(a: WorkProfileDraft, b: WorkProfileDraft): boolean {
  return (
    a.headline === b.headline &&
    a.owns === b.owns &&
    a.askMeAbout === b.askMeAbout
  );
}

/**
 * The work profile Eva routes questions by. Owns its own query and draft so the
 * personalisation page stays a list of sections.
 */
export function WorkProfileSection() {
  const profile = useQuery(api.workProfiles.getMine);
  const upsert = useMutation(api.workProfiles.upsertMine);

  const saved: WorkProfileDraft = profile
    ? {
        headline: profile.headline,
        owns: profile.owns,
        askMeAbout: profile.askMeAbout,
      }
    : EMPTY_PROFILE;

  const [draft, setDraft] = useState(saved);
  const [seenSaved, setSeenSaved] = useState(saved);
  const [isSaving, setIsSaving] = useState(false);

  // Adopt a new saved value during render rather than in an effect, and only
  // when the draft is untouched, so a save from another tab does not wipe
  // whatever the user is typing.
  if (!sameProfile(saved, seenSaved)) {
    setSeenSaved(saved);
    if (sameProfile(draft, seenSaved)) {
      setDraft(saved);
    }
  }

  const isLoading = profile === undefined;
  const isDirty = !sameProfile(draft, saved);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await withMutationToast(
        upsert(draft),
        "Work profile saved",
        "Couldn't save work profile",
        "work-profile",
      );
    } catch {
      // Toast already shown.
    }
    // No `finally`: the catch swallows, so this always runs (and `finally`
    // bails the React Compiler out of the whole file).
    setIsSaving(false);
  };

  return (
    <SettingsSection
      title="Work profile"
      description="Eva uses this to route design and product questions to you."
      footer={
        <>
          {isDirty ? (
            <span className="text-xs text-muted-foreground">
              Unsaved changes
            </span>
          ) : null}
          <Button size="sm" onClick={handleSave} disabled={isSaving || !isDirty}>
            {isSaving ? <Spinner size="sm" /> : null}
            Save profile
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium" htmlFor="work-headline">
            Headline
          </label>
          <Input
            id="work-headline"
            disabled={isLoading}
            placeholder="Product designer — CarePulse web"
            value={draft.headline}
            onChange={(event) =>
              setDraft({ ...draft, headline: event.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium" htmlFor="work-owns">
            What you own
          </label>
          <Textarea
            id="work-owns"
            disabled={isLoading}
            className="min-h-[72px] text-sm"
            placeholder="Empty states, IA, visual polish on web"
            value={draft.owns}
            onChange={(event) =>
              setDraft({ ...draft, owns: event.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium" htmlFor="work-ask">
            Ask me about
          </label>
          <Textarea
            id="work-ask"
            disabled={isLoading}
            className="min-h-[72px] text-sm"
            placeholder="Spacing, copy, which variation to ship"
            value={draft.askMeAbout}
            onChange={(event) =>
              setDraft({ ...draft, askMeAbout: event.target.value })
            }
          />
        </div>
      </div>
    </SettingsSection>
  );
}
