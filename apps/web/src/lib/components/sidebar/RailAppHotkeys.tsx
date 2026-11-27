"use client";

import { useNavigate } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { repoSectionHref } from "@/lib/utils/repoUrl";
import type { RepoWithLogo } from "@/lib/utils/repoGrouping";
import { useShortcutBinding } from "@/lib/hotkeys/useShortcut";
import { SHORTCUT_DEFS, deriveSlotHotkey } from "@/lib/hotkeys/registry";

const HOTKEY_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function RailAppHotkey({
  slot,
  repo,
  section,
  onNavigate,
}: {
  slot: (typeof HOTKEY_SLOTS)[number];
  repo: RepoWithLogo | undefined;
  section: string | null;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const binding = useShortcutBinding("jumpToApp");
  const slotHotkey = deriveSlotHotkey(binding, slot);

  useHotkey(
    slotHotkey ?? SHORTCUT_DEFS.jumpToApp.defaultHotkey,
    (e) => {
      if (!repo) return;
      e.preventDefault();
      onNavigate();
      navigate({
        to: repoSectionHref(repo.owner, repo.name, repo.rootDirectory, section),
      });
    },
    { enabled: repo !== undefined && slotHotkey !== null },
  );

  return null;
}

/**
 * Keyboard shortcuts for the vertical rail's app tiles: the bound combo ending
 * in 1 selects the first app, 2 the second, and so on up to 9. Slots beyond the
 * app count are inert, so the browser's own tab shortcuts still work there.
 */
export function RailAppHotkeys({
  repos,
  section,
  onNavigate,
}: {
  repos: RepoWithLogo[];
  section: string | null;
  onNavigate: () => void;
}) {
  return (
    <>
      {HOTKEY_SLOTS.map((slot) => (
        <RailAppHotkey
          key={slot}
          slot={slot}
          repo={repos[slot - 1]}
          section={section}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}
