"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@eva/ui";
import { Link } from "@tanstack/react-router";
import { EDITING_KEYS } from "@/lib/components/settings/shortcuts/editingKeys";
import {
  EditingKeyRow,
  ShortcutCheatsheetRow,
} from "@/lib/hotkeys/_components/ShortcutCheatsheetRow";
import { SHORTCUT_SECTIONS } from "@/lib/hotkeys/registry";
import {
  closeShortcutsCheatsheet,
  setShortcutsCheatsheetOpen,
  toggleShortcutsCheatsheet,
  useShortcutsCheatsheetOpen,
} from "@/lib/hotkeys/shortcutsCheatsheetStore";
import { useShortcut } from "@/lib/hotkeys/useShortcut";

function SectionHeading({ children }: { children: string }) {
  return (
    <h3 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

/**
 * Every app-level shortcut on one screen, mounted once in the app chrome and
 * opened by `Mod+/` or from spotlight.
 *
 * The list is generated from the registry rather than written out, so a
 * shortcut cannot ship without appearing here, and each row shows the binding
 * currently in force rather than the default. Editing keys come last, read-only
 * — they belong to whatever is focused and cannot be rebound.
 */
export function ShortcutsCheatsheet() {
  const open = useShortcutsCheatsheetOpen();

  useShortcut("showShortcuts", (e) => {
    e.preventDefault();
    toggleShortcutsCheatsheet();
  });

  return (
    <Dialog open={open} onOpenChange={setShortcutsCheatsheetOpen}>
      <DialogContent className="max-h-[80dvh] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pb-3 pt-6">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Bindings you have changed are shown as you set them.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
          {SHORTCUT_SECTIONS.map((section) => (
            <section key={section.group}>
              <SectionHeading>{section.group}</SectionHeading>
              <div className="divide-y divide-border/60">
                {section.ids.map((id) => (
                  <ShortcutCheatsheetRow key={id} id={id} />
                ))}
              </div>
            </section>
          ))}
          <section>
            <SectionHeading>Editing</SectionHeading>
            <div className="divide-y divide-border/60">
              {EDITING_KEYS.map((entry) => (
                <EditingKeyRow
                  key={entry.keys.join("+")}
                  keys={entry.keys}
                  description={entry.description}
                />
              ))}
            </div>
          </section>
        </div>
        <DialogFooter className="border-t border-border px-6 py-3">
          <Button asChild variant="secondary" size="sm">
            <Link to="/settings/shortcuts" onClick={closeShortcutsCheatsheet}>
              Customise
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
