import { v } from "convex/values";

/** Section headings on the Shortcuts settings page, in render order. */
export const SHORTCUT_GROUPS = [
  "Global",
  "Navigation",
  "Chat",
  "Sandbox",
] as const;

export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

export interface ShortcutDef {
  /** Row title on the settings page. */
  name: string;
  /** Row subtitle: what pressing the key actually does. */
  description: string;
  group: ShortcutGroup;
  /**
   * The combo in force until the user rebinds it. Typed as a string here
   * because this package has no hotkey library, but `as const` below keeps the
   * literal, so the web app's `resolveBinding` fails to compile if any default
   * is not a valid `Hotkey`.
   */
  defaultHotkey: string;
  /**
   * Set only for shortcuts that occupy a run of numbered slots (the rail's
   * "jump to app N"). The binding's key must be a digit, and slots 2..N derive
   * their combo by substituting that digit.
   */
  slots?: number;
}

/**
 * Every rebindable app-level keyboard shortcut (settings → Shortcuts), and the
 * single place any of them is declared. The id, label, description, grouping,
 * and default combo all live here; the web app adds only the browser-side
 * helpers that need the hotkey library at runtime.
 *
 * Element-scoped editing keys (Enter to submit, Escape to cancel, arrow-key
 * navigation) are deliberately absent — rebinding those breaks form
 * accessibility and IME composition, so they stay fixed.
 *
 * To add a shortcut: add one entry below, then call `useShortcut("yourId", …)`
 * where it fires. To remove one, delete the entry and follow the type error to
 * its call site. Nothing else needs touching — the id type, the id list, the
 * settings sections, and the mutation's write guard all derive from this object.
 */
export const SHORTCUT_DEFS = {
  openSearch: {
    name: "Open search",
    description: "Toggle the spotlight search dialog.",
    group: "Global",
    defaultHotkey: "Mod+K",
  },
  toggleSidebar: {
    name: "Toggle sidebar",
    description: "Collapse or expand the left sidebar.",
    group: "Global",
    defaultHotkey: "Mod+I",
  },
  toggleSandboxPanel: {
    name: "Toggle sandbox panel",
    description: "Show or hide the right-hand sandbox panel.",
    group: "Global",
    defaultHotkey: "Control+Alt+B",
  },
  showShortcuts: {
    name: "Show keyboard shortcuts",
    description: "Open the shortcut cheatsheet.",
    group: "Global",
    defaultHotkey: "Mod+/",
  },
  jumpToApp: {
    name: "Jump to app 1–9",
    description:
      "Open the first to ninth app in the rail. The key must be a digit; the other eight slots follow the same modifiers.",
    group: "Navigation",
    defaultHotkey: "Alt+1",
    slots: 9,
  },
  newQuickTask: {
    name: "New quick task",
    description: "Open the new quick task dialog.",
    group: "Navigation",
    defaultHotkey: "Alt+N",
  },
  focusComposer: {
    name: "Focus chat composer",
    description: "Move focus into the chat input.",
    group: "Chat",
    defaultHotkey: "Alt+C",
  },
  cancelTurn: {
    name: "Stop the running turn",
    description: "Cancel the turn Eva is currently working on.",
    group: "Chat",
    defaultHotkey: "Alt+X",
  },
  stashDraft: {
    name: "Stash composer draft",
    description:
      "Stash the current draft. With an empty composer, opens the stash list.",
    group: "Chat",
    defaultHotkey: "Mod+S",
  },
  submitComposerForm: {
    name: "Submit form",
    description: "Submit the quick task and new project dialogs.",
    group: "Chat",
    defaultHotkey: "Mod+Enter",
  },
  toggleBrowserTab: {
    name: "Toggle Browser tab",
    description: "Switch to the Browser tab, or back to the previous one.",
    group: "Sandbox",
    defaultHotkey: "Mod+Shift+B",
  },
  openSandboxFile: {
    name: "Open sandbox file",
    description: "Search sandbox files and open one in the file viewer.",
    group: "Sandbox",
    defaultHotkey: "Mod+P",
  },
  openSandboxActions: {
    name: "Open sandbox actions",
    description: "Search the actions available in the current sandbox view.",
    group: "Sandbox",
    defaultHotkey: "Mod+Shift+P",
  },
  cycleSandboxTab: {
    name: "Cycle sandbox tabs",
    description:
      "Step through the open sandbox tabs. Rebind to Shift+Tab to restore the old default.",
    group: "Sandbox",
    // Sits in the same Control+Alt family as the panel toggle. Shift+punctuation
    // is deliberately unavailable — it is keyboard-layout dependent.
    defaultHotkey: "Control+Alt+ArrowRight",
  },
  togglePreviewConsole: {
    // Keep the stored id stable so existing user overrides continue to work.
    name: "Toggle terminal panel",
    description: "Open or close the terminal panel beneath the workspace.",
    group: "Sandbox",
    defaultHotkey: "Mod+J",
  },
} as const satisfies Record<string, ShortcutDef>;

export type ShortcutId = keyof typeof SHORTCUT_DEFS;

/**
 * The write-boundary guard: `setShortcutOverride` takes a plain string so the
 * id vocabulary stays derived from `SHORTCUT_DEFS` rather than repeated as a
 * literal union, and this rejects anything not in it.
 */
export function isShortcutId(value: string): value is ShortcutId {
  return Object.prototype.hasOwnProperty.call(SHORTCUT_DEFS, value);
}

/**
 * One shortcut's metadata, widened to the interface. `SHORTCUT_DEFS` is
 * declared `as const` so its defaults keep their literal types, which also
 * means entries without `slots` genuinely lack the property — read a def
 * through here whenever the id is not statically known.
 */
export function shortcutDef(id: ShortcutId): ShortcutDef {
  return SHORTCUT_DEFS[id];
}

/** Every shortcut id, in declaration order. */
export const SHORTCUT_IDS: ReadonlyArray<ShortcutId> =
  Object.keys(SHORTCUT_DEFS).filter(isShortcutId);

/** The settings page's sections: each group that has shortcuts, in order. */
export const SHORTCUT_SECTIONS: ReadonlyArray<{
  group: ShortcutGroup;
  ids: ReadonlyArray<ShortcutId>;
}> = SHORTCUT_GROUPS.map((group) => ({
  group,
  ids: SHORTCUT_IDS.filter((id) => SHORTCUT_DEFS[id].group === group),
})).filter((section) => section.ids.length > 0);

/**
 * Stored shape on `users.shortcutOverrides` — a sparse map of shortcut id to
 * hotkey string (e.g. `{ toggleSidebar: "Mod+Shift+I" }`). A missing key means
 * "use the client default", so the schema never changes when a shortcut is
 * added. Ids are validated on write by `isShortcutId`; the hotkey string is
 * validated on read by the client's `isHotkey` guard.
 */
export const shortcutOverridesValidator = v.record(v.string(), v.string());
