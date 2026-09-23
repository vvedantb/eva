"use client";

import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { formatMentionToken } from "./mentionToken";
import { formatSkillToken } from "./skillToken";
import {
  buildMentionPattern,
  buildSkillPattern,
  extractEditableText,
  isEditorValueEmpty,
  isInsertedTokenTrigger,
  normalizeMentionText,
  placeCursorAtEnd,
  renderEditorChipHtml,
  type InsertedToken,
} from "./mentionEditorUtils";
import { MENTION_CHIP_CLASS, SKILL_CHIP_CLASS } from "./mentionChipStyles";
import { countLinkUrls } from "./linkChipUtils";
import {
  MentionPickerPopup,
  type MentionPopupLayout,
} from "./MentionPickerPopup";
import { optionId } from "./mentionOptionId";
import { MentionRow, type MentionKind } from "./MentionRow";
import {
  computeMentionPopupPlacement,
  computePanelPopupPlacement,
  getSelectionAnchorRect,
  type MentionPopupPlacement,
} from "./mentionPopupPosition";
import { cn } from "@eva/ui";
import { UserProfileHoverCardBody } from "@eva/shared/user-initials";
import type { AIProvider, Id } from "@eva/backend";

// The inline AI suggestion renders as an `::after` pseudo-element fed by
// `data-suggestion`, mirroring how the placeholder uses `::before`. A pseudo-
// element is invisible to `extractEditableText` and to the caret, so ghost text
// never leaks into the editor value or the DOM-resync effect below.
const DEFAULT_EDITOR_CLASS =
  "relative block w-full whitespace-pre-wrap wrap-break-word bg-transparent text-sm outline-hidden data-empty:before:pointer-events-none data-empty:before:select-none data-empty:before:absolute data-empty:before:text-muted-foreground/90 data-empty:before:content-[attr(data-placeholder)] data-suggestion:after:pointer-events-none data-suggestion:after:select-none data-suggestion:after:text-muted-foreground/50 data-suggestion:after:content-[attr(data-suggestion)]";

export interface MentionItem<TId extends string = string> {
  id: TId;
  label: string;
  description?: string;
  /** Type badge shown in the picker (e.g. Eva, Claude, Person). */
  badge?: string;
  /** Provider badge identity, used to select its logo without matching text. */
  provider?: AIProvider;
  /** Data entity kind — the picker shows its icon in place of a kind badge. */
  kind?: MentionKind;
  /**
   * Set when this item is a teammate rather than a data entity, so the picker
   * row shows their avatar. Same value as `id` for people items; kept separate
   * so the renderer can tell the two kinds apart without re-deriving it.
   */
  personUserId?: Id<"users">;
}

export interface SlashItem<
  TId extends string = string,
> extends MentionItem<TId> {}

export interface MentionEditorHandle {
  tokenize: (text: string) => string;
  reset: () => void;
  focus: () => void;
  /**
   * The editor's root element. Callers that listen on `document` use it to ask
   * whether this editor is the visible one — several composers stay mounted at
   * once (see `composerVisibility.ts`).
   */
  getElement: () => HTMLElement | null;
  /** Append an @mention chip (and trailing space) to the current draft. */
  insertMention: (item: MentionItem) => void;
  /** Append a /skill chip (and trailing space) to the current draft. */
  insertSkill: (item: SlashItem) => void;
  /**
   * Merge label→id maps from restored tokenized content (e.g. prompt stash)
   * without wiping chips already in the live draft.
   */
  addTokenMaps: (
    mentions: Map<string, string>,
    skills: Map<string, string>,
  ) => void;
}

export interface MentionEditorProps<TItem extends MentionItem = MentionItem> {
  value: string;
  onValueChange: (value: string) => void;
  items: TItem[];
  slashItems?: SlashItem[];
  placeholder?: string;
  className?: string;
  chipClassName?: string;
  skillChipClassName?: string;
  onEnterSubmit?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /**
   * Called when image files are pasted into the editor. When provided, pasted
   * images are handed off here (as attachments) instead of being inserted as
   * text; non-image clipboard content still pastes as plain text.
   */
  onImageFiles?: (files: File[]) => void;
  /**
   * Called for large plain-text pastes. Return true when the paste was handled
   * (e.g. attached as a file) so the editor skips inline insert.
   */
  onLargeTextPaste?: (text: string) => boolean;
  /**
   * Called on Alt+ArrowUp / Alt+ArrowDown while the mention popup is closed.
   * Return true if the navigation was handled (e.g. a history entry was
   * applied) to suppress the browser default.
   */
  onHistoryNavigate?: (direction: "up" | "down") => boolean;
  /**
   * Inline AI completion shown as dim ghost text after the caret. Tab accepts it
   * (via `onAcceptSuggestion`), Escape dismisses it. Only rendered when the
   * mention/skill picker is closed, which keeps Tab's existing meaning intact.
   */
  suggestion?: string;
  /** Called on Tab while a suggestion is showing. */
  onAcceptSuggestion?: () => void;
  /** Called on Escape while a suggestion is showing. */
  onDismissSuggestion?: () => void;
  renderItem?: (item: TItem, isSelected: boolean) => ReactNode;
  renderSlashItem?: (item: SlashItem, isSelected: boolean) => ReactNode;
  filterSlashItem?: (item: SlashItem, query: string) => boolean;
  filterItem?: (item: TItem, query: string) => boolean;
  emptySlashContent?: ReactNode;
  /**
   * `caret` (default) puts a compact list next to the caret. `panel` renders a
   * full-width sheet above the nearest `[data-mention-popup-anchor]` ancestor
   * (the composer card).
   */
  popupLayout?: MentionPopupLayout;
  mentionPopupTitle?: string;
  onMentionChipClick?: (id: string) => void;
  onSkillChipClick?: (id: string) => void;
  /** Profile hover card on @mention chips in the editor (e.g. comment @people). */
  mentionChipHoverCard?: boolean;
  /** Doc/PRD preview on @mention chips (e.g. task description). */
  renderMentionChipHoverCard?: (id: string) => ReactNode;
  /** Skill preview on /skill chips. */
  renderSkillChipHoverCard?: (id: string) => ReactNode;
  dataSlot?: string;
  ariaLabel?: string;
  onBlur?: () => void;
  /** When true, sets contentEditable to false and blocks all input. */
  disabled?: boolean;
  ref?: Ref<MentionEditorHandle>;
  /**
   * Seed the editor's mention label→id map on first render. Obtain from
   * `tokenizedToEditable` when restoring persisted tokenized content.
   * Initializer-only — changes after mount are ignored.
   */
  initialMentionMap?: Map<string, string>;
  /**
   * Seed the editor's skill label→id map on first render. Obtain from
   * `tokenizedToEditable` when restoring persisted tokenized content.
   * Initializer-only — changes after mount are ignored.
   */
  initialSkillMap?: Map<string, string>;
}

interface TriggerState {
  isOpen: boolean;
  query: string;
  startIndex: number;
  kind: "mention" | "slash";
}

const CLOSED_TRIGGER: TriggerState = {
  isOpen: false,
  query: "",
  startIndex: 0,
  kind: "mention",
};

function renderRow(prefix: "@" | "/", item: MentionItem): ReactNode {
  return (
    <MentionRow
      prefix={prefix}
      label={item.label}
      description={item.description}
      badge={item.badge}
      provider={item.provider}
      kind={item.kind}
      personUserId={item.personUserId}
    />
  );
}

function defaultRenderItem(item: MentionItem, _isSelected: boolean): ReactNode {
  return renderRow("@", item);
}

function defaultRenderSlashItem(
  item: SlashItem,
  _isSelected: boolean,
): ReactNode {
  return renderRow("/", item);
}

/**
 * Substring match against the label or description. A query can never contain
 * whitespace — a space ends the `@`/`/` trigger — so one substring is enough.
 */
function matchesQuery(item: MentionItem, query: string): boolean {
  const needle = query.toLowerCase();
  if (needle.length === 0) return true;
  const haystack = `${item.label} ${item.description ?? ""}`.toLowerCase();
  return haystack.includes(needle);
}

function isValidTrigger(value: string, triggerIndex: number): boolean {
  const textAfter = value.slice(triggerIndex + 1);
  if (textAfter.includes("\n") || /\s/.test(textAfter)) {
    return false;
  }
  const charBefore = triggerIndex > 0 ? value[triggerIndex - 1] : "";
  return (
    triggerIndex === 0 || (charBefore !== undefined && /\s/.test(charBefore))
  );
}

function findActiveTrigger(
  value: string,
  hasMentions: boolean,
  hasSlash: boolean,
): TriggerState | null {
  const candidates: Array<{
    kind: "mention" | "slash";
    index: number;
  }> = [];

  if (hasMentions) {
    const atIndex = value.lastIndexOf("@");
    if (atIndex !== -1 && isValidTrigger(value, atIndex)) {
      candidates.push({ kind: "mention", index: atIndex });
    }
  }

  if (hasSlash) {
    const slashIndex = value.lastIndexOf("/");
    if (slashIndex !== -1 && isValidTrigger(value, slashIndex)) {
      candidates.push({ kind: "slash", index: slashIndex });
    }
  }

  if (candidates.length === 0) return null;

  const active = candidates.reduce((best, candidate) =>
    candidate.index >= best.index ? candidate : best,
  );

  return {
    isOpen: true,
    query: value.slice(active.index + 1),
    startIndex: active.index,
    kind: active.kind,
  };
}

export function MentionEditor<TItem extends MentionItem = MentionItem>({
  ref,
  value,
  onValueChange,
  items,
  slashItems = [],
  placeholder,
  className,
  chipClassName = MENTION_CHIP_CLASS,
  skillChipClassName = SKILL_CHIP_CLASS,
  onEnterSubmit,
  onHistoryNavigate,
  suggestion,
  onAcceptSuggestion,
  onDismissSuggestion,
  onImageFiles,
  onLargeTextPaste,
  renderItem = defaultRenderItem,
  renderSlashItem = defaultRenderSlashItem,
  filterItem = matchesQuery,
  filterSlashItem = matchesQuery,
  emptySlashContent,
  popupLayout = "caret",
  mentionPopupTitle = "Data",
  onMentionChipClick,
  onSkillChipClick,
  mentionChipHoverCard = false,
  renderMentionChipHoverCard,
  renderSkillChipHoverCard,
  dataSlot,
  ariaLabel,
  onBlur,
  disabled = false,
  initialMentionMap,
  initialSkillMap,
}: MentionEditorProps<TItem>) {
  const chipsClickable =
    onMentionChipClick !== undefined || onSkillChipClick !== undefined;
  const chipHoverEnabled =
    mentionChipHoverCard ||
    renderMentionChipHoverCard !== undefined ||
    renderSkillChipHoverCard !== undefined;
  const isPanel = popupLayout === "panel";
  const editorRef = useRef<HTMLDivElement>(null);
  /**
   * The listbox this combobox controls. One id is enough: the slash popup and
   * the mention popup are two `key`s of the same slot and only one trigger can
   * be open at a time.
   */
  const listboxId = useId();
  const [trigger, setTrigger] = useState<TriggerState>(CLOSED_TRIGGER);
  const [selectedIndex, setSelectedIndex] = useState(0);
  /**
   * The chip the last accept inserted, so the trigger scan can tell it apart
   * from a trigger the user is still typing. See `isInsertedTokenTrigger`.
   */
  const insertedTokenRef = useRef<InsertedToken | null>(null);
  const [popupPlacement, setPopupPlacement] =
    useState<MentionPopupPlacement | null>(null);
  const [mentionMap, setMentionMap] = useState<Map<string, string>>(() =>
    initialMentionMap ? new Map(initialMentionMap) : new Map(),
  );
  const [skillMap, setSkillMap] = useState<Map<string, string>>(() =>
    initialSkillMap ? new Map(initialSkillMap) : new Map(),
  );
  const [mentionHover, setMentionHover] = useState<{
    userId: string;
  } | null>(null);
  const [contentChipHover, setContentChipHover] = useState<{
    kind: "mention" | "skill";
    id: string;
  } | null>(null);
  const [mentionHoverRect, setMentionHoverRect] = useState<DOMRect | null>(
    null,
  );
  const mentionHoverChipRef = useRef<HTMLElement | null>(null);
  const mentionHoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const mentionHoverCloseTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const cancelChipHoverClose = () => {
    if (mentionHoverCloseTimerRef.current !== null) {
      clearTimeout(mentionHoverCloseTimerRef.current);
      mentionHoverCloseTimerRef.current = null;
    }
  };

  const clearChipHoverCard = () => {
    cancelChipHoverClose();
    if (mentionHoverOpenTimerRef.current !== null) {
      clearTimeout(mentionHoverOpenTimerRef.current);
      mentionHoverOpenTimerRef.current = null;
    }
    mentionHoverChipRef.current = null;
    setMentionHover(null);
    setContentChipHover(null);
    setMentionHoverRect(null);
  };

  const scheduleChipHoverClose = () => {
    cancelChipHoverClose();
    mentionHoverCloseTimerRef.current = setTimeout(() => {
      mentionHoverCloseTimerRef.current = null;
      clearChipHoverCard();
    }, 200);
  };

  const scheduleMentionHoverCard = (chip: HTMLElement) => {
    cancelChipHoverClose();
    if (mentionHoverChipRef.current === chip) return;
    mentionHoverChipRef.current = chip;
    if (mentionHoverOpenTimerRef.current !== null) {
      clearTimeout(mentionHoverOpenTimerRef.current);
    }
    const label = chip.dataset.mentionLabel;
    if (!label) return;
    const id = mentionMap.get(label);
    if (id === undefined) return;
    mentionHoverOpenTimerRef.current = setTimeout(() => {
      mentionHoverOpenTimerRef.current = null;
      setContentChipHover(null);
      setMentionHover({ userId: id });
      setMentionHoverRect(chip.getBoundingClientRect());
    }, 250);
  };

  const scheduleContentChipHoverCard = (
    chip: HTMLElement,
    kind: "mention" | "skill",
  ) => {
    cancelChipHoverClose();
    if (mentionHoverChipRef.current === chip) return;
    mentionHoverChipRef.current = chip;
    if (mentionHoverOpenTimerRef.current !== null) {
      clearTimeout(mentionHoverOpenTimerRef.current);
    }
    const label =
      kind === "mention" ? chip.dataset.mentionLabel : chip.dataset.skillLabel;
    if (!label) return;
    const id = kind === "mention" ? mentionMap.get(label) : skillMap.get(label);
    if (id === undefined) return;
    mentionHoverOpenTimerRef.current = setTimeout(() => {
      mentionHoverOpenTimerRef.current = null;
      setMentionHover(null);
      setContentChipHover({ kind, id });
      setMentionHoverRect(chip.getBoundingClientRect());
    }, 250);
  };

  /* eslint-disable no-effect/no-derived-state, no-effect/no-chain-state-updates, no-effect/no-event-handler --
     `value` is owned by whichever controller wraps the editor (send, draft pull,
     programmatic seed), so "the input was emptied" has no single call site to
     drop the token maps from. Clearing them here is the one place that catches
     every route. */
  useEffect(() => {
    if (value === "" && (mentionMap.size > 0 || skillMap.size > 0)) {
      setMentionMap(new Map());
      setSkillMap(new Map());
    }
  }, [value, mentionMap.size, skillMap.size]);
  /* eslint-enable no-effect/no-derived-state, no-effect/no-chain-state-updates, no-effect/no-event-handler */

  /* eslint-disable no-effect/no-event-handler --
     Writes chip HTML into a contenteditable and repositions the caret: the DOM
     is the external system being synchronised, not React state. */
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const domText = normalizeMentionText(extractEditableText(el));
    // A pasted/typed link URL leaves DOM text already equal to `value`, so also
    // re-render when the link-chip count is out of sync — this chips a fresh URL
    // exactly once, then stays stable during normal editing.
    const linkChipCount = el.querySelectorAll("[data-link-url]").length;
    if (domText !== value || linkChipCount !== countLinkUrls(value)) {
      el.innerHTML = renderEditorChipHtml(
        value,
        mentionMap,
        skillMap,
        chipClassName,
        skillChipClassName,
        chipsClickable,
      );
      placeCursorAtEnd(el);
    }
  }, [
    value,
    mentionMap,
    skillMap,
    chipClassName,
    skillChipClassName,
    chipsClickable,
  ]);
  /* eslint-enable no-effect/no-event-handler */

  const appendToken = (
    prefix: "@" | "/",
    item: MentionItem,
    kind: "mention" | "skill",
  ) => {
    const visible = `${prefix}${item.label}`;
    const needsSpace = value.length > 0 && !/\s$/.test(value);
    const newValue = `${value}${needsSpace ? " " : ""}${visible} `;
    insertedTokenRef.current = {
      startIndex: value.length + (needsSpace ? 1 : 0),
      token: visible,
    };
    if (kind === "mention") {
      setMentionMap((prev) => {
        const next = new Map(prev);
        next.set(item.label, item.id);
        return next;
      });
    } else {
      setSkillMap((prev) => {
        const next = new Map(prev);
        next.set(item.label, item.id);
        return next;
      });
    }
    onValueChange(newValue);
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  useImperativeHandle(
    ref,
    () => ({
      tokenize: (text: string) => {
        let result = text;
        if (mentionMap.size > 0) {
          const pattern = buildMentionPattern([...mentionMap.keys()]);
          result = result.replace(pattern, (match) => {
            const label = match.slice(1);
            const id = mentionMap.get(label);
            return id ? formatMentionToken(label, id) : match;
          });
        }
        if (skillMap.size > 0) {
          const pattern = buildSkillPattern([...skillMap.keys()]);
          result = result.replace(pattern, (match) => {
            const label = match.slice(1);
            const id = skillMap.get(label);
            return id ? formatSkillToken(label, id) : match;
          });
        }
        return result;
      },
      reset: () => {
        setMentionMap(new Map());
        setSkillMap(new Map());
      },
      focus: () => editorRef.current?.focus(),
      getElement: () => editorRef.current,
      insertMention: (item: MentionItem) => appendToken("@", item, "mention"),
      insertSkill: (item: SlashItem) => appendToken("/", item, "skill"),
      addTokenMaps: (mentions, skills) => {
        setMentionMap((prev) => new Map([...prev, ...mentions]));
        setSkillMap((prev) => new Map([...prev, ...skills]));
      },
    }),
    [mentionMap, skillMap, value, onValueChange],
  );

  // Full filtered lists — popup scrolls; do not cap (callers need every
  // doc/skill/person available, not an alphabetical first-N subset).
  const activeSlashItems = slashItems
    .filter((item) => filterSlashItem(item, trigger.query))
    .sort((a, b) => a.label.localeCompare(b.label));

  const activeMentionItems = items
    .filter((item) => filterItem(item, trigger.query))
    .sort((a, b) => a.label.localeCompare(b.label));

  const popupItems =
    trigger.kind === "slash" ? activeSlashItems : activeMentionItems;

  const closeTrigger = () => {
    setTrigger((prev) => (prev.isOpen ? CLOSED_TRIGGER : prev));
    setSelectedIndex(0);
  };

  const insertMentionItem = (item: TItem) => {
    const visible = `@${item.label}`;
    const before = value.slice(0, trigger.startIndex);
    const after = value.slice(trigger.startIndex + trigger.query.length + 1);
    const newValue = before + visible + " " + after;
    insertedTokenRef.current = {
      startIndex: trigger.startIndex,
      token: visible,
    };
    setMentionMap((prev) => {
      const next = new Map(prev);
      next.set(item.label, item.id);
      return next;
    });
    onValueChange(newValue);
    closeTrigger();
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  const insertSlashItem = (item: SlashItem) => {
    const visible = `/${item.label}`;
    const before = value.slice(0, trigger.startIndex);
    const after = value.slice(trigger.startIndex + trigger.query.length + 1);
    const newValue = before + visible + " " + after;
    insertedTokenRef.current = {
      startIndex: trigger.startIndex,
      token: visible,
    };
    setSkillMap((prev) => {
      const next = new Map(prev);
      next.set(item.label, item.id);
      return next;
    });
    onValueChange(newValue);
    closeTrigger();
    requestAnimationFrame(() => editorRef.current?.focus());
  };

  const insertActiveItem = () => {
    if (trigger.kind === "slash") {
      const item = activeSlashItems[selectedIndex];
      if (item) insertSlashItem(item);
      return;
    }
    const item = activeMentionItems[selectedIndex];
    if (item) insertMentionItem(item);
  };

  /* eslint-disable no-effect/no-adjust-state-on-prop-change, no-effect/no-pass-data-to-parent, no-effect/no-event-handler --
     The open trigger is not a pure function of `value`: `insertedTokenRef` has
     to be released across renders so the chip an accept just wrote is not read
     back as a trigger the user is typing. Deriving it during render would
     mutate that ref while rendering. */
  useEffect(() => {
    const next = findActiveTrigger(
      value,
      items.length > 0,
      slashItems.length > 0 || emptySlashContent !== undefined,
    );
    // Released only once the chip stops being there — a healthy accept leaves no
    // trigger at all for a pass or two, so releasing on that would drop the
    // guard before the keystroke it exists to catch.
    const inserted = insertedTokenRef.current;
    if (
      inserted !== null &&
      !value.startsWith(inserted.token, inserted.startIndex)
    ) {
      insertedTokenRef.current = null;
    }
    // The chip the last accept inserted is not a trigger the user is typing,
    // even when it reads like one because its trailing space was lost.
    const isChipEcho =
      next !== null &&
      isInsertedTokenTrigger(value, next.startIndex, insertedTokenRef.current);
    if (next === null || isChipEcho) {
      setTrigger((prev) => (prev.isOpen ? CLOSED_TRIGGER : prev));
      return;
    }
    setTrigger(next);
    setSelectedIndex(0);
  }, [value, items.length, slashItems.length, emptySlashContent]);
  /* eslint-enable no-effect/no-adjust-state-on-prop-change, no-effect/no-pass-data-to-parent, no-effect/no-event-handler */

  /* eslint-disable no-effect/no-adjust-state-on-prop-change --
     Popup placement is measured from live layout (viewport rects, anchor
     element), so it can only be computed after the browser has laid the trigger
     out — not during render. */
  useEffect(() => {
    if (!trigger.isOpen) {
      setPopupPlacement(null);
      return;
    }
    let attached = false;
    const update = () => {
      if (document.visibilityState !== "visible") return;
      requestAnimationFrame(() => {
        const el = editorRef.current;
        if (!el) return;
        const panelAnchor = isPanel
          ? el.closest("[data-mention-popup-anchor]")
          : null;
        setPopupPlacement(
          panelAnchor
            ? computePanelPopupPlacement(panelAnchor.getBoundingClientRect())
            : computeMentionPopupPlacement(getSelectionAnchorRect(el)),
        );
      });
    };
    const syncLayoutListeners = () => {
      const shouldAttach = document.visibilityState === "visible";
      if (shouldAttach && !attached) {
        window.addEventListener("scroll", update, true);
        window.addEventListener("resize", update);
        attached = true;
      } else if (!shouldAttach && attached) {
        window.removeEventListener("scroll", update, true);
        window.removeEventListener("resize", update);
        attached = false;
      }
    };
    const onVisibilityChange = () => {
      syncLayoutListeners();
      update();
    };
    update();
    syncLayoutListeners();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (attached) {
        window.removeEventListener("scroll", update, true);
        window.removeEventListener("resize", update);
      }
    };
  }, [trigger.isOpen, trigger.query, trigger.startIndex, value, isPanel]);
  /* eslint-enable no-effect/no-adjust-state-on-prop-change */

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    const text = normalizeMentionText(extractEditableText(el));
    if (text !== value) {
      onValueChange(text);
    }
  };

  /**
   * Arrow/Enter/Tab/Escape from the editor while the picker is open. The caret
   * never leaves the editor — the picker has nothing focusable in it — so this
   * is the only path that navigates the list.
   */
  const handlePickerKeyDown = (
    e: React.KeyboardEvent<HTMLElement>,
  ): boolean => {
    if (!trigger.isOpen) return false;
    if (popupItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev >= popupItems.length - 1 ? 0 : prev + 1,
        );
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev <= 0 ? popupItems.length - 1 : prev - 1,
        );
        return true;
      }
      if (e.key === "Enter") {
        if (e.nativeEvent.isComposing) return true;
        e.preventDefault();
        e.stopPropagation();
        insertActiveItem();
        return true;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        insertActiveItem();
        return true;
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeTrigger();
      editorRef.current?.focus();
      return true;
    }
    return false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const showEmptySlash =
      trigger.isOpen &&
      trigger.kind === "slash" &&
      popupItems.length === 0 &&
      emptySlashContent !== undefined;

    if (
      trigger.isOpen &&
      (popupItems.length > 0 || showEmptySlash) &&
      handlePickerKeyDown(e)
    ) {
      return;
    }

    // Inline AI completion. Sits after the picker block so the picker keeps
    // priority on Tab, and before history recall so Escape reaches it.
    if (suggestion && !trigger.isOpen) {
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        onAcceptSuggestion?.();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onDismissSuggestion?.();
        return;
      }
    }

    // Message-history recall: Alt+Up/Down so plain arrows stay for caret
    // movement in multi-line drafts. Skip when the mention picker is open.
    if (
      onHistoryNavigate &&
      !trigger.isOpen &&
      e.altKey &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      if (e.key === "ArrowUp") {
        if (onHistoryNavigate("up")) {
          e.preventDefault();
          return;
        }
      }
      if (e.key === "ArrowDown") {
        if (onHistoryNavigate("down")) {
          e.preventDefault();
          return;
        }
      }
    }

    if (e.key === "Enter" && onEnterSubmit) {
      if (e.nativeEvent.isComposing) return;
      if (e.shiftKey) return;
      e.preventDefault();
      onEnterSubmit(e);
    }
  };

  const handleBlur = () => {
    if (trigger.isOpen) closeTrigger();
    if (chipHoverEnabled) clearChipHoverCard();
    onBlur?.();
  };

  const handleEditorMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chipHoverEnabled) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const mentionChip = target.closest("[data-mention-label]");
    if (mentionChip instanceof HTMLElement) {
      if (mentionChipHoverCard) {
        scheduleMentionHoverCard(mentionChip);
      } else if (renderMentionChipHoverCard) {
        scheduleContentChipHoverCard(mentionChip, "mention");
      }
      return;
    }
    const skillChip = target.closest("[data-skill-label]");
    if (
      skillChip instanceof HTMLElement &&
      renderSkillChipHoverCard !== undefined
    ) {
      scheduleContentChipHoverCard(skillChip, "skill");
    }
  };

  const handleEditorMouseOut = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chipHoverEnabled) return;
    const related = e.relatedTarget;
    if (related instanceof Element) {
      if (
        related.closest("[data-mention-label]") !== null ||
        related.closest("[data-skill-label]") !== null ||
        related.closest("[data-mention-hover-card]") !== null
      ) {
        return;
      }
    }
    scheduleChipHoverClose();
  };

  useEffect(() => {
    if ((!mentionHover && !contentChipHover) || !mentionHoverRect) return;
    let attached = false;
    const updateRect = () => {
      if (document.visibilityState !== "visible") return;
      const chip = mentionHoverChipRef.current;
      if (chip) {
        setMentionHoverRect(chip.getBoundingClientRect());
      }
    };
    const syncLayoutListeners = () => {
      const shouldAttach = document.visibilityState === "visible";
      if (shouldAttach && !attached) {
        window.addEventListener("scroll", updateRect, true);
        window.addEventListener("resize", updateRect);
        attached = true;
      } else if (!shouldAttach && attached) {
        window.removeEventListener("scroll", updateRect, true);
        window.removeEventListener("resize", updateRect);
        attached = false;
      }
    };
    const onVisibilityChange = () => {
      syncLayoutListeners();
      updateRect();
    };
    syncLayoutListeners();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (attached) {
        window.removeEventListener("scroll", updateRect, true);
        window.removeEventListener("resize", updateRect);
      }
    };
  }, [mentionHover, contentChipHover, mentionHoverRect]);

  useEffect(() => {
    return () => {
      if (mentionHoverOpenTimerRef.current !== null) {
        clearTimeout(mentionHoverOpenTimerRef.current);
      }
      if (mentionHoverCloseTimerRef.current !== null) {
        clearTimeout(mentionHoverCloseTimerRef.current);
      }
    };
  }, []);

  const handleChipClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    // Link chips open externally and are always clickable, independent of the
    // mention/skill click handlers.
    const linkChip = target.closest("[data-link-url]");
    if (linkChip instanceof HTMLElement) {
      const url = linkChip.dataset.linkUrl;
      if (url) {
        e.preventDefault();
        e.stopPropagation();
        window.open(url, "_blank", "noopener,noreferrer");
      }
      return;
    }

    const mentionChip = target.closest("[data-mention-label]");
    if (mentionChip instanceof HTMLElement && onMentionChipClick) {
      const label = mentionChip.dataset.mentionLabel;
      if (label) {
        const id = mentionMap.get(label);
        if (id !== undefined) {
          e.preventDefault();
          e.stopPropagation();
          onMentionChipClick(id);
        }
      }
      return;
    }

    const skillChip = target.closest("[data-skill-label]");
    if (skillChip instanceof HTMLElement && onSkillChipClick) {
      const label = skillChip.dataset.skillLabel;
      if (label) {
        const id = skillMap.get(label);
        if (id !== undefined) {
          e.preventDefault();
          e.stopPropagation();
          onSkillChipClick(id);
        }
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    // Hand pasted image files to the attachment handler instead of inserting
    // them as text. Only images are intercepted; other files fall through.
    if (onImageFiles) {
      const imageFiles: File[] = [];
      for (const item of e.clipboardData.items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        onImageFiles(imageFiles);
        return;
      }
    }
    const plainText = e.clipboardData.getData("text/plain");
    if (onLargeTextPaste && onLargeTextPaste(plainText)) {
      e.preventDefault();
      return;
    }
    // Keep plain-text-only paste (strip HTML), but join the browser undo stack.
    // Manual range.insertNode bypasses undo, so Ctrl+Z undid prior typing
    // instead of the paste.
    e.preventDefault();
    if (plainText.length === 0) return;
    if (document.execCommand("insertText", false, plainText)) {
      handleInput();
      return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(plainText));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    handleInput();
  };

  const isEmpty = isEditorValueEmpty(value);

  // Gated on the *unfiltered* list so a query that matches nothing shows "No
  // matches" instead of unmounting the popup.
  const showPopup =
    trigger.isOpen &&
    (trigger.kind === "slash"
      ? slashItems.length > 0 || emptySlashContent !== undefined
      : items.length > 0);

  const popupTitle = trigger.kind === "slash" ? "Skills" : mentionPopupTitle;

  // The row the arrow keys are on, named for `aria-activedescendant`. Only the
  // popup that is actually rendered has one.
  const activeItem = showPopup ? popupItems[selectedIndex] : undefined;

  const sharedPopupProps = {
    title: popupTitle,
    listboxId,
    selectedIndex,
  };

  const pickerPopup =
    showPopup && popupPlacement ? (
      trigger.kind === "slash" ? (
        <MentionPickerPopup
          key="slash"
          {...sharedPopupProps}
          placement={popupPlacement}
          items={activeSlashItems}
          renderItem={renderSlashItem}
          onSelectItem={insertSlashItem}
          emptyContent={slashItems.length === 0 ? emptySlashContent : undefined}
        />
      ) : (
        <MentionPickerPopup
          key="mention"
          {...sharedPopupProps}
          placement={popupPlacement}
          items={activeMentionItems}
          renderItem={renderItem}
          onSelectItem={insertMentionItem}
        />
      )
    ) : null;

  const chipHoverCardContent =
    mentionHover && mentionChipHoverCard ? (
      <UserProfileHoverCardBody userId={mentionHover.userId} />
    ) : contentChipHover?.kind === "mention" &&
      renderMentionChipHoverCard !== undefined ? (
      renderMentionChipHoverCard(contentChipHover.id)
    ) : contentChipHover?.kind === "skill" &&
      renderSkillChipHoverCard !== undefined ? (
      renderSkillChipHoverCard(contentChipHover.id)
    ) : null;

  const chipHoverCard =
    chipHoverCardContent && mentionHoverRect && typeof document !== "undefined"
      ? createPortal(
          <div
            data-mention-hover-card="true"
            className="fixed z-50 flex w-72 max-w-[calc(100vw-1rem)] flex-col-reverse items-stretch"
            style={{
              left: mentionHoverRect.left,
              bottom: window.innerHeight - mentionHoverRect.top,
            }}
            onMouseEnter={cancelChipHoverClose}
            onMouseLeave={scheduleChipHoverClose}
          >
            <div className="h-3 shrink-0" aria-hidden />
            {chipHoverCardContent}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        ref={editorRef}
        data-slot={dataSlot}
        data-placeholder={placeholder ?? ""}
        data-empty={isEmpty ? "true" : undefined}
        data-suggestion={suggestion}
        contentEditable={!disabled}
        suppressContentEditableWarning
        /* ARIA 1.2 combobox: the editor is the input, the picker is the popup
           it controls, and `aria-activedescendant` is how a screen reader is
           told which row ArrowUp/ArrowDown moved to — the picker rows keep DOM
           focus out of it entirely. Without these the popup opened silently. */
        role="combobox"
        aria-multiline="true"
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-expanded={showPopup}
        aria-controls={showPopup ? listboxId : undefined}
        aria-activedescendant={
          activeItem ? optionId(listboxId, activeItem.id) : undefined
        }
        aria-disabled={disabled ? "true" : undefined}
        aria-label={ariaLabel ?? placeholder ?? "Editor"}
        className={cn(
          DEFAULT_EDITOR_CLASS,
          // `role="combobox"` opts into the base-layer pointer cursor meant for
          // pickers. This one is typed into, so put the caret back — while
          // leaving a disabled editor on the base `not-allowed`.
          disabled ? undefined : "cursor-text",
          className,
        )}
        onInput={disabled ? undefined : handleInput}
        onKeyDown={disabled ? undefined : handleKeyDown}
        onClick={disabled ? undefined : handleChipClick}
        onMouseOver={chipHoverEnabled ? handleEditorMouseOver : undefined}
        onMouseOut={chipHoverEnabled ? handleEditorMouseOut : undefined}
        onBlur={disabled ? undefined : handleBlur}
        onPaste={disabled ? undefined : handlePaste}
      />
      {/* `AnimatePresence` is portalled unconditionally, with the popup as its
          conditional child: gating the portal on `pickerPopup` would unmount the
          presence boundary in the same commit that removes the popup, and the
          exit animation would never run. */}
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>{pickerPopup}</AnimatePresence>,
            document.body,
          )
        : null}
      {chipHoverCard}
    </>
  );
}
