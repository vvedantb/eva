import { z } from "zod";
import { jsonParser, persistedStore } from "@/storage/persistedStore";

/**
 * The page for a `?section=` param, else the first. Keep this lookup out of a
 * screen's body: inline, a `findIndex` on a pill list that is sometimes the
 * module constant and sometimes a filtered copy made the React Compiler bail
 * on the whole screen ("MethodCall::property must be an unpromoted +
 * unmemoized MemberExpression"), so every change redrew the tab in full.
 */
export function sectionIndex(sections: ReadonlyArray<{ id: string }>, param: string | undefined): number {
  return Math.max(0, sections.findIndex((option) => option.id === param));
}

/**
 * The section each tab last showed, kept on the device: a tab opened with no
 * `?section=` (a fresh launch) starts on it, as the web reopens the last page.
 */
export const lastTabSection = persistedStore<string | null>("tabSection", null, jsonParser(z.string().nullable()));
